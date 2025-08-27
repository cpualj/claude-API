import express from 'express';
import { z } from 'zod';
import { authMiddleware, adminMiddleware } from '../middleware/auth.js';
import { query } from '../db/init.js';

const router = express.Router();

// 应用中间件
router.use(authMiddleware);
router.use(adminMiddleware);

// 验证 schemas
const createUserSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['user', 'admin']).optional().default('user')
});

const updateUserSchema = z.object({
  email: z.string().email('Invalid email format').optional(),
  role: z.enum(['user', 'admin']).optional(),
  isActive: z.boolean().optional()
});

const createApiKeySchema = z.object({
  userId: z.string().uuid('Invalid user ID'),
  name: z.string().min(1, 'Name is required'),
  permissions: z.object({}).optional().default({}),
  rateLimitPerHour: z.number().min(1).max(10000).optional().default(1000),
  expiresInDays: z.number().min(1).max(365).optional()
});

// === 用户管理 ===

// 获取所有用户
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role, isActive } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    const values = [];
    let paramIndex = 1;

    if (search) {
      whereClause += ` AND email ILIKE $${paramIndex}`;
      values.push(`%${search}%`);
      paramIndex++;
    }

    if (role) {
      whereClause += ` AND role = $${paramIndex}`;
      values.push(role);
      paramIndex++;
    }

    if (isActive !== undefined) {
      whereClause += ` AND is_active = $${paramIndex}`;
      values.push(isActive === 'true');
      paramIndex++;
    }

    const [usersResult, countResult] = await Promise.all([
      query(
        `SELECT id, email, role, is_active, created_at, updated_at,
                (SELECT COUNT(*) FROM api_keys WHERE user_id = users.id AND is_active = true) as active_api_keys
         FROM users 
         WHERE ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, parseInt(limit), offset]
      ),
      query(
        `SELECT COUNT(*) as total FROM users WHERE ${whereClause}`,
        values
      )
    ]);

    res.json({
      success: true,
      users: usersResult.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(countResult.rows[0].total / limit)
      }
    });

  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve users'
    });
  }
});

// 获取单个用户详情
router.get('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const [userResult, apiKeysResult, statsResult] = await Promise.all([
      query('SELECT id, email, role, is_active, created_at, updated_at FROM users WHERE id = $1', [userId]),
      query(
        'SELECT id, name, key_prefix, permissions, rate_limit_per_hour, is_active, last_used_at, expires_at, created_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      ),
      query(
        `SELECT 
           COUNT(*) as total_requests,
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as requests_today,
           COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as requests_week,
           SUM(total_tokens) as total_tokens_used
         FROM usage_logs ul
         JOIN api_keys ak ON ul.api_key_id = ak.id
         WHERE ak.user_id = $1`,
        [userId]
      )
    ]);

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = userResult.rows[0];
    const apiKeys = apiKeysResult.rows;
    const stats = statsResult.rows[0];

    res.json({
      success: true,
      user: {
        ...user,
        apiKeys,
        stats: {
          totalRequests: parseInt(stats.total_requests) || 0,
          requestsToday: parseInt(stats.requests_today) || 0,
          requestsWeek: parseInt(stats.requests_week) || 0,
          totalTokensUsed: parseInt(stats.total_tokens_used) || 0
        }
      }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve user'
    });
  }
});

// 创建新用户
router.post('/users', async (req, res) => {
  try {
    const validationResult = createUserSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validationResult.error.errors
      });
    }

    const { email, password, role } = validationResult.data;

    // 检查邮箱是否已存在
    const existingUser = await query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Email already exists'
      });
    }

    // 创建用户
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.hash(password, 12);

    const result = await query(
      'INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3) RETURNING id, email, role, is_active, created_at',
      [email.toLowerCase(), passwordHash, role]
    );

    const user = result.rows[0];

    console.log(`✅ User created by admin: ${email} (${role})`);

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      user
    });

  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create user'
    });
  }
});

// 更新用户
router.put('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const validationResult = updateUserSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validationResult.error.errors
      });
    }

    const updates = validationResult.data;
    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        const dbKey = key === 'isActive' ? 'is_active' : key;
        updateFields.push(`${dbKey} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No fields to update'
      });
    }

    // 检查邮箱重复（如果更新邮箱）
    if (updates.email) {
      const existingUser = await query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [updates.email.toLowerCase(), userId]
      );
      if (existingUser.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Email already exists'
        });
      }
    }

    updateFields.push('updated_at = NOW()');
    values.push(userId);

    const result = await query(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = $${paramIndex} RETURNING id, email, role, is_active, created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    console.log(`✅ User updated by admin: ${userId}`);

    res.json({
      success: true,
      message: 'User updated successfully',
      user: result.rows[0]
    });

  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update user'
    });
  }
});

// 删除用户
router.delete('/users/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // 检查是否是最后一个管理员
    const adminCount = await query('SELECT COUNT(*) as count FROM users WHERE role = $1 AND is_active = true', ['admin']);
    const userToDelete = await query('SELECT role FROM users WHERE id = $1', [userId]);
    
    if (userToDelete.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (userToDelete.rows[0].role === 'admin' && parseInt(adminCount.rows[0].count) <= 1) {
      return res.status(400).json({
        success: false,
        error: 'Cannot delete the last admin user'
      });
    }

    // 软删除（设为非活跃）而不是硬删除
    const result = await query(
      'UPDATE users SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING email',
      [userId]
    );

    console.log(`✅ User deactivated by admin: ${result.rows[0].email}`);

    res.json({
      success: true,
      message: 'User deactivated successfully'
    });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete user'
    });
  }
});

// === API Key 管理 ===

// 获取所有 API Keys
router.get('/api-keys', async (req, res) => {
  try {
    const { page = 1, limit = 20, userId, isActive, search } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = '1=1';
    const values = [];
    let paramIndex = 1;

    if (userId) {
      whereClause += ` AND ak.user_id = $${paramIndex}`;
      values.push(userId);
      paramIndex++;
    }

    if (isActive !== undefined) {
      whereClause += ` AND ak.is_active = $${paramIndex}`;
      values.push(isActive === 'true');
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND (ak.name ILIKE $${paramIndex} OR u.email ILIKE $${paramIndex})`;
      values.push(`%${search}%`);
      paramIndex++;
    }

    const [keysResult, countResult] = await Promise.all([
      query(
        `SELECT ak.id, ak.name, ak.key_prefix, ak.permissions, ak.rate_limit_per_hour,
                ak.is_active, ak.last_used_at, ak.expires_at, ak.created_at,
                u.email as user_email,
                (SELECT COUNT(*) FROM usage_logs WHERE api_key_id = ak.id) as usage_count
         FROM api_keys ak
         JOIN users u ON ak.user_id = u.id
         WHERE ${whereClause}
         ORDER BY ak.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, parseInt(limit), offset]
      ),
      query(
        `SELECT COUNT(*) as total FROM api_keys ak JOIN users u ON ak.user_id = u.id WHERE ${whereClause}`,
        values
      )
    ]);

    res.json({
      success: true,
      apiKeys: keysResult.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(countResult.rows[0].total / limit)
      }
    });

  } catch (error) {
    console.error('Get API keys error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve API keys'
    });
  }
});

// 为用户创建 API Key
router.post('/api-keys', async (req, res) => {
  try {
    const validationResult = createApiKeySchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validationResult.error.errors
      });
    }

    const { userId, name, permissions, rateLimitPerHour, expiresInDays } = validationResult.data;

    // 验证用户存在
    const userResult = await query('SELECT id FROM users WHERE id = $1 AND is_active = true', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found or inactive'
      });
    }

    // 创建 API Key
    const apiKey = await req.services.apiKeyManager.createApiKey(userId, {
      name,
      permissions,
      rateLimitPerHour,
      expiresInDays
    });

    console.log(`✅ API key created by admin for user: ${userId}`);

    res.status(201).json({
      success: true,
      message: 'API key created successfully',
      apiKey
    });

  } catch (error) {
    console.error('Create API key error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create API key'
    });
  }
});

// 更新 API Key
router.put('/api-keys/:keyId', async (req, res) => {
  try {
    const { keyId } = req.params;
    const { name, permissions, rateLimitPerHour, isActive } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (permissions !== undefined) updates.permissions = permissions;
    if (rateLimitPerHour !== undefined) updates.rate_limit_per_hour = rateLimitPerHour;
    if (isActive !== undefined) updates.is_active = isActive;

    // 获取 API Key 的用户 ID
    const keyResult = await query('SELECT user_id FROM api_keys WHERE id = $1', [keyId]);
    if (keyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'API key not found'
      });
    }

    const userId = keyResult.rows[0].user_id;
    const updatedKey = await req.services.apiKeyManager.updateApiKey(keyId, userId, updates);

    console.log(`✅ API key updated by admin: ${keyId}`);

    res.json({
      success: true,
      message: 'API key updated successfully',
      apiKey: updatedKey
    });

  } catch (error) {
    console.error('Update API key error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update API key'
    });
  }
});

// 删除 API Key
router.delete('/api-keys/:keyId', async (req, res) => {
  try {
    const { keyId } = req.params;

    // 获取 API Key 的用户 ID
    const keyResult = await query('SELECT user_id FROM api_keys WHERE id = $1', [keyId]);
    if (keyResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'API key not found'
      });
    }

    const userId = keyResult.rows[0].user_id;
    const result = await req.services.apiKeyManager.deleteApiKey(keyId, userId);

    console.log(`✅ API key deleted by admin: ${result.deletedPrefix}`);

    res.json({
      success: true,
      message: 'API key deleted successfully'
    });

  } catch (error) {
    console.error('Delete API key error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete API key'
    });
  }
});

// === 系统统计 ===

// 获取系统统计
router.get('/stats', async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const [
      systemStats,
      userStats,
      workerStats,
      queueStats
    ] = await Promise.all([
      req.services.apiKeyManager.getSystemStats(parseInt(days)),
      query(`
        SELECT 
          COUNT(*) as total_users,
          COUNT(*) FILTER (WHERE is_active = true) as active_users,
          COUNT(*) FILTER (WHERE role = 'admin') as admin_users,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '${days} days') as new_users
        FROM users
      `),
      req.services.workerManager ? req.services.workerManager.getWorkersStatus() : null,
      req.services.workerManager ? req.services.workerManager.getQueueStats() : null
    ]);

    res.json({
      success: true,
      stats: {
        system: systemStats,
        users: userStats.rows[0],
        workers: workerStats,
        queue: queueStats
      }
    });

  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve statistics'
    });
  }
});

// === Worker 管理 ===

// 获取 Worker 状态
router.get('/workers', async (req, res) => {
  try {
    if (!req.services.workerManager) {
      return res.status(503).json({
        success: false,
        error: 'Worker Manager not available'
      });
    }

    const workersStatus = req.services.workerManager.getWorkersStatus();
    res.json({
      success: true,
      ...workersStatus
    });

  } catch (error) {
    console.error('Get workers error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve worker status'
    });
  }
});

// 重启 Worker
router.post('/workers/:workerId/restart', async (req, res) => {
  try {
    const { workerId } = req.params;

    if (!req.services.workerManager) {
      return res.status(503).json({
        success: false,
        error: 'Worker Manager not available'
      });
    }

    // 这里应该实现重启逻辑
    console.log(`✅ Worker restart requested by admin: ${workerId}`);

    res.json({
      success: true,
      message: 'Worker restart initiated'
    });

  } catch (error) {
    console.error('Restart worker error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to restart worker'
    });
  }
});

// === 会话管理 ===

// 获取所有活跃会话
router.get('/sessions', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const [sessionsResult, countResult] = await Promise.all([
      query(
        `SELECT s.id, s.tool_id, s.is_active, s.last_activity_at, s.created_at, s.expires_at,
                u.email as user_email, ak.name as api_key_name,
                array_length(s.context, 1) as message_count
         FROM sessions s
         JOIN api_keys ak ON s.api_key_id = ak.id
         JOIN users u ON ak.user_id = u.id
         WHERE s.is_active = true AND s.expires_at > NOW()
         ORDER BY s.last_activity_at DESC
         LIMIT $1 OFFSET $2`,
        [parseInt(limit), offset]
      ),
      query(
        'SELECT COUNT(*) as total FROM sessions WHERE is_active = true AND expires_at > NOW()'
      )
    ]);

    res.json({
      success: true,
      sessions: sessionsResult.rows,
      pagination: {
        total: parseInt(countResult.rows[0].total),
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(countResult.rows[0].total / limit)
      }
    });

  } catch (error) {
    console.error('Get sessions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve sessions'
    });
  }
});

// 终止会话
router.delete('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const deleted = await req.services.sessionManager.deleteSession(sessionId);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    console.log(`✅ Session terminated by admin: ${sessionId}`);

    res.json({
      success: true,
      message: 'Session terminated successfully'
    });

  } catch (error) {
    console.error('Terminate session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to terminate session'
    });
  }
});

export default router;