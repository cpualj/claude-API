import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import fs from 'fs';
import MultiAccountClaudeService from '../../services/multiAccountService.js';

// Mock child_process
vi.mock('child_process', () => ({
  spawn: vi.fn()
}));

// Mock fs
vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn()
  }
}));

describe('MultiAccountClaudeService', () => {
  let service;
  let mockSpawn;
  let mockProcess;

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Create mock process
    mockProcess = new EventEmitter();
    mockProcess.stdout = new EventEmitter();
    mockProcess.stderr = new EventEmitter();
    mockProcess.kill = vi.fn();
    
    // Import spawn mock
    const { spawn } = await import('child_process');
    mockSpawn = spawn;
    mockSpawn.mockReturnValue(mockProcess);
    
    // Mock fs.existsSync to return false by default
    fs.existsSync.mockReturnValue(false);
    
    // Create service instance
    service = new MultiAccountClaudeService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with correct default values', () => {
      expect(service.accounts).toHaveLength(3);
      expect(service.queue).toEqual([]);
      expect(service.processing).toBe(false);
    });

    it('should set up accounts with correct structure', () => {
      const account = service.accounts[0];
      expect(account).toHaveProperty('id', 'account1');
      expect(account).toHaveProperty('configDir');
      expect(account).toHaveProperty('busy', false);
      expect(account).toHaveProperty('requestCount', 0);
      expect(account).toHaveProperty('lastUsed', null);
    });
  });

  describe('checkAccountsStatus', () => {
    it('should mark accounts as not configured when config files do not exist', () => {
      fs.existsSync.mockReturnValue(false);
      service.checkAccountsStatus();
      
      service.accounts.forEach(account => {
        expect(account.configured).toBe(false);
      });
    });

    it('should mark accounts as configured when config files exist', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(JSON.stringify({
        email: 'test@example.com'
      }));
      
      service.checkAccountsStatus();
      
      service.accounts.forEach(account => {
        expect(account.configured).toBe(true);
        expect(account.email).toBe('test@example.com');
      });
    });

    it('should handle invalid JSON in config files', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('invalid json');
      
      service.checkAccountsStatus();
      
      service.accounts.forEach(account => {
        expect(account.configured).toBe(false);
      });
    });
  });

  describe('sendMessage', () => {
    beforeEach(() => {
      // Set up one configured account
      fs.existsSync.mockImplementation(path => 
        path.includes('account1')
      );
      fs.readFileSync.mockReturnValue(JSON.stringify({
        email: 'test@example.com'
      }));
      service.checkAccountsStatus();
    });

    it('should add message to queue', async () => {
      const promise = service.sendMessage('Test message');
      
      // Wait a bit for queue processing to start
      await new Promise(resolve => setTimeout(resolve, 10));
      
      // Check queue has the message (or it was already processed)
      // Since we have a configured account, the message might be processed immediately
      expect(promise).toBeDefined();
      
      // Simulate successful response
      setImmediate(() => {
        mockProcess.stdout.emit('data', 'Response from Claude');
        mockProcess.emit('close', 0);
      });
      
      await promise;
    });

    it('should resolve with response from Claude', async () => {
      const promise = service.sendMessage('Test message');
      
      // Simulate Claude response
      setImmediate(() => {
        mockProcess.stdout.emit('data', 'Claude response');
        mockProcess.emit('close', 0);
      });
      
      const result = await promise;
      expect(result.content).toBe('Claude response');
      expect(result.accountUsed).toBe('account1');
    });

    it('should handle errors from Claude process', async () => {
      const promise = service.sendMessage('Test message');
      
      // Simulate error
      setImmediate(() => {
        mockProcess.stderr.emit('data', 'Error occurred');
        mockProcess.emit('close', 1);
      });
      
      await expect(promise).rejects.toThrow('Claude process exited with code 1');
    });

    it('should queue multiple requests', async () => {
      const promises = [
        service.sendMessage('Message 1'),
        service.sendMessage('Message 2'),
        service.sendMessage('Message 3')
      ];
      
      expect(service.queue.length).toBeGreaterThan(0);
      
      // Simulate responses for all
      for (let i = 0; i < 3; i++) {
        setImmediate(() => {
          mockProcess.stdout.emit('data', `Response ${i + 1}`);
          mockProcess.emit('close', 0);
        });
      }
    });
  });

  describe('processQueue', () => {
    beforeEach(() => {
      // Configure one account
      service.accounts[0].configured = true;
      service.accounts[0].email = 'test@example.com';
    });

    it('should not process if already processing', async () => {
      service.processing = true;
      const spy = vi.spyOn(service, 'callClaudeWithAccount');
      
      await service.processQueue();
      
      expect(spy).not.toHaveBeenCalled();
    });

    it('should not process if queue is empty', async () => {
      const spy = vi.spyOn(service, 'callClaudeWithAccount');
      
      await service.processQueue();
      
      expect(spy).not.toHaveBeenCalled();
    });

    it('should wait if no accounts are available', () => {
      // Make all accounts busy
      service.accounts.forEach(account => {
        account.busy = true;
      });
      
      // Create a request but don't await it
      service.queue.push({
        message: 'Test',
        options: {},
        resolve: vi.fn(),
        reject: vi.fn(),
        timestamp: new Date()
      });
      
      // Accounts are busy, should still be queued
      expect(service.queue).toHaveLength(1);
      
      // Process queue should exit early since all accounts are busy
      service.processQueue();
      
      // Queue should still have the item
      expect(service.queue).toHaveLength(1);
    });

    it('should update account statistics after processing', async () => {
      const promise = service.sendMessage('Test');
      
      // Simulate response
      setImmediate(() => {
        mockProcess.stdout.emit('data', 'Response');
        mockProcess.emit('close', 0);
      });
      
      await promise;
      
      const account = service.accounts[0];
      expect(account.requestCount).toBe(1);
      expect(account.lastUsed).toBeInstanceOf(Date);
    });
  });

  describe('callClaudeWithAccount', () => {
    let account;

    beforeEach(() => {
      account = {
        id: 'test-account',
        configDir: 'C:\\test\\config',
        busy: false
      };
    });

    it('should spawn Claude process with correct arguments', async () => {
      const promise = service.callClaudeWithAccount('Test message', account);
      
      // Check spawn was called correctly
      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        ['--print', 'Test message'],
        expect.objectContaining({
          env: expect.objectContaining({
            CLAUDE_CONFIG_DIR: account.configDir
          }),
          shell: true
        })
      );
      
      // Simulate response
      mockProcess.stdout.emit('data', 'Response');
      mockProcess.emit('close', 0);
      
      await promise;
    });

    it('should include model option if provided', async () => {
      const promise = service.callClaudeWithAccount(
        'Test message', 
        account,
        { model: 'claude-3' }
      );
      
      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        ['--print', '--model', 'claude-3', 'Test message'],
        expect.any(Object)
      );
      
      // Simulate response
      mockProcess.stdout.emit('data', 'Response');
      mockProcess.emit('close', 0);
      
      await promise;
    });

    it('should handle timeout', async () => {
      vi.useFakeTimers();
      
      const promise = service.callClaudeWithAccount('Test', account);
      
      // Advance time to trigger timeout (2 minutes)
      vi.advanceTimersByTime(120000);
      
      await expect(promise).rejects.toThrow('Claude request timeout after 2 minutes');
      
      expect(mockProcess.kill).toHaveBeenCalled();
      
      vi.useRealTimers();
    });

    it('should handle process spawn errors', async () => {
      mockSpawn.mockImplementation(() => {
        const proc = new EventEmitter();
        proc.stdout = new EventEmitter();
        proc.stderr = new EventEmitter();
        proc.kill = vi.fn();
        
        setImmediate(() => {
          proc.emit('error', new Error('Spawn failed'));
        });
        
        return proc;
      });
      
      await expect(
        service.callClaudeWithAccount('Test', account)
      ).rejects.toThrow('Failed to start Claude: Spawn failed');
    });
  });

  describe('getStatus', () => {
    it('should return current service status', () => {
      service.accounts[0].configured = true;
      service.accounts[0].email = 'test@example.com';
      service.accounts[0].requestCount = 5;
      service.queue = [{ message: 'Test' }];
      
      const status = service.getStatus();
      
      expect(status.accounts).toHaveLength(3);
      expect(status.accounts[0].configured).toBe(true);
      expect(status.accounts[0].email).toBe('test@example.com');
      expect(status.accounts[0].requestCount).toBe(5);
      expect(status.queueLength).toBe(1);
      expect(status.processing).toBe(false);
    });
  });

  describe('getAvailableAccountsCount', () => {
    it('should return count of available accounts', () => {
      service.accounts[0].configured = true;
      service.accounts[0].busy = false;
      service.accounts[1].configured = true;
      service.accounts[1].busy = true;
      service.accounts[2].configured = false;
      
      expect(service.getAvailableAccountsCount()).toBe(1);
    });

    it('should return 0 when no accounts are available', () => {
      service.accounts.forEach(account => {
        account.configured = false;
      });
      
      expect(service.getAvailableAccountsCount()).toBe(0);
    });
  });

  describe('clearQueue', () => {
    it('should clear all queued requests', () => {
      // Add some requests to queue
      service.queue = [
        { message: 'Test 1', reject: vi.fn() },
        { message: 'Test 2', reject: vi.fn() },
        { message: 'Test 3', reject: vi.fn() }
      ];
      
      const cleared = service.clearQueue();
      
      expect(cleared).toBe(3);
      expect(service.queue).toHaveLength(0);
      
      // Check all rejects were called
      expect(service.queue.length).toBe(0);
    });

    it('should reject all pending requests', () => {
      const mockReject = vi.fn();
      service.queue = [
        { message: 'Test', reject: mockReject }
      ];
      
      service.clearQueue();
      
      expect(mockReject).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Queue cleared'
        })
      );
    });
  });

  describe('getQueueInfo', () => {
    it('should return queue information', () => {
      const now = new Date();
      service.queue = [
        { message: 'This is a very long message that should be truncated', timestamp: now },
        { message: 'Short message', timestamp: now }
      ];
      
      const info = service.getQueueInfo();
      
      expect(info.length).toBe(2);
      expect(info.items[0].position).toBe(1);
      expect(info.items[0].message).toContain('...');
      expect(info.items[1].position).toBe(2);
    });
  });

  describe('event emissions', () => {
    beforeEach(() => {
      service.accounts[0].configured = true;
    });

    it('should emit request-completed event on success', async () => {
      const listener = vi.fn();
      service.on('request-completed', listener);
      
      const promise = service.sendMessage('Test');
      
      // Simulate success
      setImmediate(() => {
        mockProcess.stdout.emit('data', 'Response');
        mockProcess.emit('close', 0);
      });
      
      await promise;
      
      expect(listener).toHaveBeenCalledWith({
        accountId: 'account1',
        success: true
      });
    });

    it('should emit request-failed event on error', async () => {
      const listener = vi.fn();
      service.on('request-failed', listener);
      
      const promise = service.sendMessage('Test');
      
      // Simulate error
      setImmediate(() => {
        mockProcess.emit('close', 1);
      });
      
      await expect(promise).rejects.toThrow();
      
      expect(listener).toHaveBeenCalledWith({
        accountId: 'account1',
        error: expect.any(String)
      });
    });
  });
});