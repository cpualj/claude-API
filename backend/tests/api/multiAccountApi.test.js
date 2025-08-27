import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { EventEmitter } from 'events';

// Mock the multiAccountService
vi.mock('../../services/multiAccountService.js', () => {
  return {
    default: vi.fn(() => {
      const emitter = new EventEmitter();
      return Object.assign(emitter, {
        accounts: [
          { id: 'account1', configured: true, email: 'test1@example.com', busy: false },
          { id: 'account2', configured: false, busy: false },
          { id: 'account3', configured: false, busy: false }
        ],
        queue: [],
        processing: false,
        checkAccountsStatus: vi.fn(),
        getStatus: vi.fn(() => ({
          accounts: [
            { id: 'account1', configured: true, email: 'test1@example.com', busy: false, requestCount: 5, lastUsed: new Date() },
            { id: 'account2', configured: false, busy: false, requestCount: 0, lastUsed: null },
            { id: 'account3', configured: false, busy: false, requestCount: 0, lastUsed: null }
          ],
          queueLength: 0,
          processing: false
        })),
        getAvailableAccountsCount: vi.fn(() => 1),
        sendMessage: vi.fn(async (message, options) => ({
          content: 'Claude response',
          accountUsed: 'account1',
          queueLength: 0,
          timestamp: new Date()
        })),
        refreshAccountsStatus: vi.fn(function() {
          return this.getStatus();
        }),
        getQueueInfo: vi.fn(() => ({
          length: 2,
          items: [
            { position: 1, message: 'Test message 1...', timestamp: new Date() },
            { position: 2, message: 'Test message 2...', timestamp: new Date() }
          ]
        })),
        clearQueue: vi.fn(() => 3)
      });
    })
  };
});

describe('Multi-Account API Endpoints', () => {
  let app;
  let httpServer;
  let io;
  let claudeService;
  
  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Dynamically import to get fresh mocks
    const MultiAccountClaudeService = (await import('../../services/multiAccountService.js')).default;
    
    // Create Express app
    app = express();
    httpServer = createServer(app);
    io = new Server(httpServer, {
      cors: {
        origin: '*',
        credentials: true
      }
    });
    
    // Create service instance
    claudeService = new MultiAccountClaudeService();
    
    // Middleware
    app.use(express.json());
    
    // Define routes (copied from server-multi-account.js)
    app.get('/health', (req, res) => {
      const status = claudeService.getStatus();
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'multi-account-claude',
        accounts: status.accounts.filter(a => a.configured).length,
        availableAccounts: claudeService.getAvailableAccountsCount(),
        queueLength: status.queueLength
      });
    });
    
    app.get('/api/status', (req, res) => {
      res.json(claudeService.getStatus());
    });
    
    app.post('/api/accounts/refresh', (req, res) => {
      const status = claudeService.refreshAccountsStatus();
      res.json({
        success: true,
        status
      });
    });
    
    app.get('/api/queue', (req, res) => {
      res.json(claudeService.getQueueInfo());
    });
    
    app.delete('/api/queue', (req, res) => {
      const cleared = claudeService.clearQueue();
      res.json({
        success: true,
        clearedCount: cleared
      });
    });
    
    app.post('/api/chat', async (req, res) => {
      const { message, options = {} } = req.body;
      
      if (!message) {
        return res.status(400).json({
          success: false,
          error: 'Message is required'
        });
      }
      
      const status = claudeService.getStatus();
      const configuredAccounts = status.accounts.filter(a => a.configured);
      
      if (configuredAccounts.length === 0) {
        return res.status(503).json({
          success: false,
          error: 'No Claude accounts configured. Please run setup-claude-accounts.bat first.'
        });
      }
      
      try {
        const result = await claudeService.sendMessage(message, options);
        
        res.json({
          success: true,
          response: result.content,
          accountUsed: result.accountUsed,
          queueLength: result.queueLength,
          timestamp: result.timestamp
        });
        
      } catch (error) {
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });
    
    app.post('/api/chat/stream', async (req, res) => {
      const { message, options = {} } = req.body;
      
      if (!message) {
        return res.status(400).json({
          success: false,
          error: 'Message is required'
        });
      }
      
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      
      try {
        res.write(`data: ${JSON.stringify({ type: 'start', message: 'Processing...' })}\n\n`);
        
        const result = await claudeService.sendMessage(message, options);
        
        const chunks = result.content.match(/.{1,50}/g) || [];
        for (const chunk of chunks) {
          res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
        }
        
        res.write(`data: ${JSON.stringify({ 
          type: 'done', 
          accountUsed: result.accountUsed,
          timestamp: result.timestamp 
        })}\n\n`);
        
        res.end();
        
      } catch (error) {
        res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
        res.end();
      }
    });
    
    // Error handling middleware
    app.use((err, req, res, next) => {
      res.status(500).json({
        success: false,
        error: err.message || 'Internal server error'
      });
    });
  });
  
  afterEach(() => {
    vi.clearAllMocks();
    if (httpServer) {
      httpServer.close();
    }
  });
  
  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);
      
      expect(response.body).toMatchObject({
        status: 'healthy',
        service: 'multi-account-claude',
        accounts: 1,
        availableAccounts: 1,
        queueLength: 0
      });
      expect(response.body.timestamp).toBeDefined();
    });
  });
  
  describe('GET /api/status', () => {
    it('should return service status', async () => {
      const response = await request(app)
        .get('/api/status')
        .expect(200);
      
      expect(response.body).toMatchObject({
        accounts: expect.any(Array),
        queueLength: 0,
        processing: false
      });
      expect(response.body.accounts).toHaveLength(3);
      expect(response.body.accounts[0].configured).toBe(true);
    });
  });
  
  describe('POST /api/accounts/refresh', () => {
    it('should refresh accounts status', async () => {
      const response = await request(app)
        .post('/api/accounts/refresh')
        .expect(200);
      
      expect(response.body).toMatchObject({
        success: true,
        status: {
          accounts: expect.any(Array),
          queueLength: 0,
          processing: false
        }
      });
      expect(claudeService.refreshAccountsStatus).toHaveBeenCalled();
    });
  });
  
  describe('GET /api/queue', () => {
    it('should return queue information', async () => {
      const response = await request(app)
        .get('/api/queue')
        .expect(200);
      
      expect(response.body).toMatchObject({
        length: 2,
        items: expect.any(Array)
      });
      expect(response.body.items[0]).toHaveProperty('position', 1);
      expect(response.body.items[0]).toHaveProperty('message');
    });
  });
  
  describe('DELETE /api/queue', () => {
    it('should clear the queue', async () => {
      const response = await request(app)
        .delete('/api/queue')
        .expect(200);
      
      expect(response.body).toMatchObject({
        success: true,
        clearedCount: 3
      });
      expect(claudeService.clearQueue).toHaveBeenCalled();
    });
  });
  
  describe('POST /api/chat', () => {
    it('should send message successfully', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({ message: 'Test message' })
        .expect(200);
      
      expect(response.body).toMatchObject({
        success: true,
        response: 'Claude response',
        accountUsed: 'account1',
        queueLength: 0
      });
      expect(claudeService.sendMessage).toHaveBeenCalledWith('Test message', {});
    });
    
    it('should handle message with options', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({ 
          message: 'Test message',
          options: { model: 'claude-3' }
        })
        .expect(200);
      
      expect(claudeService.sendMessage).toHaveBeenCalledWith('Test message', { model: 'claude-3' });
    });
    
    it('should return error if message is missing', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({})
        .expect(400);
      
      expect(response.body).toMatchObject({
        success: false,
        error: 'Message is required'
      });
    });
    
    it('should return error if no accounts configured', async () => {
      // Mock no configured accounts
      claudeService.getStatus.mockReturnValue({
        accounts: [
          { id: 'account1', configured: false },
          { id: 'account2', configured: false },
          { id: 'account3', configured: false }
        ],
        queueLength: 0,
        processing: false
      });
      
      const response = await request(app)
        .post('/api/chat')
        .send({ message: 'Test' })
        .expect(503);
      
      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('No Claude accounts configured')
      });
    });
    
    it('should handle service errors', async () => {
      claudeService.sendMessage.mockRejectedValue(new Error('Service error'));
      
      const response = await request(app)
        .post('/api/chat')
        .send({ message: 'Test' })
        .expect(500);
      
      expect(response.body).toMatchObject({
        success: false,
        error: 'Service error'
      });
    });
  });
  
  describe('POST /api/chat/stream', () => {
    it('should stream response successfully', async () => {
      const response = await request(app)
        .post('/api/chat/stream')
        .send({ message: 'Test message' })
        .expect(200)
        .expect('Content-Type', 'text/event-stream');
      
      const events = response.text.split('\n\n').filter(e => e);
      
      // Check start event
      expect(events[0]).toContain('type":"start"');
      
      // Check chunk events
      const chunkEvents = events.filter(e => e.includes('type":"chunk"'));
      expect(chunkEvents.length).toBeGreaterThan(0);
      
      // Check done event
      const lastEvent = events[events.length - 1];
      expect(lastEvent).toContain('type":"done"');
      expect(lastEvent).toContain('accountUsed":"account1"');
    });
    
    it('should return error for missing message', async () => {
      const response = await request(app)
        .post('/api/chat/stream')
        .send({})
        .expect(400);
      
      expect(response.body).toMatchObject({
        success: false,
        error: 'Message is required'
      });
    });
    
    it('should handle stream errors', async () => {
      claudeService.sendMessage.mockRejectedValue(new Error('Stream error'));
      
      const response = await request(app)
        .post('/api/chat/stream')
        .send({ message: 'Test' })
        .expect(200);
      
      expect(response.text).toContain('type":"error"');
      expect(response.text).toContain('Stream error');
    });
  });
});