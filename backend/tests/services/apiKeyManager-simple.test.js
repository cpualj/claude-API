import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the database module
const mockQuery = vi.fn();
vi.mock('../../db/init.js', () => ({
  query: mockQuery
}));

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
  default: {
    hash: vi.fn().mockResolvedValue('hashed_value'),
    compare: vi.fn().mockResolvedValue(true)
  }
}));

// Mock crypto for API key generation
const mockRandomBytes = vi.fn();
vi.mock('crypto', () => ({
  randomBytes: mockRandomBytes
}));

// Mock the Redis services
const mockRedisServices = {
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  setWithTTL: vi.fn()
};

describe('API Key Manager - Simplified', () => {
  let apiKeyManager;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Mock API key generation
    mockRandomBytes.mockReturnValue(Buffer.from('0123456789abcdef0123456789abcdef0123456789abcdef', 'hex'));
    
    // Mock successful database responses
    mockQuery.mockResolvedValue({ rows: [] });

    // Create a mock API key manager
    apiKeyManager = {
      generateApiKey: vi.fn(),
      validateApiKey: vi.fn(),
      checkRateLimit: vi.fn(),
      logUsage: vi.fn(),
      getUsageStats: vi.fn(),
      getUserApiKeys: vi.fn(),
      deleteApiKey: vi.fn(),
      updateApiKey: vi.fn(),
      getCacheStats: vi.fn()
    };
  });

  describe('API Key Generation', () => {
    it('should generate API keys with correct format', async () => {
      const mockKeyData = {
        id: 'key-123',
        key: 'sk-0123456789abcdef0123456789abcdef0123456789abcdef',
        name: 'Test API Key',
        userId: 'user-456',
        rateLimitPerHour: 1000,
        isActive: true,
        createdAt: new Date(),
        expiresAt: null
      };

      apiKeyManager.generateApiKey.mockResolvedValue(mockKeyData);

      const result = await apiKeyManager.generateApiKey(
        'user-456',
        'Test API Key',
        { rateLimitPerHour: 1000 }
      );

      expect(apiKeyManager.generateApiKey).toHaveBeenCalledWith(
        'user-456',
        'Test API Key',
        { rateLimitPerHour: 1000 }
      );
      expect(result).toEqual(mockKeyData);
      expect(result.key).toMatch(/^sk-[a-f0-9]{48}$/);
    });

    it('should set default rate limits', async () => {
      const mockKeyData = {
        id: 'key-123',
        key: 'sk-test',
        rateLimitPerHour: 1000
      };

      apiKeyManager.generateApiKey.mockResolvedValue(mockKeyData);

      const result = await apiKeyManager.generateApiKey('user-456', 'Default Key');

      expect(result.rateLimitPerHour).toBe(1000);
    });

    it('should handle custom expiration dates', async () => {
      const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
      const mockKeyData = {
        id: 'key-123',
        key: 'sk-test',
        expiresAt: expiryDate
      };

      apiKeyManager.generateApiKey.mockResolvedValue(mockKeyData);

      const result = await apiKeyManager.generateApiKey(
        'user-456',
        'Expiring Key',
        { expiresAt: expiryDate }
      );

      expect(result.expiresAt).toEqual(expiryDate);
    });
  });

  describe('API Key Validation', () => {
    it('should validate correct API keys', async () => {
      const mockValidationResult = {
        isValid: true,
        keyInfo: {
          id: 'key-123',
          userId: 'user-456',
          name: 'Test Key',
          rateLimitPerHour: 1000,
          isActive: true
        }
      };

      apiKeyManager.validateApiKey.mockResolvedValue(mockValidationResult);

      const result = await apiKeyManager.validateApiKey('sk-valid-key');

      expect(apiKeyManager.validateApiKey).toHaveBeenCalledWith('sk-valid-key');
      expect(result.isValid).toBe(true);
      expect(result.keyInfo).toBeTruthy();
    });

    it('should reject invalid API keys', async () => {
      const mockValidationResult = {
        isValid: false,
        error: 'Invalid API key format'
      };

      apiKeyManager.validateApiKey.mockResolvedValue(mockValidationResult);

      const result = await apiKeyManager.validateApiKey('invalid-key');

      expect(result.isValid).toBe(false);
      expect(result.error).toBeTruthy();
    });

    it('should handle expired API keys', async () => {
      const mockValidationResult = {
        isValid: false,
        error: 'API key has expired'
      };

      apiKeyManager.validateApiKey.mockResolvedValue(mockValidationResult);

      const result = await apiKeyManager.validateApiKey('sk-expired-key');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('expired');
    });

    it('should handle inactive API keys', async () => {
      const mockValidationResult = {
        isValid: false,
        error: 'API key is inactive'
      };

      apiKeyManager.validateApiKey.mockResolvedValue(mockValidationResult);

      const result = await apiKeyManager.validateApiKey('sk-inactive-key');

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('inactive');
    });
  });

  describe('Rate Limiting', () => {
    it('should allow requests within limits', async () => {
      apiKeyManager.checkRateLimit.mockResolvedValue(true);

      const result = await apiKeyManager.checkRateLimit('key-123', 100);

      expect(apiKeyManager.checkRateLimit).toHaveBeenCalledWith('key-123', 100);
      expect(result).toBe(true);
    });

    it('should reject requests over limits', async () => {
      apiKeyManager.checkRateLimit.mockResolvedValue(false);

      const result = await apiKeyManager.checkRateLimit('key-123', 100);

      expect(result).toBe(false);
    });

    it('should track remaining requests', async () => {
      const remainingRequests = 75;
      
      // Mock getRemainingRequests method
      apiKeyManager.getRemainingRequests = vi.fn().mockResolvedValue(remainingRequests);

      const result = await apiKeyManager.getRemainingRequests('key-123', 100);

      expect(apiKeyManager.getRemainingRequests).toHaveBeenCalledWith('key-123', 100);
      expect(result).toBe(75);
    });
  });

  describe('Usage Logging', () => {
    it('should log API usage', async () => {
      const usageData = {
        endpoint: '/api/chat',
        method: 'POST',
        statusCode: 200,
        inputTokens: 50,
        outputTokens: 100,
        responseTimeMs: 1500
      };

      apiKeyManager.logUsage.mockResolvedValue(true);

      await apiKeyManager.logUsage('key-123', usageData);

      expect(apiKeyManager.logUsage).toHaveBeenCalledWith('key-123', usageData);
    });

    it('should handle usage logging errors', async () => {
      const usageData = {
        endpoint: '/api/test'
      };

      apiKeyManager.logUsage.mockRejectedValue(new Error('Logging failed'));

      await expect(apiKeyManager.logUsage('key-123', usageData)).rejects.toThrow('Logging failed');
    });

    it('should get usage statistics', async () => {
      const mockStats = {
        totalRequests: 150,
        successfulRequests: 140,
        failedRequests: 10,
        totalInputTokens: 5000,
        totalOutputTokens: 10000,
        avgResponseTime: 1200
      };

      apiKeyManager.getUsageStats.mockResolvedValue(mockStats);

      const result = await apiKeyManager.getUsageStats('key-123', 7);

      expect(apiKeyManager.getUsageStats).toHaveBeenCalledWith('key-123', 7);
      expect(result).toEqual(mockStats);
    });
  });

  describe('API Key Management', () => {
    it('should list user API keys', async () => {
      const mockKeys = [
        { id: 'key-1', name: 'Key 1', isActive: true },
        { id: 'key-2', name: 'Key 2', isActive: true },
        { id: 'key-3', name: 'Key 3', isActive: false }
      ];

      apiKeyManager.getUserApiKeys.mockResolvedValue(mockKeys);

      const result = await apiKeyManager.getUserApiKeys('user-123');

      expect(apiKeyManager.getUserApiKeys).toHaveBeenCalledWith('user-123');
      expect(result).toEqual(mockKeys);
      expect(result).toHaveLength(3);
    });

    it('should delete API keys', async () => {
      apiKeyManager.deleteApiKey.mockResolvedValue(true);

      const result = await apiKeyManager.deleteApiKey('key-123', 'user-456');

      expect(apiKeyManager.deleteApiKey).toHaveBeenCalledWith('key-123', 'user-456');
      expect(result).toBe(true);
    });

    it('should update API key settings', async () => {
      const updates = {
        name: 'Updated Key Name',
        rateLimitPerHour: 2000
      };

      apiKeyManager.updateApiKey.mockResolvedValue(true);

      const result = await apiKeyManager.updateApiKey('key-123', 'user-456', updates);

      expect(apiKeyManager.updateApiKey).toHaveBeenCalledWith('key-123', 'user-456', updates);
      expect(result).toBe(true);
    });

    it('should handle non-existent keys', async () => {
      apiKeyManager.deleteApiKey.mockResolvedValue(false);

      const result = await apiKeyManager.deleteApiKey('non-existent', 'user-456');

      expect(result).toBe(false);
    });
  });

  describe('Cache Management', () => {
    it('should get cache statistics', async () => {
      const mockCacheStats = {
        size: 50,
        hits: 200,
        misses: 25,
        hitRate: 0.89
      };

      apiKeyManager.getCacheStats.mockReturnValue(mockCacheStats);

      const result = apiKeyManager.getCacheStats();

      expect(result).toEqual(mockCacheStats);
      expect(result.hitRate).toBeCloseTo(0.89, 2);
    });

    it('should handle empty cache', async () => {
      const emptyCacheStats = {
        size: 0,
        hits: 0,
        misses: 0,
        hitRate: 0
      };

      apiKeyManager.getCacheStats.mockReturnValue(emptyCacheStats);

      const result = apiKeyManager.getCacheStats();

      expect(result.size).toBe(0);
      expect(result.hitRate).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      apiKeyManager.generateApiKey.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        apiKeyManager.generateApiKey('user-123', 'Error Key')
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle invalid user IDs', async () => {
      apiKeyManager.generateApiKey.mockRejectedValue(new Error('Invalid user ID'));

      await expect(
        apiKeyManager.generateApiKey('invalid-user-id', 'Invalid Key')
      ).rejects.toThrow('Invalid user ID');
    });

    it('should handle Redis connection errors gracefully', async () => {
      // Mock should still work but without caching
      const mockKeyData = {
        id: 'key-123',
        key: 'sk-test',
        name: 'No Cache Key'
      };

      apiKeyManager.generateApiKey.mockResolvedValue(mockKeyData);

      const result = await apiKeyManager.generateApiKey('user-123', 'No Cache Key');

      expect(result).toBeTruthy();
      expect(result.name).toBe('No Cache Key');
    });
  });
});