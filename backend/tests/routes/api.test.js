import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { setupRedis, closeRedis } from '../../services/redis.js';
import { initDatabase, closeDatabase, query } from '../../db/init.js';
import { ApiKeyManager } from '../../services/apiKeyManager.js';
import { SessionManager } from '../../services/sessionManager.js';
import { WorkerManager } from '../../services/workerManager.js';
import apiRoutes from '../../routes/api.js';
import bcrypt from 'bcryptjs';

// Mock Socket.IO
const mockIO = {
  to: vi.fn().mockReturnThis(),
  emit: vi.fn()
};

describe('API Routes', () => {
  let app;
  let redisServices;
  let apiKeyManager;
  let sessionManager;
  let workerManager;
  let testUser;
  let testApiKey;
  let apiKeyString;

  beforeAll(async () => {
    await initDatabase();
    redisServices = await setupRedis();
    
    apiKeyManager = new ApiKeyManager(redisServices);
    sessionManager = new SessionManager(redisServices);
    workerManager = new WorkerManager(mockIO, redisServices);
    await workerManager.initialize();

    // Create Express app with API routes
    app = express();
    app.use(express.json());
    
    // Mock services middleware
    app.use((req, res, next) => {
      req.services = {
        apiKeyManager,
        sessionManager,
        workerManager,
        redis: redisServices,
        io: mockIO
      };
      next();
    });
    
    app.use('/api', apiRoutes);
  });

  afterAll(async () => {
    await workerManager.shutdown();
    await closeDatabase();
    await closeRedis();
  });

  beforeEach(async () => {
    // Clear database and Redis
    await query('DELETE FROM sessions');
    await query('DELETE FROM api_keys');
    await query('DELETE FROM users');
    await redisServices.redis.flushdb();
    vi.clearAllMocks();

    // Create test user and API key
    const hashedPassword = await bcrypt.hash('testPassword123', 10);
    const userResult = await query(`
      INSERT INTO users (email, password_hash, role, is_active)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, ['api@example.com', hashedPassword, 'user', true]);
    
    testUser = userResult.rows[0];

    const keyData = await apiKeyManager.generateApiKey(
      testUser.id,
      'Test API Key',
      { rateLimitPerHour: 1000 }
    );
    
    testApiKey = keyData;
    apiKeyString = keyData.key;
  });

  describe('POST /api/chat', () => {
    it('should handle chat requests successfully', async () => {
      const chatData = {
        message: 'Hello, Claude!',
        toolId: 'claude'
      };

      // Mock successful worker response
      vi.spyOn(workerManager, 'submitRequest').mockResolvedValue({
        status: 'completed',
        result: {
          response: 'Hello! How can I help you today?',
          usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
          toolId: 'claude',
          sessionId: null
        },
        responseTime: 1500
      });

      const response = await request(app)
        .post('/api/chat')
        .set('X-API-Key', apiKeyString)
        .send(chatData)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        response: 'Hello! How can I help you today?',
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
        toolId: 'claude',
        sessionId: null,
        responseTime: 1500
      });
    });

    it('should handle chat requests with sessions', async () => {
      // Create a session first
      const session = await sessionManager.createSession(
        testApiKey.id,
        'claude',
        { initialContext: [{ role: 'system', content: 'You are helpful' }] }
      );

      const chatData = {
        message: 'What is 2+2?',
        toolId: 'claude',
        sessionId: session.id
      };

      vi.spyOn(workerManager, 'submitRequest').mockResolvedValue({
        status: 'completed',
        result: {
          response: '2+2 equals 4',
          usage: { inputTokens: 15, outputTokens: 25, totalTokens: 40 },
          toolId: 'claude',
          sessionId: session.id
        },
        responseTime: 1200
      });

      const response = await request(app)
        .post('/api/chat')
        .set('X-API-Key', apiKeyString)
        .send(chatData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.response).toBe('2+2 equals 4');
      expect(response.body.sessionId).toBe(session.id);

      // Verify session context was updated
      const updatedSession = await sessionManager.getSession(session.id, testApiKey.id);
      expect(updatedSession.context).toHaveLength(3); // System + user + assistant
    });

    it('should handle streaming chat requests', async () => {
      const chatData = {
        message: 'Tell me a story',
        toolId: 'claude',
        stream: true
      };

      vi.spyOn(workerManager, 'submitRequest').mockResolvedValue({
        status: 'completed',
        result: {
          response: 'Once upon a time...',
          usage: { inputTokens: 20, outputTokens: 50, totalTokens: 70 }
        }
      });

      const response = await request(app)
        .post('/api/chat')
        .set('X-API-Key', apiKeyString)
        .send(chatData)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/event-stream');
    });

    it('should handle queued requests', async () => {
      const chatData = {
        message: 'This will be queued',
        toolId: 'claude'
      };

      vi.spyOn(workerManager, 'submitRequest').mockResolvedValue({
        status: 'queued',
        requestId: 'req-123',
        message: 'Request queued for processing'
      });

      const response = await request(app)
        .post('/api/chat')
        .set('X-API-Key', apiKeyString)
        .send(chatData)
        .expect(202);

      expect(response.body).toEqual({
        success: true,
        status: 'queued',
        requestId: 'req-123',
        message: 'Request queued for processing',
        pollUrl: '/api/status/req-123'
      });
    });

    it('should validate chat input', async () => {
      const invalidData = {
        message: '', // Empty message
        toolId: 'claude'
      };

      const response = await request(app)
        .post('/api/chat')
        .set('X-API-Key', apiKeyString)
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
    });

    it('should reject requests without API key', async () => {
      const chatData = {
        message: 'Hello',
        toolId: 'claude'
      };

      const response = await request(app)
        .post('/api/chat')
        .send(chatData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('API key required');
    });

    it('should handle non-existent sessions', async () => {
      const chatData = {
        message: 'Hello',
        toolId: 'claude',
        sessionId: 'non-existent-session'
      };

      const response = await request(app)
        .post('/api/chat')
        .set('X-API-Key', apiKeyString)
        .send(chatData)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Session not found');
    });

    it('should handle worker errors', async () => {
      const chatData = {
        message: 'This will fail',
        toolId: 'claude'
      };

      vi.spyOn(workerManager, 'submitRequest').mockRejectedValue(
        new Error('Worker processing failed')
      );

      const response = await request(app)
        .post('/api/chat')
        .set('X-API-Key', apiKeyString)
        .send(chatData)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Chat request failed');
    });

    it('should enforce rate limits', async () => {
      // Set very low rate limit
      await query('UPDATE api_keys SET rate_limit_per_hour = 1 WHERE id = $1', [testApiKey.id]);

      const chatData = {
        message: 'First request',
        toolId: 'claude'
      };

      vi.spyOn(workerManager, 'submitRequest').mockResolvedValue({
        status: 'completed',
        result: { response: 'Success', usage: {} }
      });

      // First request should succeed
      await request(app)
        .post('/api/chat')
        .set('X-API-Key', apiKeyString)
        .send(chatData)
        .expect(200);

      // Second request should be rate limited
      const response = await request(app)
        .post('/api/chat')
        .set('X-API-Key', apiKeyString)
        .send(chatData)
        .expect(429);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('rate limit');
    });
  });

  describe('POST /api/sessions', () => {
    it('should create new sessions', async () => {
      const sessionData = {
        toolId: 'claude',
        initialContext: [{ role: 'system', content: 'You are helpful' }],
        metadata: { source: 'api-test' },
        ttlSeconds: 7200
      };

      const response = await request(app)
        .post('/api/sessions')
        .set('X-API-Key', apiKeyString)
        .send(sessionData)
        .expect(201);

      expect(response.body).toEqual({
        success: true,
        session: expect.objectContaining({
          id: expect.any(String),
          apiKeyId: testApiKey.id,
          toolId: 'claude',
          context: [{ role: 'system', content: 'You are helpful' }],
          metadata: { source: 'api-test' },
          isActive: true,
          createdAt: expect.any(String),
          expiresAt: expect.any(String)
        })
      });
    });

    it('should use default values for optional fields', async () => {
      const sessionData = {
        toolId: 'claude'
      };

      const response = await request(app)
        .post('/api/sessions')
        .set('X-API-Key', apiKeyString)
        .send(sessionData)
        .expect(201);

      expect(response.body.session.toolId).toBe('claude');
      expect(response.body.session.context).toEqual([]);
      expect(response.body.session.metadata).toEqual({});
    });

    it('should validate session input', async () => {
      const invalidData = {
        // Missing toolId
        initialContext: 'invalid-context-format'
      };

      const response = await request(app)
        .post('/api/sessions')
        .set('X-API-Key', apiKeyString)
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should enforce TTL limits', async () => {
      const sessionData = {
        toolId: 'claude',
        ttlSeconds: 100000 // Too high
      };

      const response = await request(app)
        .post('/api/sessions')
        .set('X-API-Key', apiKeyString)
        .send(sessionData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('GET /api/sessions/:sessionId', () => {
    let testSession;

    beforeEach(async () => {
      testSession = await sessionManager.createSession(
        testApiKey.id,
        'claude',
        { initialContext: [{ role: 'user', content: 'Test session' }] }
      );
    });

    it('should retrieve session details', async () => {
      const response = await request(app)
        .get(`/api/sessions/${testSession.id}`)
        .set('X-API-Key', apiKeyString)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        session: expect.objectContaining({
          id: testSession.id,
          apiKeyId: testApiKey.id,
          toolId: 'claude',
          context: [{ role: 'user', content: 'Test session' }]
        })
      });
    });

    it('should return 404 for non-existent sessions', async () => {
      const response = await request(app)
        .get('/api/sessions/non-existent-id')
        .set('X-API-Key', apiKeyString)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Session not found');
    });
  });

  describe('PUT /api/sessions/:sessionId', () => {
    let testSession;

    beforeEach(async () => {
      testSession = await sessionManager.createSession(
        testApiKey.id,
        'claude'
      );
    });

    it('should update session metadata', async () => {
      const updateData = {
        metadata: { updated: true, version: '2.0' }
      };

      const response = await request(app)
        .put(`/api/sessions/${testSession.id}`)
        .set('X-API-Key', apiKeyString)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.session.metadata).toEqual(updateData.metadata);
    });

    it('should extend session TTL', async () => {
      const updateData = {
        extendTtlSeconds: 3600
      };

      const response = await request(app)
        .put(`/api/sessions/${testSession.id}`)
        .set('X-API-Key', apiKeyString)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      
      const originalExpiry = new Date(testSession.expiresAt);
      const newExpiry = new Date(response.body.session.expiresAt);
      expect(newExpiry.getTime()).toBeGreaterThan(originalExpiry.getTime());
    });
  });

  describe('DELETE /api/sessions/:sessionId', () => {
    let testSession;

    beforeEach(async () => {
      testSession = await sessionManager.createSession(
        testApiKey.id,
        'claude'
      );
    });

    it('should delete sessions', async () => {
      const response = await request(app)
        .delete(`/api/sessions/${testSession.id}`)
        .set('X-API-Key', apiKeyString)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Session deleted successfully'
      });

      // Verify session is deleted
      const deletedSession = await sessionManager.getSession(testSession.id, testApiKey.id);
      expect(deletedSession).toBeNull();
    });

    it('should return 404 for non-existent sessions', async () => {
      const response = await request(app)
        .delete('/api/sessions/non-existent-id')
        .set('X-API-Key', apiKeyString)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Session not found');
    });
  });

  describe('GET /api/sessions', () => {
    beforeEach(async () => {
      // Create multiple sessions
      await sessionManager.createSession(testApiKey.id, 'claude', { metadata: { type: 'chat' } });
      await sessionManager.createSession(testApiKey.id, 'openai', { metadata: { type: 'completion' } });
      await sessionManager.createSession(testApiKey.id, 'claude', { metadata: { type: 'analysis' } });
    });

    it('should list user sessions', async () => {
      const response = await request(app)
        .get('/api/sessions')
        .set('X-API-Key', apiKeyString)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.sessions).toHaveLength(3);
      expect(response.body.total).toBe(3);
      expect(response.body.sessions.every(s => s.apiKeyId === testApiKey.id)).toBe(true);
    });

    it('should filter sessions by tool ID', async () => {
      const response = await request(app)
        .get('/api/sessions?toolId=claude')
        .set('X-API-Key', apiKeyString)
        .expect(200);

      expect(response.body.sessions).toHaveLength(2);
      expect(response.body.sessions.every(s => s.toolId === 'claude')).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/sessions?limit=2&offset=1')
        .set('X-API-Key', apiKeyString)
        .expect(200);

      expect(response.body.sessions).toHaveLength(2);
      expect(response.body.total).toBe(3);
    });
  });

  describe('GET /api/status/:requestId', () => {
    it('should return request status', async () => {
      const requestId = 'test-request-123';
      const mockResult = {
        status: 'completed',
        result: {
          response: 'Request completed',
          usage: { inputTokens: 10, outputTokens: 20 }
        },
        completedAt: new Date(),
        failedAt: null
      };

      vi.spyOn(workerManager.requestQueue, 'getResult').mockResolvedValue(mockResult);

      const response = await request(app)
        .get(`/api/status/${requestId}`)
        .set('X-API-Key', apiKeyString)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        requestId,
        status: 'completed',
        result: mockResult.result,
        error: null,
        completedAt: expect.any(String),
        failedAt: null
      });
    });

    it('should return 404 for non-existent requests', async () => {
      vi.spyOn(workerManager.requestQueue, 'getResult').mockResolvedValue(null);

      const response = await request(app)
        .get('/api/status/non-existent-request')
        .set('X-API-Key', apiKeyString)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Request not found or expired');
    });
  });

  describe('GET /api/tools', () => {
    it('should return available tools', async () => {
      const response = await request(app)
        .get('/api/tools')
        .set('X-API-Key', apiKeyString)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        tools: expect.arrayContaining([
          expect.objectContaining({
            id: 'claude',
            name: 'Claude',
            description: expect.any(String),
            sessionSupported: true,
            streamingSupported: true,
            enabled: true
          })
        ])
      });
    });

    it('should only return enabled tools', async () => {
      const response = await request(app)
        .get('/api/tools')
        .set('X-API-Key', apiKeyString)
        .expect(200);

      expect(response.body.tools.every(tool => tool.enabled)).toBe(true);
    });
  });

  describe('GET /api/usage', () => {
    beforeEach(async () => {
      // Add some usage data
      const usageEntries = [
        { endpoint: '/api/chat', inputTokens: 100, outputTokens: 200, statusCode: 200 },
        { endpoint: '/api/chat', inputTokens: 150, outputTokens: 250, statusCode: 200 },
        { endpoint: '/api/sessions', inputTokens: 50, outputTokens: 100, statusCode: 201 }
      ];

      for (const usage of usageEntries) {
        await apiKeyManager.logUsage(testApiKey.id, usage);
      }
    });

    it('should return usage statistics', async () => {
      const response = await request(app)
        .get('/api/usage')
        .set('X-API-Key', apiKeyString)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.totalRequests).toBe(3);
      expect(response.body.totalInputTokens).toBe(300);
      expect(response.body.totalOutputTokens).toBe(550);
    });

    it('should filter usage by date range', async () => {
      const response = await request(app)
        .get('/api/usage?days=7')
        .set('X-API-Key', apiKeyString)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.totalRequests).toBe(3);
    });
  });

  describe('GET /api/quota', () => {
    it('should return quota information', async () => {
      const response = await request(app)
        .get('/api/quota')
        .set('X-API-Key', apiKeyString)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        quota: expect.objectContaining({
          limit: expect.any(Number),
          remaining: expect.any(Number),
          resetTime: expect.any(Number),
          windowSeconds: 3600
        })
      });
    });
  });

  describe('API Key Authentication', () => {
    it('should accept valid API keys', async () => {
      const response = await request(app)
        .get('/api/tools')
        .set('X-API-Key', apiKeyString)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject invalid API keys', async () => {
      const response = await request(app)
        .get('/api/tools')
        .set('X-API-Key', 'invalid-key')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid API key');
    });

    it('should reject expired API keys', async () => {
      // Expire the API key
      await query('UPDATE api_keys SET expires_at = NOW() - INTERVAL \'1 hour\' WHERE id = $1', 
        [testApiKey.id]);

      const response = await request(app)
        .get('/api/tools')
        .set('X-API-Key', apiKeyString)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid API key');
    });

    it('should reject inactive API keys', async () => {
      // Deactivate the API key
      await query('UPDATE api_keys SET is_active = false WHERE id = $1', [testApiKey.id]);

      const response = await request(app)
        .get('/api/tools')
        .set('X-API-Key', apiKeyString)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid API key');
    });

    it('should handle missing API key header', async () => {
      const response = await request(app)
        .get('/api/tools')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('API key required');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      await closeDatabase();

      const response = await request(app)
        .post('/api/sessions')
        .set('X-API-Key', apiKeyString)
        .send({ toolId: 'claude' })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to create session');

      await initDatabase();
    });

    it('should handle Redis errors gracefully', async () => {
      await redisServices.redis.disconnect();

      // Should still work but without caching
      const response = await request(app)
        .get('/api/tools')
        .set('X-API-Key', apiKeyString)
        .expect(200);

      expect(response.body.success).toBe(true);

      await setupRedis();
    });

    it('should handle malformed JSON payloads', async () => {
      const response = await request(app)
        .post('/api/chat')
        .set('X-API-Key', apiKeyString)
        .set('Content-Type', 'application/json')
        .send('invalid-json')
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });
});