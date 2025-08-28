import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';

// Mock the claudeCliPoolService
vi.mock('../../../services/claudeCliPoolService.js', () => ({
  default: {
    initialize: vi.fn(),
    sendMessage: vi.fn(),
    getStats: vi.fn(),
    performHealthCheck: vi.fn(),
    shutdown: vi.fn(),
    on: vi.fn(),
    emit: vi.fn()
  }
}));

import claudeCliPoolService from '../../../services/claudeCliPoolService.js';
import cliPoolRoutes from '../../../routes/api/cli-pool.js';

describe('CLI Pool API Routes', () => {
  let app;

  beforeEach(() => {
    // Create Express app with routes
    app = express();
    app.use(express.json());
    app.use('/api/cli-pool', cliPoolRoutes);
    
    // Reset all mocks
    vi.clearAllMocks();
  });

  describe('POST /api/cli-pool/initialize', () => {
    it('should initialize CLI pool with default options', async () => {
      claudeCliPoolService.initialize.mockResolvedValue();
      claudeCliPoolService.getStats.mockReturnValue({
        poolSize: 2,
        readyInstances: 2,
        busyInstances: 0
      });

      const response = await request(app)
        .post('/api/cli-pool/initialize')
        .send({});

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        message: 'Claude CLI pool initialized successfully'
      });
      expect(claudeCliPoolService.initialize).toHaveBeenCalled();
    });

    it('should initialize CLI pool with custom options', async () => {
      const options = {
        minInstances: 3,
        maxInstances: 10
      };

      claudeCliPoolService.initialize.mockResolvedValue();
      claudeCliPoolService.getStats.mockReturnValue({
        poolSize: 3,
        readyInstances: 3
      });

      const response = await request(app)
        .post('/api/cli-pool/initialize')
        .send(options);

      expect(response.status).toBe(200);
      expect(claudeCliPoolService.initialize).toHaveBeenCalledWith(options);
    });

    it('should handle initialization errors', async () => {
      claudeCliPoolService.initialize.mockRejectedValue(new Error('Init failed'));

      const response = await request(app)
        .post('/api/cli-pool/initialize')
        .send({});

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Init failed'
      });
    });
  });

  describe('POST /api/cli-pool/chat', () => {
    it('should send message successfully', async () => {
      const mockResponse = {
        id: 'msg-123',
        instanceId: 'cli-abc',
        content: 'Test response',
        duration: 1000
      };

      claudeCliPoolService.sendMessage.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/cli-pool/chat')
        .send({
          message: 'Test message',
          sessionId: 'test-session'
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        response: expect.objectContaining({
          content: 'Test response',
          role: 'assistant',
          sessionId: 'test-session'
        })
      });
    });

    it('should reject request without message', async () => {
      const response = await request(app)
        .post('/api/cli-pool/chat')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Message is required'
      });
    });

    it('should handle chat errors', async () => {
      claudeCliPoolService.sendMessage.mockRejectedValue(new Error('Chat failed'));

      const response = await request(app)
        .post('/api/cli-pool/chat')
        .send({
          message: 'Test message'
        });

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Chat failed'
      });
    });

    it('should handle streaming response', async () => {
      const mockResponse = {
        id: 'msg-123',
        instanceId: 'cli-abc',
        content: 'Test streaming response',
        duration: 1000
      };

      claudeCliPoolService.sendMessage.mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/api/cli-pool/chat')
        .send({
          message: 'Test message',
          stream: true
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('text/event-stream');
    });
  });

  describe('POST /api/cli-pool/chat-batch', () => {
    it('should process batch messages successfully', async () => {
      const mockResponses = [
        { id: 'msg-1', content: 'Response 1', instanceId: 'cli-1' },
        { id: 'msg-2', content: 'Response 2', instanceId: 'cli-2' },
        { id: 'msg-3', content: 'Response 3', instanceId: 'cli-3' }
      ];

      claudeCliPoolService.sendMessage
        .mockResolvedValueOnce(mockResponses[0])
        .mockResolvedValueOnce(mockResponses[1])
        .mockResolvedValueOnce(mockResponses[2]);

      const response = await request(app)
        .post('/api/cli-pool/chat-batch')
        .send({
          messages: [
            { message: 'Message 1', sessionId: 'batch-1' },
            { message: 'Message 2', sessionId: 'batch-2' },
            { message: 'Message 3', sessionId: 'batch-3' }
          ]
        });

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        stats: {
          total: 3,
          successful: 3,
          failed: 0
        }
      });
      expect(response.body.responses).toHaveLength(3);
    });

    it('should handle partial batch failures', async () => {
      claudeCliPoolService.sendMessage
        .mockResolvedValueOnce({ id: 'msg-1', content: 'Response 1' })
        .mockRejectedValueOnce(new Error('Failed'))
        .mockResolvedValueOnce({ id: 'msg-3', content: 'Response 3' });

      const response = await request(app)
        .post('/api/cli-pool/chat-batch')
        .send({
          messages: ['Message 1', 'Message 2', 'Message 3']
        });

      expect(response.status).toBe(200);
      expect(response.body.stats).toMatchObject({
        total: 3,
        successful: 2,
        failed: 1
      });
    });

    it('should reject invalid batch request', async () => {
      const response = await request(app)
        .post('/api/cli-pool/chat-batch')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Messages array is required'
      });
    });
  });

  describe('GET /api/cli-pool/stats', () => {
    it('should return pool statistics', async () => {
      const mockStats = {
        poolSize: 3,
        readyInstances: 2,
        busyInstances: 1,
        poolUtilization: 33.33,
        totalRequests: 100,
        successfulRequests: 95,
        failedRequests: 5,
        instances: [
          { id: 'cli-1', ready: true, busy: false, messageCount: 10 },
          { id: 'cli-2', ready: true, busy: true, messageCount: 15 },
          { id: 'cli-3', ready: true, busy: false, messageCount: 8 }
        ]
      };

      claudeCliPoolService.getStats.mockReturnValue(mockStats);

      const response = await request(app).get('/api/cli-pool/stats');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        stats: mockStats,
        health: {
          poolSize: 3,
          readyInstances: 2,
          busyInstances: 1,
          utilization: '33.33%'
        }
      });
    });

    it('should handle stats errors', async () => {
      claudeCliPoolService.getStats.mockImplementation(() => {
        throw new Error('Stats error');
      });

      const response = await request(app).get('/api/cli-pool/stats');

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Stats error'
      });
    });
  });

  describe('GET /api/cli-pool/instance/:id', () => {
    it('should return instance information', async () => {
      const mockStats = {
        instances: [
          { id: 'cli-123', ready: true, busy: false, messageCount: 10 },
          { id: 'cli-456', ready: true, busy: true, messageCount: 15 }
        ]
      };

      claudeCliPoolService.getStats.mockReturnValue(mockStats);

      const response = await request(app).get('/api/cli-pool/instance/cli-123');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        instance: {
          id: 'cli-123',
          ready: true,
          busy: false,
          messageCount: 10
        }
      });
    });

    it('should return 404 for non-existent instance', async () => {
      claudeCliPoolService.getStats.mockReturnValue({ instances: [] });

      const response = await request(app).get('/api/cli-pool/instance/non-existent');

      expect(response.status).toBe(404);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Instance not found'
      });
    });
  });

  describe('GET /api/cli-pool/health', () => {
    it('should return healthy status', async () => {
      const mockStats = {
        poolSize: 3,
        readyInstances: 2,
        busyInstances: 1,
        poolUtilization: 33.33
      };

      claudeCliPoolService.getStats.mockReturnValue(mockStats);

      const response = await request(app).get('/api/cli-pool/health');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        healthy: true,
        details: {
          poolSize: 3,
          readyInstances: 2,
          busyInstances: 1
        }
      });
    });

    it('should return unhealthy status when no ready instances', async () => {
      claudeCliPoolService.getStats.mockReturnValue({
        readyInstances: 0,
        poolSize: 3,
        busyInstances: 3,
        poolUtilization: 100
      });

      const response = await request(app).get('/api/cli-pool/health');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        healthy: false
      });
    });
  });

  describe('POST /api/cli-pool/health-check', () => {
    it('should perform health check', async () => {
      claudeCliPoolService.performHealthCheck.mockResolvedValue();
      claudeCliPoolService.getStats.mockReturnValue({
        poolSize: 3,
        readyInstances: 3
      });

      const response = await request(app).post('/api/cli-pool/health-check');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        message: 'Health check completed'
      });
      expect(claudeCliPoolService.performHealthCheck).toHaveBeenCalled();
    });

    it('should handle health check errors', async () => {
      claudeCliPoolService.performHealthCheck.mockRejectedValue(new Error('Check failed'));

      const response = await request(app).post('/api/cli-pool/health-check');

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Check failed'
      });
    });
  });

  describe('POST /api/cli-pool/shutdown', () => {
    it('should shutdown CLI pool', async () => {
      claudeCliPoolService.shutdown.mockResolvedValue();

      const response = await request(app).post('/api/cli-pool/shutdown');

      expect(response.status).toBe(200);
      expect(response.body).toMatchObject({
        success: true,
        message: 'Claude CLI pool shut down successfully'
      });
      expect(claudeCliPoolService.shutdown).toHaveBeenCalled();
    });

    it('should handle shutdown errors', async () => {
      claudeCliPoolService.shutdown.mockRejectedValue(new Error('Shutdown failed'));

      const response = await request(app).post('/api/cli-pool/shutdown');

      expect(response.status).toBe(500);
      expect(response.body).toMatchObject({
        success: false,
        error: 'Shutdown failed'
      });
    });
  });
});