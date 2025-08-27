import { spawn } from 'child_process';
import EventEmitter from 'events';

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
      const args = [
        '--print',  // Use print mode for non-interactive output
        message
      ];

      // Note: Claude CLI doesn't have --max-tokens or --temperature options

      const claudeProcess = spawn('claude', args, {
        shell: true,
        env: { ...process.env }
      });

      let output = '';
      let error = '';
      const startTime = Date.now();

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

      claudeProcess.on('close', (code) => {
        const endTime = Date.now();
        const duration = endTime - startTime;

        if (code !== 0) {
          reject(new Error(`Claude process exited with code ${code}: ${error}`));
        } else {
          // Parse the output and create response
          const response = {
            id: `msg-${Date.now()}`,
            content: output.trim(),
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
        reject(new Error(`Failed to start Claude process: ${err.message}`));
      });

      // Store process for potential cancellation
      this.activeProcesses.set(sessionId, claudeProcess);
    });
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
      const response = await this.sendMessage(fullMessage, options);
      
      // Add role to response
      response.role = 'assistant';
      
      return response;
    } catch (error) {
      console.error('Claude chat error:', error);
      throw error;
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
    return new Promise((resolve) => {
      const checkProcess = spawn('claude', ['--version'], {
        shell: true
      });

      checkProcess.on('close', (code) => {
        resolve(code === 0);
      });

      checkProcess.on('error', () => {
        resolve(false);
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        checkProcess.kill();
        resolve(false);
      }, 5000);
    });
  }

  /**
   * Get Claude CLI version
   * @returns {Promise<string>}
   */
  async getVersion() {
    return new Promise((resolve, reject) => {
      const versionProcess = spawn('claude', ['--version'], {
        shell: true
      });

      let output = '';

      versionProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      versionProcess.on('close', (code) => {
        if (code === 0) {
          resolve(output.trim());
        } else {
          reject(new Error('Failed to get Claude version'));
        }
      });

      versionProcess.on('error', (err) => {
        reject(err);
      });
    });
  }
}

// Create singleton instance
const claudeService = new ClaudeService();

export default claudeService;