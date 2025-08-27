import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { SessionManager } from '../../services/sessionManager.js';
import { setupRedis, closeRedis } from '../../services/redis.js';
import { initDatabase, closeDatabase, query } from '../../db/init.js';
import bcrypt from 'bcryptjs';

describe('SessionManager', () => {
  let sessionManager;
  let redisServices;
  let testUser;
  let testApiKey;

  beforeAll(async () => {
    await initDatabase();
    redisServices = await setupRedis();
    sessionManager = new SessionManager(redisServices);
  });

  afterAll(async () => {
    await closeDatabase();
    await closeRedis();
  });

  beforeEach(async () => {
    // Clear database and Redis
    await query('DELETE FROM sessions');
    await query('DELETE FROM api_keys');
    await query('DELETE FROM users');
    await redisServices.redis.flushdb();

    // Create test user and API key
    const userResult = await query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ($1, $2, $3)
      RETURNING *
    `, ['session@example.com', await bcrypt.hash('password', 10), 'user']);
    
    testUser = userResult.rows[0];

    const keyResult = await query(`
      INSERT INTO api_keys (user_id, key_hash, name, rate_limit_per_hour)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, [testUser.id, await bcrypt.hash('test-key', 10), 'Test Key', 1000]);

    testApiKey = keyResult.rows[0];
  });

  describe('Session Creation', () => {
    it('should create new sessions', async () => {
      const session = await sessionManager.createSession(
        testApiKey.id,
        'claude',
        { 
          initialContext: [{ role: 'system', content: 'You are a helpful assistant' }],
          ttlSeconds: 3600 
        }
      );

      expect(session).toEqual(expect.objectContaining({
        id: expect.any(String),
        apiKeyId: testApiKey.id,
        toolId: 'claude',
        isActive: true,
        context: [{ role: 'system', content: 'You are a helpful assistant' }],
        createdAt: expect.any(Date),
        expiresAt: expect.any(Date)
      }));

      expect(session.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it('should store sessions in database', async () => {
      const session = await sessionManager.createSession(
        testApiKey.id,
        'claude'
      );

      const dbResult = await query('SELECT * FROM sessions WHERE id = $1', [session.id]);
      const dbSession = dbResult.rows[0];

      expect(dbSession).toBeTruthy();
      expect(dbSession.api_key_id).toBe(testApiKey.id);
      expect(dbSession.tool_id).toBe('claude');
      expect(dbSession.is_active).toBe(true);
    });

    it('should cache sessions in Redis', async () => {
      const session = await sessionManager.createSession(
        testApiKey.id,
        'claude'
      );

      const cached = await sessionManager.sessionCache.get(session.id);
      expect(cached).toBeTruthy();
      expect(cached.id).toBe(session.id);
    });

    it('should use default TTL when not specified', async () => {
      const session = await sessionManager.createSession(
        testApiKey.id,
        'claude'
      );

      const expectedExpiry = new Date(Date.now() + 3600000); // 1 hour default
      const actualExpiry = new Date(session.expiresAt);
      
      expect(Math.abs(actualExpiry.getTime() - expectedExpiry.getTime())).toBeLessThan(5000); // Within 5 seconds
    });

    it('should handle custom metadata', async () => {
      const metadata = {
        clientVersion: '1.0.0',
        features: ['streaming', 'context'],
        customData: { key: 'value' }
      };

      const session = await sessionManager.createSession(
        testApiKey.id,
        'claude',
        { metadata }
      );

      expect(session.metadata).toEqual(metadata);
    });
  });

  describe('Session Retrieval', () => {
    let testSession;

    beforeEach(async () => {
      testSession = await sessionManager.createSession(
        testApiKey.id,
        'claude',
        { initialContext: [{ role: 'user', content: 'Hello' }] }
      );
    });

    it('should retrieve sessions by ID', async () => {
      const retrieved = await sessionManager.getSession(testSession.id, testApiKey.id);
      
      expect(retrieved).toEqual(expect.objectContaining({
        id: testSession.id,
        apiKeyId: testApiKey.id,
        toolId: 'claude',
        context: [{ role: 'user', content: 'Hello' }]
      }));
    });

    it('should use Redis cache for retrieval', async () => {
      // First retrieval should populate cache
      await sessionManager.getSession(testSession.id, testApiKey.id);
      
      // Second retrieval should be from cache (faster)
      const startTime = Date.now();
      const cached = await sessionManager.getSession(testSession.id, testApiKey.id);
      const endTime = Date.now();
      
      expect(cached).toBeTruthy();
      expect(endTime - startTime).toBeLessThan(50); // Should be very fast from cache
    });

    it('should fallback to database when not in cache', async () => {
      // Clear cache
      await sessionManager.sessionCache.delete(testSession.id);
      
      const retrieved = await sessionManager.getSession(testSession.id, testApiKey.id);
      expect(retrieved).toBeTruthy();
      expect(retrieved.id).toBe(testSession.id);
    });

    it('should return null for non-existent sessions', async () => {
      const result = await sessionManager.getSession('non-existent-id', testApiKey.id);
      expect(result).toBeNull();
    });

    it('should return null for sessions from different API keys', async () => {
      // Create another API key
      const otherKeyResult = await query(`
        INSERT INTO api_keys (user_id, key_hash, name, rate_limit_per_hour)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [testUser.id, await bcrypt.hash('other-key', 10), 'Other Key', 1000]);

      const result = await sessionManager.getSession(testSession.id, otherKeyResult.rows[0].id);
      expect(result).toBeNull();
    });

    it('should handle expired sessions', async () => {
      // Create expired session
      const expiredSession = await sessionManager.createSession(
        testApiKey.id,
        'claude',
        { ttlSeconds: -1 } // Already expired
      );

      const result = await sessionManager.getSession(expiredSession.id, testApiKey.id);
      expect(result).toBeNull();
    });
  });

  describe('Session Updates', () => {
    let testSession;

    beforeEach(async () => {
      testSession = await sessionManager.createSession(
        testApiKey.id,
        'claude'
      );
    });

    it('should update session metadata', async () => {
      const newMetadata = { updated: true, version: '2.0' };
      
      const updated = await sessionManager.updateSession(
        testSession.id,
        testApiKey.id,
        { metadata: newMetadata }
      );

      expect(updated.metadata).toEqual(newMetadata);
    });

    it('should extend session TTL', async () => {
      const originalExpiry = new Date(testSession.expiresAt);
      
      const updated = await sessionManager.updateSession(
        testSession.id,
        testApiKey.id,
        { extendTtlSeconds: 1800 } // Extend by 30 minutes
      );

      const newExpiry = new Date(updated.expiresAt);
      expect(newExpiry.getTime()).toBeGreaterThan(originalExpiry.getTime());
    });

    it('should update both database and cache', async () => {
      const newMetadata = { source: 'test update' };
      
      await sessionManager.updateSession(
        testSession.id,
        testApiKey.id,
        { metadata: newMetadata }
      );

      // Check database
      const dbResult = await query('SELECT * FROM sessions WHERE id = $1', [testSession.id]);
      const dbMetadata = dbResult.rows[0].metadata;
      expect(dbMetadata).toEqual(newMetadata);

      // Check cache
      const cached = await sessionManager.sessionCache.get(testSession.id);
      expect(cached.metadata).toEqual(newMetadata);
    });

    it('should return null for non-existent sessions', async () => {
      const result = await sessionManager.updateSession(
        'non-existent-id',
        testApiKey.id,
        { metadata: { test: true } }
      );

      expect(result).toBeNull();
    });
  });

  describe('Session Context Management', () => {
    let testSession;

    beforeEach(async () => {
      testSession = await sessionManager.createSession(
        testApiKey.id,
        'claude',
        { initialContext: [{ role: 'system', content: 'System message' }] }
      );
    });

    it('should add messages to session context', async () => {
      const message = { role: 'user', content: 'Hello, Claude!' };
      
      await sessionManager.addMessage(testSession.id, testApiKey.id, message);
      
      const updated = await sessionManager.getSession(testSession.id, testApiKey.id);
      expect(updated.context).toHaveLength(2);
      expect(updated.context[1]).toEqual(expect.objectContaining(message));
    });

    it('should maintain message order', async () => {
      const messages = [
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'First response' },
        { role: 'user', content: 'Second message' }
      ];

      for (const message of messages) {
        await sessionManager.addMessage(testSession.id, testApiKey.id, message);
      }

      const updated = await sessionManager.getSession(testSession.id, testApiKey.id);
      expect(updated.context).toHaveLength(4); // Initial system message + 3 added
      expect(updated.context[1].content).toBe('First message');
      expect(updated.context[2].content).toBe('First response');
      expect(updated.context[3].content).toBe('Second message');
    });

    it('should add timestamps to messages', async () => {
      const message = { role: 'user', content: 'Timestamped message' };
      
      await sessionManager.addMessage(testSession.id, testApiKey.id, message);
      
      const updated = await sessionManager.getSession(testSession.id, testApiKey.id);
      const addedMessage = updated.context[1];
      
      expect(addedMessage.timestamp).toBeInstanceOf(Date);
      expect(addedMessage.timestamp.getTime()).toBeLessThanOrEqual(Date.now());
    });

    it('should handle context size limits', async () => {
      // Add many messages to test context trimming
      for (let i = 0; i < 50; i++) {
        await sessionManager.addMessage(testSession.id, testApiKey.id, {
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`
        });
      }

      const updated = await sessionManager.getSession(testSession.id, testApiKey.id);
      expect(updated.context.length).toBeLessThanOrEqual(100); // Assuming max context size of 100
    });
  });

  describe('Session Listing', () => {
    beforeEach(async () => {
      // Create multiple sessions
      const sessions = [
        { toolId: 'claude', metadata: { type: 'chat' } },
        { toolId: 'openai', metadata: { type: 'completion' } },
        { toolId: 'claude', metadata: { type: 'analysis' }, ttlSeconds: -1 } // Expired
      ];

      for (const sessionData of sessions) {
        await sessionManager.createSession(testApiKey.id, sessionData.toolId, sessionData);
      }
    });

    it('should list user sessions', async () => {
      const result = await sessionManager.getUserSessions(testApiKey.id);
      
      expect(result.sessions).toHaveLength(2); // Only active sessions
      expect(result.total).toBe(2);
      expect(result.sessions.every(s => s.isActive)).toBe(true);
    });

    it('should filter sessions by tool ID', async () => {
      const result = await sessionManager.getUserSessions(testApiKey.id, {
        toolId: 'claude'
      });

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0].toolId).toBe('claude');
    });

    it('should filter sessions by active status', async () => {
      const result = await sessionManager.getUserSessions(testApiKey.id, {
        isActive: false
      });

      expect(result.sessions).toHaveLength(1); // Only expired session
      expect(result.sessions[0].isActive).toBe(false);
    });

    it('should support pagination', async () => {
      // Create more sessions for pagination
      for (let i = 0; i < 8; i++) {
        await sessionManager.createSession(testApiKey.id, 'claude');
      }

      const firstPage = await sessionManager.getUserSessions(testApiKey.id, {
        limit: 5,
        offset: 0
      });

      const secondPage = await sessionManager.getUserSessions(testApiKey.id, {
        limit: 5,
        offset: 5
      });

      expect(firstPage.sessions).toHaveLength(5);
      expect(secondPage.sessions).toHaveLength(5);
      expect(firstPage.total).toBe(10); // Total active sessions
      expect(secondPage.total).toBe(10);
    });

    it('should sort sessions by creation date', async () => {
      const result = await sessionManager.getUserSessions(testApiKey.id);
      
      const createdTimes = result.sessions.map(s => new Date(s.createdAt).getTime());
      const sortedTimes = [...createdTimes].sort((a, b) => b - a); // Descending
      
      expect(createdTimes).toEqual(sortedTimes);
    });
  });

  describe('Session Deletion', () => {
    let testSession;

    beforeEach(async () => {
      testSession = await sessionManager.createSession(
        testApiKey.id,
        'claude'
      );
    });

    it('should delete sessions', async () => {
      const deleted = await sessionManager.deleteSession(testSession.id, testApiKey.id);
      expect(deleted).toBe(true);

      const retrieved = await sessionManager.getSession(testSession.id, testApiKey.id);
      expect(retrieved).toBeNull();
    });

    it('should remove sessions from database', async () => {
      await sessionManager.deleteSession(testSession.id, testApiKey.id);

      const dbResult = await query('SELECT * FROM sessions WHERE id = $1', [testSession.id]);
      expect(dbResult.rows).toHaveLength(0);
    });

    it('should remove sessions from cache', async () => {
      await sessionManager.deleteSession(testSession.id, testApiKey.id);

      const cached = await sessionManager.sessionCache.get(testSession.id);
      expect(cached).toBeNull();
    });

    it('should return false for non-existent sessions', async () => {
      const deleted = await sessionManager.deleteSession('non-existent', testApiKey.id);
      expect(deleted).toBe(false);
    });

    it('should only delete sessions owned by the API key', async () => {
      // Create another API key
      const otherKeyResult = await query(`
        INSERT INTO api_keys (user_id, key_hash, name, rate_limit_per_hour)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [testUser.id, await bcrypt.hash('other-key-2', 10), 'Other Key 2', 1000]);

      const deleted = await sessionManager.deleteSession(
        testSession.id, 
        otherKeyResult.rows[0].id
      );
      
      expect(deleted).toBe(false);
      
      // Original session should still exist
      const retrieved = await sessionManager.getSession(testSession.id, testApiKey.id);
      expect(retrieved).toBeTruthy();
    });
  });

  describe('Session Statistics', () => {
    beforeEach(async () => {
      // Create test sessions
      const sessions = [
        { toolId: 'claude', ttlSeconds: 3600 },
        { toolId: 'openai', ttlSeconds: 3600 },
        { toolId: 'claude', ttlSeconds: -1 }, // Expired
      ];

      for (const sessionData of sessions) {
        await sessionManager.createSession(testApiKey.id, sessionData.toolId, sessionData);
      }
    });

    it('should get active session count', async () => {
      const count = await sessionManager.getActiveSessionCount();
      expect(count).toBe(2);
    });

    it('should get cache statistics', async () => {
      const stats = await sessionManager.getCacheStats();
      
      expect(stats).toEqual(expect.objectContaining({
        size: expect.any(Number),
        hits: expect.any(Number),
        misses: expect.any(Number)
      }));
    });
  });

  describe('Session Cleanup', () => {
    it('should cleanup expired sessions', async () => {
      // Create expired sessions
      for (let i = 0; i < 3; i++) {
        await sessionManager.createSession(
          testApiKey.id,
          'claude',
          { ttlSeconds: -1 } // Already expired
        );
      }

      const cleanedUp = await sessionManager.cleanupExpiredSessions();
      expect(cleanedUp).toBe(3);

      const activeCount = await sessionManager.getActiveSessionCount();
      expect(activeCount).toBe(0);
    });

    it('should cleanup sessions from cache', async () => {
      // Create and then expire sessions
      const sessions = [];
      for (let i = 0; i < 3; i++) {
        const session = await sessionManager.createSession(testApiKey.id, 'claude');
        sessions.push(session);
      }

      // Manually expire them in database
      await query('UPDATE sessions SET expires_at = NOW() - INTERVAL \'1 hour\'');

      await sessionManager.cleanupExpiredSessions();

      // Check that they're removed from cache
      for (const session of sessions) {
        const cached = await sessionManager.sessionCache.get(session.id);
        expect(cached).toBeNull();
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      await closeDatabase();

      await expect(
        sessionManager.createSession(testApiKey.id, 'claude')
      ).rejects.toThrow();

      await initDatabase();
    });

    it('should handle Redis connection errors gracefully', async () => {
      await redisServices.redis.disconnect();

      // Should still work with database only
      const session = await sessionManager.createSession(testApiKey.id, 'claude');
      expect(session).toBeTruthy();

      await setupRedis();
    });

    it('should handle invalid session data', async () => {
      await expect(
        sessionManager.createSession(null, 'claude')
      ).rejects.toThrow();

      await expect(
        sessionManager.createSession(testApiKey.id, null)
      ).rejects.toThrow();
    });

    it('should handle malformed context data', async () => {
      await expect(
        sessionManager.createSession(testApiKey.id, 'claude', {
          initialContext: 'invalid-context-format'
        })
      ).rejects.toThrow();
    });
  });

  describe('Graceful Shutdown', () => {
    it('should shutdown gracefully', async () => {
      await expect(sessionManager.shutdown()).resolves.not.toThrow();
    });

    it('should cleanup resources on shutdown', async () => {
      const testManager = new SessionManager(redisServices);
      await testManager.shutdown();
      
      // Should not throw when accessing after shutdown
      expect(() => testManager.getCacheStats()).not.toThrow();
    });
  });
});