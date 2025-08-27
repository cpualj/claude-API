import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { query } from '../db/init.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// JWT 配置
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '7d';

// 验证 schemas
const registerSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string()
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"]
});

const loginSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password is required')
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
  confirmNewPassword: z.string()
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: "New passwords don't match",
  path: ["confirmNewPassword"]
});

// 生成 JWT Token
function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRE }
  );
}

// 用户注册
router.post('/register', async (req, res) => {
  try {
    // 验证输入
    const validationResult = registerSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validationResult.error.errors
      });
    }

    const { email, password } = validationResult.data;

    // 检查邮箱是否已存在
    const existingUser = await query(
      'SELECT id FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        success: false,
        error: 'Email already registered'
      });
    }

    // 加密密码
    const passwordHash = await bcrypt.hash(password, 12);

    // 创建用户
    const result = await query(
      `INSERT INTO users (email, password_hash, role)
       VALUES ($1, $2, $3)
       RETURNING id, email, role, is_active, created_at`,
      [email.toLowerCase(), passwordHash, 'user']
    );

    const user = result.rows[0];

    // 生成 token
    const token = generateToken(user);

    // 记录登录日志
    console.log(`✅ User registered: ${email}`);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isActive: user.is_active,
        createdAt: user.created_at
      },
      token
    });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed'
    });
  }
});

// 用户登录
router.post('/login', async (req, res) => {
  try {
    // 验证输入
    const validationResult = loginSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validationResult.error.errors
      });
    }

    const { email, password } = validationResult.data;

    // 查找用户
    const result = await query(
      'SELECT id, email, password_hash, role, is_active FROM users WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    const user = result.rows[0];

    // 检查账户状态
    if (!user.is_active) {
      return res.status(403).json({
        success: false,
        error: 'Account is disabled'
      });
    }

    // 验证密码
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // 生成 token
    const token = generateToken(user);

    // 更新最后登录时间
    await query(
      'UPDATE users SET updated_at = NOW() WHERE id = $1',
      [user.id]
    );

    // 记录登录日志
    console.log(`✅ User logged in: ${email}`);

    res.json({
      success: true,
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isActive: user.is_active
      },
      token
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

// 刷新 Token
router.post('/refresh', authMiddleware, async (req, res) => {
  try {
    const user = req.user;

    // 验证用户仍然活跃
    const result = await query(
      'SELECT id, email, role, is_active FROM users WHERE id = $1',
      [user.id]
    );

    if (result.rows.length === 0 || !result.rows[0].is_active) {
      return res.status(401).json({
        success: false,
        error: 'Invalid user or account disabled'
      });
    }

    const currentUser = result.rows[0];

    // 生成新 token
    const token = generateToken(currentUser);

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      user: {
        id: currentUser.id,
        email: currentUser.email,
        role: currentUser.role,
        isActive: currentUser.is_active
      },
      token
    });

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      success: false,
      error: 'Token refresh failed'
    });
  }
});

// 获取当前用户信息
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;

    const result = await query(
      'SELECT id, email, role, is_active, created_at, updated_at FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = result.rows[0];

    // 获取 API Keys 数量
    const apiKeysResult = await query(
      'SELECT COUNT(*) as total, COUNT(*) FILTER (WHERE is_active = true) as active FROM api_keys WHERE user_id = $1',
      [userId]
    );

    const apiKeyStats = apiKeysResult.rows[0];

    res.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isActive: user.is_active,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
        apiKeys: {
          total: parseInt(apiKeyStats.total),
          active: parseInt(apiKeyStats.active)
        }
      }
    });

  } catch (error) {
    console.error('Get user info error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user information'
    });
  }
});

// 修改密码
router.post('/change-password', authMiddleware, async (req, res) => {
  try {
    // 验证输入
    const validationResult = changePasswordSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validationResult.error.errors
      });
    }

    const { currentPassword, newPassword } = validationResult.data;
    const userId = req.user.id;

    // 获取当前密码哈希
    const result = await query(
      'SELECT password_hash FROM users WHERE id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = result.rows[0];

    // 验证当前密码
    const isValidPassword = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    // 加密新密码
    const newPasswordHash = await bcrypt.hash(newPassword, 12);

    // 更新密码
    await query(
      'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
      [newPasswordHash, userId]
    );

    console.log(`✅ Password changed for user: ${req.user.email}`);

    res.json({
      success: true,
      message: 'Password changed successfully'
    });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to change password'
    });
  }
});

// 更新用户资料
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { email } = req.body;

    // 验证邮箱格式
    if (email) {
      const emailSchema = z.string().email();
      const emailValidation = emailSchema.safeParse(email);
      
      if (!emailValidation.success) {
        return res.status(400).json({
          success: false,
          error: 'Invalid email format'
        });
      }

      // 检查邮箱是否已被其他用户使用
      const existingUser = await query(
        'SELECT id FROM users WHERE email = $1 AND id != $2',
        [email.toLowerCase(), userId]
      );

      if (existingUser.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'Email is already in use'
        });
      }

      // 更新邮箱
      await query(
        'UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2',
        [email.toLowerCase(), userId]
      );

      console.log(`✅ Email updated for user: ${userId}`);
    }

    // 获取更新后的用户信息
    const result = await query(
      'SELECT id, email, role, is_active, created_at, updated_at FROM users WHERE id = $1',
      [userId]
    );

    const user = result.rows[0];

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isActive: user.is_active,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      }
    });

  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    });
  }
});

// 注销（客户端应删除 token）
router.post('/logout', authMiddleware, (req, res) => {
  console.log(`✅ User logged out: ${req.user.email}`);
  
  res.json({
    success: true,
    message: 'Logged out successfully'
  });
});

// 验证 Token（用于客户端检查）
router.get('/verify', authMiddleware, (req, res) => {
  res.json({
    success: true,
    message: 'Token is valid',
    user: {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role
    }
  });
});

export default router;