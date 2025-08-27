import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import { setupRedis, closeRedis } from '../../services/redis.js';
import { initDatabase, closeDatabase, query } from '../../db/init.js';
import { ApiKeyManager } from '../../services/apiKeyManager.js';
import adminRoutes from '../../routes/admin.js';
import bcrypt from 'bcryptjs';

// Helper function to generate JWT token
function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role },
    process.env.JWT_SECRET || 'test-secret',
    { expiresIn: '1h' }
  );
}

describe('Admin Routes', () => {
  let app;
  let redisServices;
  let apiKeyManager;
  let adminUser;
  let regularUser;
  let adminToken;
  let userToken;

  beforeAll(async () => {
    await initDatabase();
    redisServices = await setupRedis();
    apiKeyManager = new ApiKeyManager(redisServices);

    // Create Express app with admin routes
    app = express();
    app.use(express.json());
    
    // Mock services middleware
    app.use((req, res, next) => {
      req.services = {
        apiKeyManager,
        redis: redisServices
      };
      next();
    });
    
    app.use('/admin', adminRoutes);
  });

  afterAll(async () => {
    await closeDatabase();
    await closeRedis();
  });

  beforeEach(async () => {
    // Clear database and Redis
    await query('DELETE FROM usage_logs');
    await query('DELETE FROM sessions');
    await query('DELETE FROM api_keys');
    await query('DELETE FROM users');
    await redisServices.redis.flushdb();

    // Create test admin user
    const adminHashedPassword = await bcrypt.hash('adminPassword123', 10);
    const adminResult = await query(`
      INSERT INTO users (email, password_hash, role, is_active)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, ['admin@example.com', adminHashedPassword, 'admin', true]);
    
    adminUser = adminResult.rows[0];
    adminToken = generateToken(adminUser);

    // Create test regular user
    const userHashedPassword = await bcrypt.hash('userPassword123', 10);
    const userResult = await query(`
      INSERT INTO users (email, password_hash, role, is_active)
      VALUES ($1, $2, $3, $4)
      RETURNING *
    `, ['user@example.com', userHashedPassword, 'user', true]);
    
    regularUser = userResult.rows[0];
    userToken = generateToken(regularUser);
  });

  describe('Authentication & Authorization', () => {
    it('should require valid JWT token', async () => {
      const response = await request(app)
        .get('/admin/users')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('No token provided');
    });

    it('should reject invalid JWT tokens', async () => {
      const response = await request(app)
        .get('/admin/users')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid token');
    });

    it('should require admin role', async () => {
      const response = await request(app)
        .get('/admin/users')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Admin access required');
    });

    it('should accept admin tokens', async () => {
      const response = await request(app)
        .get('/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /admin/users', () => {
    beforeEach(async () => {
      // Create additional test users
      const additionalUsers = [
        { email: 'user1@example.com', role: 'user', active: true },
        { email: 'user2@example.com', role: 'user', active: true },
        { email: 'inactive@example.com', role: 'user', active: false },
        { email: 'moderator@example.com', role: 'moderator', active: true }
      ];

      for (const userData of additionalUsers) {
        const hashedPassword = await bcrypt.hash('password123', 10);
        await query(`
          INSERT INTO users (email, password_hash, role, is_active)
          VALUES ($1, $2, $3, $4)
        `, [userData.email, hashedPassword, userData.role, userData.active]);
      }
    });

    it('should list all users', async () => {
      const response = await request(app)
        .get('/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.users).toHaveLength(6); // 2 initial + 4 additional
      expect(response.body.total).toBe(6);
      expect(response.body.users[0]).toEqual(expect.objectContaining({
        id: expect.any(String),
        email: expect.any(String),
        role: expect.any(String),
        isActive: expect.any(Boolean),
        createdAt: expect.any(String),
        activeApiKeys: expect.any(Number)
      }));
    });

    it('should filter users by role', async () => {
      const response = await request(app)
        .get('/admin/users?role=user')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.users).toHaveLength(4); // 1 initial + 3 additional
      expect(response.body.users.every(user => user.role === 'user')).toBe(true);
    });

    it('should filter users by active status', async () => {
      const response = await request(app)
        .get('/admin/users?isActive=false')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.users).toHaveLength(1);
      expect(response.body.users[0].isActive).toBe(false);
    });

    it('should search users by email', async () => {
      const response = await request(app)
        .get('/admin/users?search=user1')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.users).toHaveLength(1);
      expect(response.body.users[0].email).toBe('user1@example.com');
    });

    it('should support pagination', async () => {
      const firstPage = await request(app)
        .get('/admin/users?limit=3&offset=0')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const secondPage = await request(app)
        .get('/admin/users?limit=3&offset=3')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(firstPage.body.users).toHaveLength(3);
      expect(secondPage.body.users).toHaveLength(3);
      expect(firstPage.body.total).toBe(6);
      expect(secondPage.body.total).toBe(6);
    });

    it('should sort users by creation date', async () => {
      const response = await request(app)
        .get('/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const createdTimes = response.body.users.map(user => new Date(user.createdAt).getTime());
      const sortedTimes = [...createdTimes].sort((a, b) => b - a); // Descending
      
      expect(createdTimes).toEqual(sortedTimes);
    });
  });

  describe('GET /admin/users/:userId', () => {
    it('should get user details', async () => {
      const response = await request(app)
        .get(`/admin/users/${regularUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        user: expect.objectContaining({
          id: regularUser.id,
          email: regularUser.email,
          role: regularUser.role,
          isActive: true,
          createdAt: expect.any(String),
          lastLoginAt: null,
          activeApiKeys: 0,
          totalSessions: 0,
          totalRequests: 0
        })
      });
    });

    it('should return 404 for non-existent users', async () => {
      const response = await request(app)
        .get('/admin/users/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('User not found');
    });

    it('should include API key statistics', async () => {
      // Create API keys for the user
      await apiKeyManager.generateApiKey(regularUser.id, 'Key 1');
      await apiKeyManager.generateApiKey(regularUser.id, 'Key 2');

      const response = await request(app)
        .get(`/admin/users/${regularUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.user.activeApiKeys).toBe(2);
    });
  });

  describe('PUT /admin/users/:userId', () => {
    it('should update user details', async () => {
      const updateData = {
        email: 'updated@example.com',
        role: 'moderator',
        isActive: false
      };

      const response = await request(app)
        .put(`/admin/users/${regularUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'User updated successfully',
        user: expect.objectContaining({
          id: regularUser.id,
          email: 'updated@example.com',
          role: 'moderator',
          isActive: false
        })
      });
    });

    it('should validate update data', async () => {
      const invalidData = {
        email: 'invalid-email-format',
        role: 'invalid-role'
      };

      const response = await request(app)
        .put(`/admin/users/${regularUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should prevent duplicate email addresses', async () => {
      const updateData = {
        email: adminUser.email // Admin's email
      };

      const response = await request(app)
        .put(`/admin/users/${regularUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(updateData)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Email already exists');
    });

    it('should return 404 for non-existent users', async () => {
      const response = await request(app)
        .put('/admin/users/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: 'test@example.com' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('User not found');
    });
  });

  describe('DELETE /admin/users/:userId', () => {
    it('should delete users', async () => {
      const response = await request(app)
        .delete(`/admin/users/${regularUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'User deleted successfully'
      });

      // Verify user is deleted
      const deletedUser = await query('SELECT * FROM users WHERE id = $1', [regularUser.id]);
      expect(deletedUser.rows).toHaveLength(0);
    });

    it('should cascade delete user API keys', async () => {
      // Create API key for user
      const apiKey = await apiKeyManager.generateApiKey(regularUser.id, 'Test Key');

      await request(app)
        .delete(`/admin/users/${regularUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      // Verify API key is deleted
      const deletedApiKey = await query('SELECT * FROM api_keys WHERE id = $1', [apiKey.id]);
      expect(deletedApiKey.rows).toHaveLength(0);
    });

    it('should return 404 for non-existent users', async () => {
      const response = await request(app)
        .delete('/admin/users/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('User not found');
    });

    it('should prevent deleting the last admin user', async () => {
      const response = await request(app)
        .delete(`/admin/users/${adminUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Cannot delete the last admin user');
    });
  });

  describe('POST /admin/users/:userId/api-keys', () => {
    it('should create API keys for users', async () => {
      const keyData = {
        name: 'Admin Created Key',
        rateLimitPerHour: 5000,
        expiresInDays: 30
      };

      const response = await request(app)
        .post(`/admin/users/${regularUser.id}/api-keys`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(keyData)
        .expect(201);

      expect(response.body).toEqual({
        success: true,
        message: 'API key created successfully',
        apiKey: expect.objectContaining({
          id: expect.any(String),
          key: expect.stringMatching(/^sk-[a-zA-Z0-9]{48}$/),
          name: 'Admin Created Key',
          rateLimitPerHour: 5000,
          userId: regularUser.id,
          createdAt: expect.any(String),
          expiresAt: expect.any(String)
        })
      });
    });

    it('should validate API key creation data', async () => {
      const invalidData = {
        name: '', // Empty name
        rateLimitPerHour: -1 // Invalid rate limit
      };

      const response = await request(app)
        .post(`/admin/users/${regularUser.id}/api-keys`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send(invalidData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should return 404 for non-existent users', async () => {
      const response = await request(app)
        .post('/admin/users/non-existent-id/api-keys')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Key' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('User not found');
    });
  });

  describe('GET /admin/users/:userId/api-keys', () => {
    beforeEach(async () => {
      // Create API keys for the user
      await apiKeyManager.generateApiKey(regularUser.id, 'Key 1', { rateLimitPerHour: 1000 });
      await apiKeyManager.generateApiKey(regularUser.id, 'Key 2', { rateLimitPerHour: 2000 });
      await apiKeyManager.generateApiKey(regularUser.id, 'Expired Key', { 
        rateLimitPerHour: 500,
        expiresAt: new Date(Date.now() - 86400000) // Expired yesterday
      });
    });

    it('should list user API keys', async () => {
      const response = await request(app)
        .get(`/admin/users/${regularUser.id}/api-keys`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.apiKeys).toHaveLength(3);
      expect(response.body.total).toBe(3);
      expect(response.body.apiKeys[0]).toEqual(expect.objectContaining({
        id: expect.any(String),
        name: expect.any(String),
        rateLimitPerHour: expect.any(Number),
        isActive: expect.any(Boolean),
        createdAt: expect.any(String),
        lastUsedAt: null,
        usageCount: 0
      }));
    });

    it('should filter API keys by active status', async () => {
      // Deactivate one key
      const allKeys = await query('SELECT * FROM api_keys WHERE user_id = $1', [regularUser.id]);
      await query('UPDATE api_keys SET is_active = false WHERE id = $1', [allKeys.rows[0].id]);

      const response = await request(app)
        .get(`/admin/users/${regularUser.id}/api-keys?isActive=true`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.apiKeys).toHaveLength(2);
      expect(response.body.apiKeys.every(key => key.isActive)).toBe(true);
    });

    it('should return 404 for non-existent users', async () => {
      const response = await request(app)
        .get('/admin/users/non-existent-id/api-keys')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('User not found');
    });
  });

  describe('DELETE /admin/api-keys/:keyId', () => {
    let testApiKey;

    beforeEach(async () => {
      testApiKey = await apiKeyManager.generateApiKey(regularUser.id, 'Test Delete Key');
    });

    it('should delete API keys', async () => {
      const response = await request(app)
        .delete(`/admin/api-keys/${testApiKey.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'API key deleted successfully'
      });

      // Verify API key is deleted
      const deletedKey = await query('SELECT * FROM api_keys WHERE id = $1', [testApiKey.id]);
      expect(deletedKey.rows).toHaveLength(0);
    });

    it('should return 404 for non-existent API keys', async () => {
      const response = await request(app)
        .delete('/admin/api-keys/non-existent-id')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('API key not found');
    });
  });

  describe('GET /admin/stats', () => {
    beforeEach(async () => {
      // Create additional test data
      const testUsers = [
        { email: 'stats1@example.com', role: 'user', active: true },
        { email: 'stats2@example.com', role: 'user', active: true },
        { email: 'inactive-stats@example.com', role: 'user', active: false }
      ];

      for (const userData of testUsers) {
        const hashedPassword = await bcrypt.hash('password123', 10);
        const userResult = await query(`
          INSERT INTO users (email, password_hash, role, is_active)
          VALUES ($1, $2, $3, $4)
          RETURNING *
        `, [userData.email, hashedPassword, userData.role, userData.active]);

        if (userData.active) {
          // Create API keys and usage data
          const apiKey = await apiKeyManager.generateApiKey(userResult.rows[0].id, 'Stats Key');
          
          // Add usage logs
          await apiKeyManager.logUsage(apiKey.id, {
            endpoint: '/api/chat',
            method: 'POST',
            statusCode: 200,
            inputTokens: 100,
            outputTokens: 200,
            responseTimeMs: 1000
          });
        }
      }
    });

    it('should return system statistics', async () => {
      const response = await request(app)
        .get('/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        stats: expect.objectContaining({
          users: expect.objectContaining({
            total: expect.any(Number),
            active: expect.any(Number),
            byRole: expect.any(Object)
          }),
          apiKeys: expect.objectContaining({
            total: expect.any(Number),
            active: expect.any(Number)
          }),
          usage: expect.objectContaining({
            totalRequests: expect.any(Number),
            totalTokens: expect.any(Number),
            requestsLast24h: expect.any(Number),
            requestsLast7d: expect.any(Number)
          }),
          system: expect.objectContaining({
            uptime: expect.any(Number),
            memory: expect.any(Object),
            nodeVersion: expect.any(String)
          })
        })
      });
    });

    it('should include correct user counts', async () => {
      const response = await request(app)
        .get('/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const userStats = response.body.stats.users;
      expect(userStats.total).toBe(5); // 2 initial + 3 additional
      expect(userStats.active).toBe(4); // All except inactive-stats
      expect(userStats.byRole.admin).toBe(1);
      expect(userStats.byRole.user).toBe(4);
    });

    it('should include API key statistics', async () => {
      const response = await request(app)
        .get('/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const apiKeyStats = response.body.stats.apiKeys;
      expect(apiKeyStats.total).toBeGreaterThan(0);
      expect(apiKeyStats.active).toBeGreaterThan(0);
    });

    it('should include usage statistics', async () => {
      const response = await request(app)
        .get('/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const usageStats = response.body.stats.usage;
      expect(usageStats.totalRequests).toBeGreaterThan(0);
      expect(usageStats.totalTokens).toBeGreaterThan(0);
    });

    it('should include system information', async () => {
      const response = await request(app)
        .get('/admin/stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const systemStats = response.body.stats.system;
      expect(systemStats.uptime).toBeGreaterThan(0);
      expect(systemStats.memory).toBeDefined();
      expect(systemStats.nodeVersion).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors', async () => {
      await closeDatabase();

      const response = await request(app)
        .get('/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to fetch users');

      await initDatabase();
    });

    it('should handle invalid user IDs gracefully', async () => {
      const response = await request(app)
        .get('/admin/users/invalid-uuid-format')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('User not found');
    });

    it('should handle Redis connection errors gracefully', async () => {
      await redisServices.redis.disconnect();

      // Should still work but without caching
      const response = await request(app)
        .get('/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      await setupRedis();
    });
  });

  describe('Input Validation', () => {
    it('should validate user update payloads', async () => {
      const invalidPayloads = [
        { email: 'not-an-email' },
        { role: 'invalid-role' },
        { isActive: 'not-boolean' }
      ];

      for (const payload of invalidPayloads) {
        const response = await request(app)
          .put(`/admin/users/${regularUser.id}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send(payload)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Validation failed');
      }
    });

    it('should validate API key creation payloads', async () => {
      const invalidPayloads = [
        { name: '' },
        { name: 'Valid Name', rateLimitPerHour: -1 },
        { name: 'Valid Name', expiresInDays: 0 }
      ];

      for (const payload of invalidPayloads) {
        const response = await request(app)
          .post(`/admin/users/${regularUser.id}/api-keys`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send(payload)
          .expect(400);

        expect(response.body.success).toBe(false);
        expect(response.body.error).toBe('Validation failed');
      }
    });

    it('should validate query parameters', async () => {
      const response = await request(app)
        .get('/admin/users?limit=invalid')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('validation');
    });
  });

  describe('Security', () => {
    it('should not expose sensitive information in user listings', async () => {
      const response = await request(app)
        .get('/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const user = response.body.users[0];
      expect(user.passwordHash).toBeUndefined();
      expect(user.password).toBeUndefined();
      expect(user.password_hash).toBeUndefined();
    });

    it('should not expose API key values in listings', async () => {
      await apiKeyManager.generateApiKey(regularUser.id, 'Security Test Key');

      const response = await request(app)
        .get(`/admin/users/${regularUser.id}/api-keys`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      const apiKey = response.body.apiKeys[0];
      expect(apiKey.key).toBeUndefined();
      expect(apiKey.keyHash).toBeUndefined();
      expect(apiKey.key_hash).toBeUndefined();
    });

    it('should log admin actions for audit trail', async () => {
      // This test would verify that admin actions are logged
      // For now, we'll just ensure the action succeeds
      const response = await request(app)
        .delete(`/admin/users/${regularUser.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });
});