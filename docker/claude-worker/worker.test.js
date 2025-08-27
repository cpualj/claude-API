import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import { spawn } from 'child_process';

// Mock child_process spawn
vi.mock('child_process', () => ({
  spawn: vi.fn()
}));

// ClaudeWorker class (extracted for testing)
class ClaudeWorker extends EventEmitter {
  constructor(accountConfig) {
    super();
    this.accountId = accountConfig.id;
    this.accountEmail = accountConfig.email;
    this.isAuthenticated = false;
    this.busy = false;
    this.stats = {
      requestsProcessed: 0,
      totalTokensUsed: 0,
      averageResponseTime: 0,
      lastUsed: null
    };
  }

  async authenticate(apiKey) {
    return new Promise((resolve, reject) => {
      const authProcess = spawn('claude', ['auth', 'login', '--api-key', apiKey], {
        env: {
          ...process.env,
          CLAUDE_API_KEY: apiKey
        }
      });

      authProcess.on('close', (code) => {
        if (code === 0) {
          this.isAuthenticated = true;
          console.log(`✅ Worker ${this.accountId} authenticated`);
          resolve(true);
        } else {
          reject(new Error(`Authentication failed for ${this.accountId}`));
        }
      });
    });
  }

  async processRequest(message, options = {}) {
    if (!this.isAuthenticated) {
      throw new Error('Worker not authenticated');
    }

    if (this.busy) {
      throw new Error('Worker is busy');
    }

    this.busy = true;
    const startTime = Date.now();

    try {
      const result = await this.callClaude(message, options);
      
      // Update statistics
      const responseTime = Date.now() - startTime;
      this.updateStats(responseTime, result);
      
      return result;
    } finally {
      this.busy = false;
      this.stats.lastUsed = new Date();
    }
  }

  async callClaude(message, options) {
    return new Promise((resolve, reject) => {
      const args = ['--print'];
      
      if (options.model) {
        args.push('--model', options.model);
      }
      
      args.push(message);

      const claudeProcess = spawn('claude', args, {
        env: { ...process.env }
      });

      let output = '';
      let error = '';

      claudeProcess.stdout.on('data', (data) => {
        output += data.toString();
      });

      claudeProcess.stderr.on('data', (data) => {
        error += data.toString();
      });

      claudeProcess.on('close', (code) => {
        if (code === 0) {
          resolve({
            content: output.trim(),
            accountId: this.accountId,
            timestamp: new Date()
          });
        } else {
          reject(new Error(`Claude error: ${error}`));
        }
      });
    });
  }

  updateStats(responseTime, result) {
    this.stats.requestsProcessed++;
    this.stats.totalTokensUsed += this.estimateTokens(result.content);
    
    // Calculate running average
    const n = this.stats.requestsProcessed;
    this.stats.averageResponseTime = 
      (this.stats.averageResponseTime * (n - 1) + responseTime) / n;
  }

  estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  getStatus() {
    return {
      accountId: this.accountId,
      accountEmail: this.accountEmail,
      authenticated: this.isAuthenticated,
      busy: this.busy,
      stats: this.stats
    };
  }
}

describe('ClaudeWorker', () => {
  let worker;
  let mockSpawnProcess;

  beforeEach(() => {
    worker = new ClaudeWorker({
      id: 'test-worker',
      email: 'test@example.com'
    });

    // Create mock spawn process
    mockSpawnProcess = new EventEmitter();
    mockSpawnProcess.stdout = new EventEmitter();
    mockSpawnProcess.stderr = new EventEmitter();
    
    spawn.mockReturnValue(mockSpawnProcess);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct properties', () => {
      expect(worker.accountId).toBe('test-worker');
      expect(worker.accountEmail).toBe('test@example.com');
      expect(worker.isAuthenticated).toBe(false);
      expect(worker.busy).toBe(false);
      expect(worker.stats.requestsProcessed).toBe(0);
    });
  });

  describe('authenticate', () => {
    it('should authenticate successfully', async () => {
      const authPromise = worker.authenticate('test-api-key');
      
      // Simulate successful authentication
      setTimeout(() => {
        mockSpawnProcess.emit('close', 0);
      }, 10);

      await authPromise;
      
      expect(worker.isAuthenticated).toBe(true);
      expect(spawn).toHaveBeenCalledWith(
        'claude',
        ['auth', 'login', '--api-key', 'test-api-key'],
        expect.objectContaining({
          env: expect.objectContaining({
            CLAUDE_API_KEY: 'test-api-key'
          })
        })
      );
    });

    it('should handle authentication failure', async () => {
      const authPromise = worker.authenticate('invalid-key');
      
      // Simulate failed authentication
      setTimeout(() => {
        mockSpawnProcess.emit('close', 1);
      }, 10);

      await expect(authPromise).rejects.toThrow('Authentication failed');
      expect(worker.isAuthenticated).toBe(false);
    });
  });

  describe('processRequest', () => {
    beforeEach(() => {
      // Mark worker as authenticated
      worker.isAuthenticated = true;
    });

    it('should throw error if not authenticated', async () => {
      worker.isAuthenticated = false;
      
      await expect(worker.processRequest('test message'))
        .rejects.toThrow('Worker not authenticated');
    });

    it('should throw error if worker is busy', async () => {
      worker.busy = true;
      
      await expect(worker.processRequest('test message'))
        .rejects.toThrow('Worker is busy');
    });

    it('should process request successfully', async () => {
      const requestPromise = worker.processRequest('test message');
      
      // Simulate Claude response
      setTimeout(() => {
        mockSpawnProcess.stdout.emit('data', 'Claude response');
        mockSpawnProcess.emit('close', 0);
      }, 10);

      const result = await requestPromise;
      
      expect(result.content).toBe('Claude response');
      expect(result.accountId).toBe('test-worker');
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(worker.stats.requestsProcessed).toBe(1);
    });

    it('should handle Claude errors', async () => {
      const requestPromise = worker.processRequest('test message');
      
      // Simulate Claude error
      setTimeout(() => {
        mockSpawnProcess.stderr.emit('data', 'Error message');
        mockSpawnProcess.emit('close', 1);
      }, 10);

      await expect(requestPromise).rejects.toThrow('Claude error: Error message');
    });

    it('should set busy flag during processing', async () => {
      const requestPromise = worker.processRequest('test message');
      
      // Check busy flag is set
      expect(worker.busy).toBe(true);
      
      // Simulate Claude response
      setTimeout(() => {
        mockSpawnProcess.stdout.emit('data', 'Response');
        mockSpawnProcess.emit('close', 0);
      }, 10);

      await requestPromise;
      
      // Check busy flag is cleared
      expect(worker.busy).toBe(false);
    });

    it('should pass model option to Claude', async () => {
      const requestPromise = worker.processRequest('test message', { model: 'claude-3' });
      
      setTimeout(() => {
        mockSpawnProcess.stdout.emit('data', 'Response');
        mockSpawnProcess.emit('close', 0);
      }, 10);

      await requestPromise;
      
      expect(spawn).toHaveBeenCalledWith(
        'claude',
        ['--print', '--model', 'claude-3', 'test message'],
        expect.any(Object)
      );
    });
  });

  describe('updateStats', () => {
    it('should update statistics correctly', () => {
      const result = { content: 'Test response content' };
      
      worker.updateStats(100, result);
      
      expect(worker.stats.requestsProcessed).toBe(1);
      expect(worker.stats.averageResponseTime).toBe(100);
      expect(worker.stats.totalTokensUsed).toBeGreaterThan(0);
    });

    it('should calculate running average correctly', () => {
      worker.updateStats(100, { content: 'Response 1' });
      worker.updateStats(200, { content: 'Response 2' });
      worker.updateStats(300, { content: 'Response 3' });
      
      expect(worker.stats.requestsProcessed).toBe(3);
      expect(worker.stats.averageResponseTime).toBe(200); // (100+200+300)/3
    });
  });

  describe('estimateTokens', () => {
    it('should estimate tokens based on text length', () => {
      expect(worker.estimateTokens('test')).toBe(1); // 4 chars = 1 token
      expect(worker.estimateTokens('12345678')).toBe(2); // 8 chars = 2 tokens
      expect(worker.estimateTokens('123456789')).toBe(3); // 9 chars = 3 tokens (ceil)
    });
  });

  describe('getStatus', () => {
    it('should return complete worker status', () => {
      worker.isAuthenticated = true;
      worker.busy = false;
      worker.stats.requestsProcessed = 5;
      
      const status = worker.getStatus();
      
      expect(status).toEqual({
        accountId: 'test-worker',
        accountEmail: 'test@example.com',
        authenticated: true,
        busy: false,
        stats: worker.stats
      });
    });
  });
});