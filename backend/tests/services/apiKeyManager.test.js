import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { ApiKeyManager } from '../../services/apiKeyManager.js';
import { setupRedis, closeRedis } from '../../services/redis.js';
import { initDatabase, closeDatabase, query } from '../../db/init.js';
import bcrypt from 'bcryptjs';

describe('ApiKeyManager', () => {
  let apiKeyManager;
  let redisServices;
  let testUser;

  beforeAll(async () => {
    await initDatabase();
    redisServices = await setupRedis();
    apiKeyManager = new ApiKeyManager(redisServices);
  });

  afterAll(async () => {
    await closeDatabase();
    await closeRedis();
  });

  beforeEach(async () => {
    // Clear database and Redis
    await query('DELETE FROM usage_logs');
    await query('DELETE FROM api_keys');
    await query('DELETE FROM users');
    await redisServices.redis.flushdb();

    // Create test user
    const userResult = await query(`
      INSERT INTO users (email, password_hash, role)
      VALUES ($1, $2, $3)
      RETURNING *
    `, ['test@example.com', await bcrypt.hash('password', 10), 'user']);
    
    testUser = userResult.rows[0];
  });

  describe('API Key Generation', () => {
    it('should generate API keys', async () => {
      const keyData = await apiKeyManager.generateApiKey(
        testUser.id,
        'Test API Key',
        { rateLimitPerHour: 1000 }
      );

      expect(keyData).toEqual(expect.objectContaining({
        id: expect.any(String),
        key: expect.any(String),
        name: 'Test API Key',
        userId: testUser.id,
        rateLimitPerHour: 1000
      }));

      expect(keyData.key).toMatch(/^sk-[a-zA-Z0-9]{48}$/);
    });

    it('should store API key hash in database', async () => {
      const keyData = await apiKeyManager.generateApiKey(
        testUser.id,
        'DB Test Key'
      );

      const dbResult = await query('SELECT * FROM api_keys WHERE id = $1', [keyData.id]);
      const storedKey = dbResult.rows[0];

      expect(storedKey).toBeTruthy();
      expect(storedKey.user_id).toBe(testUser.id);
      expect(storedKey.name).toBe('DB Test Key');
      expect(storedKey.key_hash).toBeTruthy();
      expect(storedKey.key_hash).not.toBe(keyData.key); // Should be hashed
    });

    it('should set default rate limits', async () => {
      const keyData = await apiKeyManager.generateApiKey(
        testUser.id,
        'Default Limits Key'
      );

      expect(keyData.rateLimitPerHour).toBe(1000); // Default value
    });

    it('should handle custom options', async () => {
      const options = {
        rateLimitPerHour: 5000,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
        permissions: ['read', 'write']
      };

      const keyData = await apiKeyManager.generateApiKey(
        testUser.id,
        'Custom Key',
        options
      );

      expect(keyData.rateLimitPerHour).toBe(5000);
      expect(keyData.expiresAt).toEqual(options.expiresAt);
    });
  });

  describe('API Key Validation', () => {
    let testApiKey;

    beforeEach(async () => {
      const keyData = await apiKeyManager.generateApiKey(
        testUser.id,
        'Validation Test Key'
      );
      testApiKey = keyData.key;
    });

    it('should validate correct API keys', async () => {
      const result = await apiKeyManager.validateApiKey(testApiKey);
      
      expect(result.isValid).toBe(true);
      expect(result.keyInfo).toBeTruthy();
      expect(result.keyInfo.userId).toBe(testUser.id);
      expect(result.keyInfo.name).toBe('Validation Test Key');
    });

    it('should reject invalid API keys', async () => {
      const result = await apiKeyManager.validateApiKey('invalid-key');
      
      expect(result.isValid).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should reject malformed API keys', async () => {
      const malformedKeys = [
        'sk-short',
        'invalid-prefix-12345678901234567890123456789012345678',
        '',
        null,
        undefined
      ];

      for (const key of malformedKeys) {
        const result = await apiKeyManager.validateApiKey(key);
        expect(result.isValid).toBe(false);
      }
    });

    it('should cache valid API keys', async () => {
      // First validation
      await apiKeyManager.validateApiKey(testApiKey);
      
      // Second validation should use cache
      const startTime = Date.now();
      const result = await apiKeyManager.validateApiKey(testApiKey);
      const endTime = Date.now();
      
      expect(result.isValid).toBe(true);
      expect(endTime - startTime).toBeLessThan(50); // Should be very fast from cache
    });

    it('should handle expired API keys', async () => {
      // Create expired key
      const expiredKeyData = await apiKeyManager.generateApiKey(
        testUser.id,
        'Expired Key',
        { expiresAt: new Date(Date.now() - 1000) } // 1 second ago
      );

      const result = await apiKeyManager.validateApiKey(expiredKeyData.key);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should handle inactive API keys', async () => {
      // Deactivate the key
      await query('UPDATE api_keys SET is_active = false WHERE key_hash = $1', 
        [await bcrypt.hash(testApiKey.replace('sk-', ''), 10)]);

      const result = await apiKeyManager.validateApiKey(testApiKey);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('inactive');
    });
  });

  describe('Rate Limiting', () => {
    let testApiKey;
    let keyInfo;

    beforeEach(async () => {
      const keyData = await apiKeyManager.generateApiKey(
        testUser.id,
        'Rate Limit Test',
        { rateLimitPerHour: 5 }
      );
      testApiKey = keyData.key;
      keyInfo = keyData;
    });

    it('should enforce rate limits', async () => {
      const keyId = keyInfo.id;
      const limit = 5;

      // Make requests up to the limit
      for (let i = 0; i < limit; i++) {
        const allowed = await apiKeyManager.checkRateLimit(keyId, limit);
        expect(allowed).toBe(true);
      }

      // Next request should be rejected
      const rejected = await apiKeyManager.checkRateLimit(keyId, limit);
      expect(rejected).toBe(false);
    });

    it('should get remaining requests', async () => {
      const keyId = keyInfo.id;
      const limit = 10;

      // Make some requests
      for (let i = 0; i < 3; i++) {
        await apiKeyManager.checkRateLimit(keyId, limit);
      }

      const remaining = await apiKeyManager.getRemainingRequests(keyId, limit);
      expect(remaining).toBe(7);
    });

    it('should handle burst limits', async () => {
      const keyId = keyInfo.id;
      const burstLimit = 3;

      // Test burst limit
      for (let i = 0; i < burstLimit; i++) {
        const allowed = await apiKeyManager.checkBurstLimit(keyId, burstLimit);
        expect(allowed).toBe(true);
      }

      const rejected = await apiKeyManager.checkBurstLimit(keyId, burstLimit);
      expect(rejected).toBe(false);
    });
  });

  describe('Usage Logging', () => {
    let keyInfo;

    beforeEach(async () => {
      keyInfo = await apiKeyManager.generateApiKey(
        testUser.id,
        'Usage Test Key'
      );
    });

    it('should log API usage', async () => {
      const usageData = {
        endpoint: '/api/chat',
        method: 'POST',
        statusCode: 200,
        inputTokens: 50,
        outputTokens: 100,
        responseTimeMs: 1500,
        ipAddress: '127.0.0.1',
        userAgent: 'Test Client'
      };

      await apiKeyManager.logUsage(keyInfo.id, usageData);

      const result = await query('SELECT * FROM usage_logs WHERE api_key_id = $1', [keyInfo.id]);
      const logEntry = result.rows[0];

      expect(logEntry).toBeTruthy();
      expect(logEntry.api_key_id).toBe(keyInfo.id);
      expect(logEntry.endpoint).toBe('/api/chat');
      expect(logEntry.method).toBe('POST');
      expect(logEntry.status_code).toBe(200);
      expect(logEntry.input_tokens).toBe(50);
      expect(logEntry.output_tokens).toBe(100);
    });

    it('should handle usage logging errors gracefully', async () => {
      const invalidUsageData = {
        endpoint: '/api/test',
        // Missing required fields
      };

      await expect(
        apiKeyManager.logUsage('invalid-key-id', invalidUsageData)
      ).rejects.toThrow();
    });

    it('should aggregate usage statistics', async () => {
      // Create multiple usage entries
      const usageEntries = [
        { endpoint: '/api/chat', inputTokens: 10, outputTokens: 20, statusCode: 200 },
        { endpoint: '/api/chat', inputTokens: 15, outputTokens: 30, statusCode: 200 },
        { endpoint: '/api/sessions', inputTokens: 5, outputTokens: 10, statusCode: 201 }
      ];

      for (const usage of usageEntries) {
        await apiKeyManager.logUsage(keyInfo.id, usage);
      }

      const stats = await apiKeyManager.getUsageStats(keyInfo.id, 1); // Last 1 day
      
      expect(stats.totalRequests).toBe(3);
      expect(stats.totalInputTokens).toBe(30);
      expect(stats.totalOutputTokens).toBe(60);
      expect(stats.successfulRequests).toBe(3);
    });
  });

  describe('API Key Statistics', () => {
    let keyInfo;

    beforeEach(async () => {
      keyInfo = await apiKeyManager.generateApiKey(
        testUser.id,
        'Stats Test Key'
      );

      // Add some usage data
      const usageEntries = [
        { endpoint: '/api/chat', inputTokens: 100, outputTokens: 200, statusCode: 200, responseTimeMs: 1000 },
        { endpoint: '/api/chat', inputTokens: 150, outputTokens: 250, statusCode: 200, responseTimeMs: 1200 },
        { endpoint: '/api/chat', inputTokens: 80, outputTokens: 160, statusCode: 500, responseTimeMs: 800 }
      ];

      for (const usage of usageEntries) {
        await apiKeyManager.logUsage(keyInfo.id, usage);
      }
    });

    it('should get API key statistics', async () => {
      const stats = await apiKeyManager.getApiKeyStats(keyInfo.id, testUser.id, 7);
      
      expect(stats).toEqual(expect.objectContaining({
        totalRequests: 3,
        successfulRequests: 2,
        failedRequests: 1,
        totalInputTokens: 330,
        totalOutputTokens: 610,
        avgResponseTime: expect.any(Number)
      }));
    });

    it('should filter statistics by date range', async () => {
      const stats = await apiKeyManager.getApiKeyStats(keyInfo.id, testUser.id, 1);
      
      expect(stats.totalRequests).toBe(3); // All should be within last day
    });

    it('should get endpoint breakdown', async () => {
      const stats = await apiKeyManager.getApiKeyStats(keyInfo.id, testUser.id, 7);
      
      expect(stats.endpointBreakdown).toBeDefined();
      expect(stats.endpointBreakdown['/api/chat']).toBe(3);
    });
  });

  describe('API Key Management', () => {
    let keyInfo;

    beforeEach(async () => {
      keyInfo = await apiKeyManager.generateApiKey(
        testUser.id,
        'Management Test Key'
      );
    });

    it('should list user API keys', async () => {
      // Create additional keys
      await apiKeyManager.generateApiKey(testUser.id, 'Key 2');
      await apiKeyManager.generateApiKey(testUser.id, 'Key 3');

      const keys = await apiKeyManager.getUserApiKeys(testUser.id);
      
      expect(keys).toHaveLength(3);
      expect(keys.every(key => key.userId === testUser.id)).toBe(true);
    });

    it('should deactivate API keys', async () => {
      const deactivated = await apiKeyManager.deactivateApiKey(keyInfo.id, testUser.id);
      expect(deactivated).toBe(true);

      const result = await query('SELECT is_active FROM api_keys WHERE id = $1', [keyInfo.id]);
      expect(result.rows[0].is_active).toBe(false);
    });

    it('should delete API keys', async () => {
      const deleted = await apiKeyManager.deleteApiKey(keyInfo.id, testUser.id);
      expect(deleted).toBe(true);

      const result = await query('SELECT * FROM api_keys WHERE id = $1', [keyInfo.id]);
      expect(result.rows).toHaveLength(0);
    });

    it('should update API key settings', async () => {
      const updates = {
        name: 'Updated Key Name',
        rateLimitPerHour: 2000
      };

      const updated = await apiKeyManager.updateApiKey(keyInfo.id, testUser.id, updates);
      expect(updated).toBe(true);

      const result = await query('SELECT * FROM api_keys WHERE id = $1', [keyInfo.id]);
      const updatedKey = result.rows[0];

      expect(updatedKey.name).toBe('Updated Key Name');
      expect(updatedKey.rate_limit_per_hour).toBe(2000);
    });
  });

  describe('Cache Management', () => {
    it('should get cache statistics', () => {
      const stats = apiKeyManager.getCacheStats();
      
      expect(stats).toEqual(expect.objectContaining({
        size: expect.any(Number),
        hits: expect.any(Number),
        misses: expect.any(Number),
        hitRate: expect.any(Number)
      }));
    });

    it('should clear cache', async () => {
      // Add something to cache first
      const keyData = await apiKeyManager.generateApiKey(testUser.id, 'Cache Test');
      await apiKeyManager.validateApiKey(keyData.key);

      apiKeyManager.clearCache();
      
      const stats = apiKeyManager.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it('should handle cache eviction', async () => {
      // Create many keys to test cache eviction
      const keys = [];
      for (let i = 0; i < 150; i++) { // More than default cache size
        const keyData = await apiKeyManager.generateApiKey(testUser.id, `Key ${i}`);
        keys.push(keyData.key);
      }

      // Validate all keys to fill cache
      for (const key of keys) {
        await apiKeyManager.validateApiKey(key);
      }

      const stats = apiKeyManager.getCacheStats();
      expect(stats.size).toBeLessThanOrEqual(100); // Should not exceed max cache size
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      // Close database connection
      await closeDatabase();

      await expect(
        apiKeyManager.generateApiKey(testUser.id, 'Error Test')
      ).rejects.toThrow();

      // Reconnect for other tests
      await initDatabase();
    });

    it('should handle invalid user IDs', async () => {
      await expect(
        apiKeyManager.generateApiKey('invalid-user-id', 'Invalid User Key')
      ).rejects.toThrow();
    });

    it('should handle Redis connection errors', async () => {
      // Disconnect Redis temporarily
      await redisServices.redis.disconnect();

      // Should still work but without caching
      const keyData = await apiKeyManager.generateApiKey(testUser.id, 'No Cache Key');
      expect(keyData).toBeTruthy();

      // Reconnect Redis
      await setupRedis();
    });
  });
});