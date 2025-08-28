import { spawn, exec } from 'child_process';
import EventEmitter from 'events';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class ClaudeService extends EventEmitter {
  constructor() {
    super();
    this.activeProcesses = new Map();
  }

  /**
   * Send a message to Claude CLI and get response
   * @param {string} message - The message to send
   * @param {object} options - Options for the request
   * @returns {Promise<object>} - The response from Claude
   */
  async sendMessage(message, options = {}) {
    const {
      sessionId = 'default',
      stream = false,
      maxTokens = 4096,
      temperature = 0.7
    } = options;

    return new Promise((resolve, reject) => {
      // Use stdin to send the message
      const claudeProcess = spawn('claude', [], {
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let error = '';
      const startTime = Date.now();

      // Send the message via stdin
      claudeProcess.stdin.write(message);
      claudeProcess.stdin.end();

      // Handle streaming
      if (stream) {
        claudeProcess.stdout.on('data', (data) => {
          const chunk = data.toString();
          output += chunk;
          this.emit('stream', {
            sessionId,
            chunk,
            timestamp: new Date()
          });
        });
      } else {
        claudeProcess.stdout.on('data', (data) => {
          output += data.toString();
        });
      }

      claudeProcess.stderr.on('data', (data) => {
        error += data.toString();
      });

      // Set a timeout for the process
      const timeout = setTimeout(() => {
        claudeProcess.kill('SIGKILL');
        reject(new Error('Claude CLI timeout after 30 seconds'));
      }, 30000);

      claudeProcess.on('close', (code) => {
        clearTimeout(timeout);
        const endTime = Date.now();
        const duration = endTime - startTime;

        if (code !== 0 && code !== null) {
          reject(new Error(`Claude process exited with code ${code}: ${error}`));
        } else {
          // Parse the output and create response
          const response = {
            id: `msg-${Date.now()}`,
            content: output.trim() || 'No response received',
            usage: {
              inputTokens: this.estimateTokens(message),
              outputTokens: this.estimateTokens(output),
              totalTokens: this.estimateTokens(message) + this.estimateTokens(output)
            },
            model: 'claude-3-opus-20240229',
            sessionId,
            duration,
            timestamp: new Date()
          };

          resolve(response);
        }
      });

      claudeProcess.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to start Claude process: ${err.message}`));
      });

      // Store process for potential cancellation
      this.activeProcesses.set(sessionId, claudeProcess);
    });
  }

  /**
   * Alternative method using temp file
   * @param {string} message - The message to send
   * @param {object} options - Options for the request
   * @returns {Promise<object>} - The response from Claude
   */
  async sendMessageViaFile(message, options = {}) {
    const {
      sessionId = 'default',
      stream = false
    } = options;

    try {
      const startTime = Date.now();
      
      // Create a temporary file with the message
      const tempDir = path.join(__dirname, '..', 'temp');
      await fs.mkdir(tempDir, { recursive: true });
      
      const tempFile = path.join(tempDir, `claude-input-${Date.now()}.txt`);
      await fs.writeFile(tempFile, message, 'utf8');
      
      // Use claude with the file
      const { stdout, stderr } = await execAsync(`claude < "${tempFile}"`, {
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });
      
      // Clean up temp file
      await fs.unlink(tempFile).catch(() => {});
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      if (stderr && !stdout) {
        throw new Error(`Claude error: ${stderr}`);
      }
      
      const response = {
        id: `msg-${Date.now()}`,
        content: stdout.trim() || 'No response received',
        role: 'assistant',
        usage: {
          inputTokens: this.estimateTokens(message),
          outputTokens: this.estimateTokens(stdout),
          totalTokens: this.estimateTokens(message) + this.estimateTokens(stdout)
        },
        model: 'claude-3-opus-20240229',
        sessionId,
        duration,
        timestamp: new Date()
      };
      
      return response;
      
    } catch (error) {
      console.error('Claude file method error:', error);
      throw error;
    }
  }

  /**
   * Send a chat message with context
   * @param {string} message - The message to send
   * @param {array} context - Previous messages for context
   * @param {object} options - Options for the request
   * @returns {Promise<object>} - The response
   */
  async chat(message, context = [], options = {}) {
    // Build context string
    let contextString = '';
    if (context && context.length > 0) {
      contextString = context.map(msg => {
        return `${msg.role}: ${msg.content}`;
      }).join('\n') + '\n';
    }

    const fullMessage = contextString + `User: ${message}`;
    
    try {
      // Try the file method first as it might be more reliable
      const response = await this.sendMessageViaFile(fullMessage, options);
      
      // Add role to response
      response.role = 'assistant';
      
      return response;
    } catch (error) {
      console.error('Claude chat error:', error);
      
      // If Claude fails, try the direct method
      try {
        const response = await this.sendMessage(fullMessage, options);
        response.role = 'assistant';
        return response;
      } catch (fallbackError) {
        console.error('Claude fallback error:', fallbackError);
        throw error; // Throw original error
      }
    }
  }

  /**
   * Cancel an active session
   * @param {string} sessionId - The session to cancel
   */
  cancelSession(sessionId) {
    const process = this.activeProcesses.get(sessionId);
    if (process) {
      process.kill('SIGTERM');
      this.activeProcesses.delete(sessionId);
      return true;
    }
    return false;
  }

  /**
   * Estimate token count (rough approximation)
   * @param {string} text - Text to estimate
   * @returns {number} - Estimated token count
   */
  estimateTokens(text) {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if Claude CLI is available
   * @returns {Promise<boolean>}
   */
  async checkAvailability() {
    try {
      const { stdout } = await execAsync('claude --version', { timeout: 5000 });
      return stdout.includes('Claude');
    } catch (error) {
      console.error('Claude availability check failed:', error.message);
      return false;
    }
  }

  /**
   * Get Claude CLI version
   * @returns {Promise<string>}
   */
  async getVersion() {
    try {
      const { stdout } = await execAsync('claude --version', { timeout: 5000 });
      return stdout.trim();
    } catch (error) {
      console.error('Failed to get Claude version:', error);
      throw error;
    }
  }
}

// Create singleton instance
const claudeService = new ClaudeService();

export default claudeService;