import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { setupRedis, closeRedis } from '../../services/redis.js';
import { initDatabase, closeDatabase, query } from '../../db/init.js';
import { ApiKeyManager } from '../../services/apiKeyManager.js';
import authRoutes from '../../routes/auth.js';
import bcrypt from 'bcryptjs';

describe('Auth Routes', () => {
  let app;
  let redisServices;
  let apiKeyManager;

  beforeAll(async () => {
    await initDatabase();
    redisServices = await setupRedis();
    apiKeyManager = new ApiKeyManager(redisServices);

    // Create Express app with auth routes
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
    
    app.use('/auth', authRoutes);
  });

  afterAll(async () => {
    await closeDatabase();
    await closeRedis();
  });

  beforeEach(async () => {
    // Clear database and Redis
    await query('DELETE FROM api_keys');
    await query('DELETE FROM users');
    await redisServices.redis.flushdb();
  });

  describe('POST /auth/register', () => {
    it('should register new users successfully', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'securePassword123',
        role: 'user'
      };

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body).toEqual({
        success: true,
        message: 'User registered successfully',
        user: expect.objectContaining({
          id: expect.any(String),
          email: userData.email,
          role: userData.role,
          isActive: true,
          createdAt: expect.any(String)
        })
      });

      // Verify user is in database
      const dbResult = await query('SELECT * FROM users WHERE email = $1', [userData.email]);
      expect(dbResult.rows).toHaveLength(1);
      
      const dbUser = dbResult.rows[0];
      expect(dbUser.email).toBe(userData.email);
      expect(dbUser.role).toBe(userData.role);
      expect(await bcrypt.compare(userData.password, dbUser.password_hash)).toBe(true);
    });

    it('should reject invalid email formats', async () => {
      const userData = {
        email: 'invalid-email',
        password: 'securePassword123',
        role: 'user'
      };

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
      expect(response.body.details).toBeDefined();
    });

    it('should reject weak passwords', async () => {
      const userData = {
        email: 'test@example.com',
        password: '123', // Too short
        role: 'user'
      };

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should reject duplicate email addresses', async () => {
      const userData = {
        email: 'duplicate@example.com',
        password: 'securePassword123',
        role: 'user'
      };

      // Register first user
      await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(201);

      // Try to register with same email
      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Email already exists');
    });

    it('should default to user role when not specified', async () => {
      const userData = {
        email: 'defaultrole@example.com',
        password: 'securePassword123'
        // No role specified
      };

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.user.role).toBe('user');
    });

    it('should validate role values', async () => {
      const userData = {
        email: 'invalid-role@example.com',
        password: 'securePassword123',
        role: 'invalid-role'
      };

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('POST /auth/login', () => {
    let testUser;

    beforeEach(async () => {
      // Create test user
      const hashedPassword = await bcrypt.hash('testPassword123', 12);
      const userResult = await query(`
        INSERT INTO users (email, password_hash, role, is_active)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, ['login@example.com', hashedPassword, 'user', true]);
      
      testUser = userResult.rows[0];
    });

    it('should login users with correct credentials', async () => {
      const loginData = {
        email: 'login@example.com',
        password: 'testPassword123'
      };

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Login successful',
        token: expect.any(String),
        user: expect.objectContaining({
          id: testUser.id,
          email: testUser.email,
          role: testUser.role
        })
      });

      // Verify JWT token format
      expect(response.body.token).toMatch(/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/);
    });

    it('should reject invalid email', async () => {
      const loginData = {
        email: 'nonexistent@example.com',
        password: 'testPassword123'
      };

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should reject invalid password', async () => {
      const loginData = {
        email: 'login@example.com',
        password: 'wrongPassword'
      };

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid credentials');
    });

    it('should reject login for inactive users', async () => {
      // Deactivate user
      await query('UPDATE users SET is_active = false WHERE id = $1', [testUser.id]);

      const loginData = {
        email: 'login@example.com',
        password: 'testPassword123'
      };

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Account is inactive');
    });

    it('should validate login input', async () => {
      const loginData = {
        email: 'invalid-email-format',
        password: 'short'
      };

      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('POST /auth/logout', () => {
    let authToken;
    let testUser;

    beforeEach(async () => {
      // Register and login user
      const userData = {
        email: 'logout@example.com',
        password: 'testPassword123',
        role: 'user'
      };

      await request(app)
        .post('/auth/register')
        .send(userData);

      const loginResponse = await request(app)
        .post('/auth/login')
        .send({ email: userData.email, password: userData.password });

      authToken = loginResponse.body.token;
      testUser = loginResponse.body.user;
    });

    it('should logout users successfully', async () => {
      const response = await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Logout successful'
      });
    });

    it('should reject logout without token', async () => {
      const response = await request(app)
        .post('/auth/logout')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('No token provided');
    });

    it('should reject logout with invalid token', async () => {
      const response = await request(app)
        .post('/auth/logout')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid token');
    });

    it('should add token to blacklist', async () => {
      await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Token should be blacklisted
      const blacklisted = await redisServices.redis.get(`blacklist:${authToken}`);
      expect(blacklisted).toBeTruthy();
    });
  });

  describe('GET /auth/profile', () => {
    let authToken;
    let testUser;

    beforeEach(async () => {
      // Register and login user
      const userData = {
        email: 'profile@example.com',
        password: 'testPassword123',
        role: 'user'
      };

      const registerResponse = await request(app)
        .post('/auth/register')
        .send(userData);

      const loginResponse = await request(app)
        .post('/auth/login')
        .send({ email: userData.email, password: userData.password });

      authToken = loginResponse.body.token;
      testUser = loginResponse.body.user;
    });

    it('should get user profile successfully', async () => {
      const response = await request(app)
        .get('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        user: expect.objectContaining({
          id: testUser.id,
          email: testUser.email,
          role: testUser.role,
          isActive: true,
          createdAt: expect.any(String),
          lastLoginAt: expect.any(String)
        })
      });
    });

    it('should include API key statistics', async () => {
      // Create an API key for the user
      await apiKeyManager.generateApiKey(testUser.id, 'Test Key');

      const response = await request(app)
        .get('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.user.apiKeyCount).toBe(1);
    });

    it('should reject requests without token', async () => {
      const response = await request(app)
        .get('/auth/profile')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('No token provided');
    });

    it('should reject requests with invalid token', async () => {
      const response = await request(app)
        .get('/auth/profile')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid token');
    });

    it('should reject blacklisted tokens', async () => {
      // Logout to blacklist token
      await request(app)
        .post('/auth/logout')
        .set('Authorization', `Bearer ${authToken}`);

      const response = await request(app)
        .get('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Token has been revoked');
    });
  });

  describe('PUT /auth/profile', () => {
    let authToken;
    let testUser;

    beforeEach(async () => {
      // Register and login user
      const userData = {
        email: 'update@example.com',
        password: 'testPassword123',
        role: 'user'
      };

      const registerResponse = await request(app)
        .post('/auth/register')
        .send(userData);

      const loginResponse = await request(app)
        .post('/auth/login')
        .send({ email: userData.email, password: userData.password });

      authToken = loginResponse.body.token;
      testUser = loginResponse.body.user;
    });

    it('should update user profile successfully', async () => {
      const updateData = {
        email: 'updated@example.com'
      };

      const response = await request(app)
        .put('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Profile updated successfully',
        user: expect.objectContaining({
          id: testUser.id,
          email: 'updated@example.com',
          role: testUser.role
        })
      });
    });

    it('should update password successfully', async () => {
      const updateData = {
        currentPassword: 'testPassword123',
        newPassword: 'newSecurePassword456'
      };

      const response = await request(app)
        .put('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Profile updated successfully');

      // Verify password was changed by trying to login with new password
      const loginResponse = await request(app)
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: 'newSecurePassword456'
        })
        .expect(200);

      expect(loginResponse.body.success).toBe(true);
    });

    it('should reject password update with wrong current password', async () => {
      const updateData = {
        currentPassword: 'wrongPassword',
        newPassword: 'newSecurePassword456'
      };

      const response = await request(app)
        .put('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Current password is incorrect');
    });

    it('should reject duplicate email addresses', async () => {
      // Create another user first
      await request(app)
        .post('/auth/register')
        .send({
          email: 'existing@example.com',
          password: 'password123',
          role: 'user'
        });

      const updateData = {
        email: 'existing@example.com'
      };

      const response = await request(app)
        .put('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Email already exists');
    });

    it('should validate update data', async () => {
      const updateData = {
        email: 'invalid-email-format'
      };

      const response = await request(app)
        .put('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });

    it('should not allow role updates by regular users', async () => {
      const updateData = {
        role: 'admin'
      };

      const response = await request(app)
        .put('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateData)
        .expect(200);

      // Role should not be changed
      expect(response.body.user.role).toBe('user');
    });
  });

  describe('POST /auth/forgot-password', () => {
    let testUser;

    beforeEach(async () => {
      // Create test user
      const hashedPassword = await bcrypt.hash('testPassword123', 12);
      const userResult = await query(`
        INSERT INTO users (email, password_hash, role, is_active)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, ['forgot@example.com', hashedPassword, 'user', true]);
      
      testUser = userResult.rows[0];
    });

    it('should initiate password reset', async () => {
      const resetData = {
        email: 'forgot@example.com'
      };

      const response = await request(app)
        .post('/auth/forgot-password')
        .send(resetData)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Password reset instructions sent to email'
      });

      // Verify reset token is stored in Redis
      const resetToken = await redisServices.redis.get(`password_reset:${testUser.id}`);
      expect(resetToken).toBeTruthy();
    });

    it('should handle non-existent email gracefully', async () => {
      const resetData = {
        email: 'nonexistent@example.com'
      };

      const response = await request(app)
        .post('/auth/forgot-password')
        .send(resetData)
        .expect(200);

      // Should return success to prevent email enumeration
      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Password reset instructions sent to email');
    });

    it('should validate email format', async () => {
      const resetData = {
        email: 'invalid-email'
      };

      const response = await request(app)
        .post('/auth/forgot-password')
        .send(resetData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Validation failed');
    });
  });

  describe('JWT Token Validation', () => {
    let authToken;
    let testUser;

    beforeEach(async () => {
      const userData = {
        email: 'jwt@example.com',
        password: 'testPassword123',
        role: 'user'
      };

      await request(app).post('/auth/register').send(userData);
      const loginResponse = await request(app)
        .post('/auth/login')
        .send({ email: userData.email, password: userData.password });

      authToken = loginResponse.body.token;
      testUser = loginResponse.body.user;
    });

    it('should accept valid JWT tokens', async () => {
      const response = await request(app)
        .get('/auth/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should reject malformed tokens', async () => {
      const malformedTokens = [
        'not-a-jwt',
        'Bearer',
        'Bearer ',
        'Bearer invalid.token',
        'Bearer a.b', // Missing third part
        'InvalidFormat token'
      ];

      for (const token of malformedTokens) {
        const response = await request(app)
          .get('/auth/profile')
          .set('Authorization', token)
          .expect(401);

        expect(response.body.success).toBe(false);
      }
    });

    it('should handle expired tokens', async () => {
      // This would require mocking the JWT signing to create an expired token
      // For now, we'll test the error handling path
      const response = await request(app)
        .get('/auth/profile')
        .set('Authorization', 'Bearer expired.token.here')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid token');
    });
  });

  describe('Rate Limiting', () => {
    it('should enforce rate limits on login attempts', async () => {
      const loginData = {
        email: 'ratelimit@example.com',
        password: 'wrongPassword'
      };

      // Make multiple failed login attempts
      for (let i = 0; i < 6; i++) {
        await request(app)
          .post('/auth/login')
          .send(loginData);
      }

      // Next attempt should be rate limited
      const response = await request(app)
        .post('/auth/login')
        .send(loginData)
        .expect(429);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('rate limit');
    });
  });

  describe('Error Handling', () => {
    it('should handle database connection errors gracefully', async () => {
      await closeDatabase();

      const response = await request(app)
        .post('/auth/register')
        .send({
          email: 'error@example.com',
          password: 'password123'
        })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Internal server error');

      await initDatabase();
    });

    it('should handle Redis connection errors gracefully', async () => {
      await redisServices.redis.disconnect();

      // Should still work but without caching/blacklisting
      const userData = {
        email: 'noredis@example.com',
        password: 'testPassword123'
      };

      const response = await request(app)
        .post('/auth/register')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);

      await setupRedis();
    });
  });
});