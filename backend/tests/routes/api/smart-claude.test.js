import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock the smart Claude service
vi.mock('../../../services/smartClaudeCliService.js', () => ({
  default: {
    sendMessage: vi.fn(),
    getStats: vi.fn(),
    healthCheck: vi.fn(),
    cleanup: vi.fn(),
    getInstanceInfo: vi.fn(),
    shutdown: vi.fn()
  }
}));

// Import after mocking
import smartClaudeCliService from '../../../services/smartClaudeCliService.js';

// Create test app with routes (simplified version of server-smart-claude.js)
function createTestApp() {
  const app = express();
  app.use(express.json());

  // Smart Claude API Routes (copy from server-smart-claude.js)
  app.post('/api/smart-claude/chat', async (req, res) => {
    try {
      const { message, sessionId } = req.body;
      
      if (!message) {
        return res.status(400).json({
          success: false,
          error: 'Message is required'
        });
      }

      const response = await smartClaudeCliService.sendMessage(message, { 
        sessionId: sessionId || `session-${Date.now()}` 
      });

      res.json({
        success: true,
        ...response
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.post('/api/smart-claude/chat-batch', async (req, res) => {
    try {
      const { messages } = req.body;
      
      if (!Array.isArray(messages) || messages.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Messages array is required'
        });
      }

      const results = await Promise.all(
        messages.map(async (item, index) => {
          try {
            const response = await smartClaudeCliService.sendMessage(
              item.message, 
              { sessionId: item.sessionId || `batch-${Date.now()}-${index}` }
            );
            return { success: true, ...response };
          } catch (error) {
            return { success: false, error: error.message };
          }
        })
      );

      res.json({
        success: true,
        results,
        processed: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.get('/api/smart-claude/stats', async (req, res) => {
    try {
      const stats = smartClaudeCliService.getStats();
      res.json({
        success: true,
        stats
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.get('/api/smart-claude/health', async (req, res) => {
    try {
      const health = await smartClaudeCliService.healthCheck();
      res.json({
        success: true,
        ...health
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.post('/api/smart-claude/cleanup', async (req, res) => {
    try {
      const cleaned = await smartClaudeCliService.cleanup();
      res.json({
        success: true,
        message: `Cleaned up ${cleaned} idle instances`,
        cleaned
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  app.get('/api/smart-claude/instance/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const info = smartClaudeCliService.getInstanceInfo(id);
      
      if (!info) {
        return res.status(404).json({
          success: false,
          error: 'Instance not found'
        });
      }

      res.json({
        success: true,
        instance: info
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  });

  return app;
}

describe('Smart Claude API Routes', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('POST /api/smart-claude/chat', () => {
    it('should handle chat request successfully', async () => {
      const mockResponse = {
        id: 'msg-123',
        instanceId: 'claude-456',
        content: 'Hello from Claude!',
        timestamp: new Date(),
        messageCount: 1
      };

      smartClaudeCliService.sendMessage.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/smart-claude/chat')
        .send({
          message: 'Hello Claude',
          sessionId: 'test-session'
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.content).toBe('Hello from Claude!');
      expect(smartClaudeCliService.sendMessage).toHaveBeenCalledWith(
        'Hello Claude',
        { sessionId: 'test-session' }
      );
    });

    it('should return 400 when message is missing', async () => {
      const response = await request(app)
        .post('/api/smart-claude/chat')
        .send({
          sessionId: 'test-session'
        });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Message is required');
    });

    it('should handle service errors', async () => {
      smartClaudeCliService.sendMessage.mockRejectedValue(
        new Error('Claude CLI failed')
      );

      const response = await request(app)
        .post('/api/smart-claude/chat')
        .send({
          message: 'Hello Claude',
          sessionId: 'test-session'
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Claude CLI failed');
    });

    it('should generate session ID when not provided', async () => {
      const mockResponse = {
        id: 'msg-123',
        instanceId: 'claude-456',
        content: 'Response',
        timestamp: new Date(),
        messageCount: 1
      };

      smartClaudeCliService.sendMessage.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/smart-claude/chat')
        .send({
          message: 'Hello Claude'
        });

      expect(response.status).toBe(200);
      expect(smartClaudeCliService.sendMessage).toHaveBeenCalledWith(
        'Hello Claude',
        expect.objectContaining({
          sessionId: expect.stringMatching(/^session-\d+$/)
        })
      );
    });
  });

  describe('POST /api/smart-claude/chat-batch', () => {
    it('should handle batch chat request successfully', async () => {
      const mockResponses = [
        { id: 'msg-1', instanceId: 'claude-1', content: 'Response 1', messageCount: 1 },
        { id: 'msg-2', instanceId: 'claude-2', content: 'Response 2', messageCount: 1 }
      ];

      smartClaudeCliService.sendMessage
        .mockResolvedValueOnce(mockResponses[0])
        .mockResolvedValueOnce(mockResponses[1]);

      const response = await request(app)
        .post('/api/smart-claude/chat-batch')
        .send({
          messages: [
            { message: 'Hello 1', sessionId: 'session-1' },
            { message: 'Hello 2', sessionId: 'session-2' }
          ]
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.processed).toBe(2);
      expect(response.body.successful).toBe(2);
      expect(response.body.failed).toBe(0);
      expect(response.body.results).toHaveLength(2);
    });

    it('should handle partial failures in batch', async () => {
      smartClaudeCliService.sendMessage
        .mockResolvedValueOnce({ content: 'Success' })
        .mockRejectedValueOnce(new Error('Failed'));

      const response = await request(app)
        .post('/api/smart-claude/chat-batch')
        .send({
          messages: [
            { message: 'Hello 1' },
            { message: 'Hello 2' }
          ]
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.successful).toBe(1);
      expect(response.body.failed).toBe(1);
    });

    it('should return 400 when messages array is missing', async () => {
      const response = await request(app)
        .post('/api/smart-claude/chat-batch')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Messages array is required');
    });
  });

  describe('GET /api/smart-claude/stats', () => {
    it('should return service statistics', async () => {
      const mockStats = {
        totalRequests: 10,
        successfulRequests: 9,
        failedRequests: 1,
        currentInstances: 2,
        activeSessions: 3,
        instances: []
      };

      smartClaudeCliService.getStats.mockReturnValue(mockStats);

      const response = await request(app)
        .get('/api/smart-claude/stats');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.stats).toEqual(mockStats);
    });

    it('should handle stats error', async () => {
      smartClaudeCliService.getStats.mockImplementation(() => {
        throw new Error('Stats failed');
      });

      const response = await request(app)
        .get('/api/smart-claude/stats');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Stats failed');
    });
  });

  describe('GET /api/smart-claude/health', () => {
    it('should return health status', async () => {
      const mockHealth = {
        healthy: true,
        timestamp: new Date(),
        currentInstances: 2,
        busyInstances: 0
      };

      smartClaudeCliService.healthCheck.mockResolvedValue(mockHealth);

      const response = await request(app)
        .get('/api/smart-claude/health');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.healthy).toBe(true);
    });
  });

  describe('POST /api/smart-claude/cleanup', () => {
    it('should perform cleanup successfully', async () => {
      smartClaudeCliService.cleanup.mockResolvedValue(3);

      const response = await request(app)
        .post('/api/smart-claude/cleanup');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.cleaned).toBe(3);
      expect(response.body.message).toBe('Cleaned up 3 idle instances');
    });
  });

  describe('GET /api/smart-claude/instance/:id', () => {
    it('should return instance info', async () => {
      const mockInfo = {
        id: 'claude-123',
        busy: false,
        messageCount: 5,
        lastUsed: Date.now()
      };

      smartClaudeCliService.getInstanceInfo.mockReturnValue(mockInfo);

      const response = await request(app)
        .get('/api/smart-claude/instance/claude-123');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.instance).toEqual(mockInfo);
    });

    it('should return 404 for non-existent instance', async () => {
      smartClaudeCliService.getInstanceInfo.mockReturnValue(null);

      const response = await request(app)
        .get('/api/smart-claude/instance/non-existent');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Instance not found');
    });
  });
});