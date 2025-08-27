import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { query } from '../db/init.js';
import { RateLimiter } from './redis.js';

export class ApiKeyManager {
  constructor(redis) {
    this.redis = redis;
    this.rateLimiter = new RateLimiter(redis?.redis);
    this.keyCache = new Map(); // 缓存活跃的 API Keys
  }

  // 生成 API Key
  generateApiKey(prefix = 'capi') {
    const randomBytes = crypto.randomBytes(32);
    const key = `${prefix}_${randomBytes.toString('base64url')}`;
    return key;
  }

  // 创建 API Key
  async createApiKey(userId, options = {}) {
    const {
      name,
      permissions = {},
      rateLimitPerHour = 1000,
      expiresInDays = null
    } = options;

    try {
      const apiKey = this.generateApiKey();
      const keyHash = await bcrypt.hash(apiKey, 12);
      const keyPrefix = apiKey.substring(0, 12); // 用于日志和显示

      let expiresAt = null;
      if (expiresInDays) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiresInDays);
      }

      const result = await query(
        `INSERT INTO api_keys (user_id, name, key_hash, key_prefix, permissions, rate_limit_per_hour, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, name, key_prefix, permissions, rate_limit_per_hour, is_active, expires_at, created_at`,
        [userId, name, keyHash, keyPrefix, JSON.stringify(permissions), rateLimitPerHour, expiresAt]
      );

      const keyInfo = result.rows[0];

      // 返回完整的 API Key（仅此一次）
      return {
        ...keyInfo,
        apiKey, // 只在创建时返回完整 key
        keyHash: undefined // 不返回 hash
      };

    } catch (error) {
      console.error('Failed to create API key:', error);
      throw new Error('Failed to create API key');
    }
  }

  // 验证 API Key
  async validateApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      return null;
    }

    try {
      // 先检查缓存
      const cached = this.keyCache.get(apiKey);
      if (cached && Date.now() - cached.cachedAt < 300000) { // 5分钟缓存
        return this.checkKeyExpiration(cached.keyInfo);
      }

      // 从数据库查询
      const result = await query(
        `SELECT ak.*, u.email, u.is_active as user_active
         FROM api_keys ak
         JOIN users u ON ak.user_id = u.id
         WHERE ak.is_active = true AND u.is_active = true`,
        []
      );

      let keyInfo = null;

      // 验证哈希
      for (const row of result.rows) {
        const isValid = await bcrypt.compare(apiKey, row.key_hash);
        if (isValid) {
          keyInfo = {
            id: row.id,
            userId: row.user_id,
            userEmail: row.email,
            name: row.name,
            keyPrefix: row.key_prefix,
            permissions: row.permissions,
            rateLimitPerHour: row.rate_limit_per_hour,
            lastUsedAt: row.last_used_at,
            expiresAt: row.expires_at,
            createdAt: row.created_at
          };
          break;
        }
      }

      if (!keyInfo) {
        return null;
      }

      // 缓存结果
      this.keyCache.set(apiKey, {
        keyInfo,
        cachedAt: Date.now()
      });

      return this.checkKeyExpiration(keyInfo);

    } catch (error) {
      console.error('API key validation error:', error);
      return null;
    }
  }

  // 检查 Key 是否过期
  checkKeyExpiration(keyInfo) {
    if (keyInfo.expiresAt && new Date() > new Date(keyInfo.expiresAt)) {
      return null; // Key 已过期
    }
    return keyInfo;
  }

  // 更新最后使用时间
  async updateLastUsed(keyId) {
    try {
      await query(
        'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1',
        [keyId]
      );
    } catch (error) {
      console.error('Failed to update last used time:', error);
    }
  }

  // 检查速率限制
  async checkRateLimit(keyInfo, ip = null) {
    if (!this.rateLimiter) {
      return { allowed: true, count: 0, limit: keyInfo.rateLimitPerHour };
    }

    const key = `api_key:${keyInfo.id}`;
    const result = await this.rateLimiter.isAllowed(
      key, 
      keyInfo.rateLimitPerHour, 
      3600 // 1小时窗口
    );

    // 如果有 IP，也检查 IP 级别的限制
    if (ip) {
      const ipKey = `ip:${ip}`;
      const ipLimit = 10000; // 每小时 10000 请求的 IP 限制
      const ipResult = await this.rateLimiter.isAllowed(ipKey, ipLimit, 3600);
      
      if (!ipResult.allowed) {
        return {
          allowed: false,
          reason: 'IP rate limit exceeded',
          count: ipResult.count,
          limit: ipLimit,
          resetTime: ipResult.resetTime
        };
      }
    }

    return result;
  }

  // 获取用户的所有 API Keys
  async getUserApiKeys(userId) {
    try {
      const result = await query(
        `SELECT id, name, key_prefix, permissions, rate_limit_per_hour, 
                is_active, last_used_at, expires_at, created_at
         FROM api_keys 
         WHERE user_id = $1 
         ORDER BY created_at DESC`,
        [userId]
      );

      return result.rows;
    } catch (error) {
      console.error('Failed to get user API keys:', error);
      throw new Error('Failed to retrieve API keys');
    }
  }

  // 更新 API Key
  async updateApiKey(keyId, userId, updates = {}) {
    const allowedUpdates = ['name', 'permissions', 'rate_limit_per_hour', 'is_active'];
    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedUpdates.includes(key)) {
        updateFields.push(`${key} = $${paramIndex}`);
        if (key === 'permissions') {
          values.push(JSON.stringify(value));
        } else {
          values.push(value);
        }
        paramIndex++;
      }
    }

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    updateFields.push(`updated_at = NOW()`);
    values.push(keyId, userId);

    try {
      const result = await query(
        `UPDATE api_keys 
         SET ${updateFields.join(', ')}
         WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
         RETURNING id, name, key_prefix, permissions, rate_limit_per_hour, is_active, expires_at`,
        values
      );

      if (result.rows.length === 0) {
        throw new Error('API key not found or access denied');
      }

      // 清除缓存
      this.clearCache();

      return result.rows[0];
    } catch (error) {
      console.error('Failed to update API key:', error);
      throw new Error('Failed to update API key');
    }
  }

  // 删除 API Key
  async deleteApiKey(keyId, userId) {
    try {
      const result = await query(
        'DELETE FROM api_keys WHERE id = $1 AND user_id = $2 RETURNING key_prefix',
        [keyId, userId]
      );

      if (result.rows.length === 0) {
        throw new Error('API key not found or access denied');
      }

      // 清除缓存
      this.clearCache();

      return { success: true, deletedPrefix: result.rows[0].key_prefix };
    } catch (error) {
      console.error('Failed to delete API key:', error);
      throw new Error('Failed to delete API key');
    }
  }

  // 获取 API Key 使用统计
  async getApiKeyStats(keyId, userId, days = 30) {
    try {
      const result = await query(
        `SELECT 
           COUNT(*) as total_requests,
           COUNT(*) FILTER (WHERE status_code >= 200 AND status_code < 300) as successful_requests,
           COUNT(*) FILTER (WHERE status_code >= 400) as failed_requests,
           AVG(response_time_ms) as avg_response_time,
           SUM(total_tokens) as total_tokens_used,
           DATE_TRUNC('day', created_at) as date,
           COUNT(*) as requests_per_day
         FROM usage_logs ul
         JOIN api_keys ak ON ul.api_key_id = ak.id
         WHERE ak.id = $1 AND ak.user_id = $2 
           AND ul.created_at >= NOW() - INTERVAL '${days} days'
         GROUP BY DATE_TRUNC('day', created_at)
         ORDER BY date DESC`,
        [keyId, userId]
      );

      const summary = await query(
        `SELECT 
           COUNT(*) as total_requests,
           COUNT(*) FILTER (WHERE status_code >= 200 AND status_code < 300) as successful_requests,
           COUNT(*) FILTER (WHERE status_code >= 400) as failed_requests,
           AVG(response_time_ms) as avg_response_time,
           SUM(total_tokens) as total_tokens_used
         FROM usage_logs ul
         JOIN api_keys ak ON ul.api_key_id = ak.id
         WHERE ak.id = $1 AND ak.user_id = $2 
           AND ul.created_at >= NOW() - INTERVAL '${days} days'`,
        [keyId, userId]
      );

      return {
        summary: summary.rows[0],
        dailyStats: result.rows
      };
    } catch (error) {
      console.error('Failed to get API key stats:', error);
      throw new Error('Failed to retrieve API key statistics');
    }
  }

  // 记录 API 使用
  async logUsage(keyId, requestInfo) {
    const {
      endpoint,
      method = 'POST',
      statusCode = 200,
      inputTokens = 0,
      outputTokens = 0,
      responseTimeMs = 0,
      errorMessage = null,
      metadata = {},
      ipAddress = null,
      userAgent = null
    } = requestInfo;

    try {
      await query(
        `INSERT INTO usage_logs 
         (api_key_id, endpoint, method, status_code, input_tokens, output_tokens, 
          total_tokens, response_time_ms, error_message, metadata, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          keyId,
          endpoint,
          method,
          statusCode,
          inputTokens,
          outputTokens,
          inputTokens + outputTokens,
          responseTimeMs,
          errorMessage,
          JSON.stringify(metadata),
          ipAddress,
          userAgent
        ]
      );
    } catch (error) {
      console.error('Failed to log usage:', error);
      // 不抛出错误，使用日志记录不应该影响主要功能
    }
  }

  // 获取系统使用统计（管理员用）
  async getSystemStats(days = 30) {
    try {
      const result = await query(
        `SELECT 
           COUNT(*) as total_requests,
           COUNT(DISTINCT ul.api_key_id) as active_keys,
           AVG(response_time_ms) as avg_response_time,
           SUM(total_tokens) as total_tokens_used,
           DATE_TRUNC('day', ul.created_at) as date
         FROM usage_logs ul
         WHERE ul.created_at >= NOW() - INTERVAL '${days} days'
         GROUP BY DATE_TRUNC('day', ul.created_at)
         ORDER BY date DESC`
      );

      const topEndpoints = await query(
        `SELECT 
           endpoint,
           COUNT(*) as request_count,
           AVG(response_time_ms) as avg_response_time
         FROM usage_logs
         WHERE created_at >= NOW() - INTERVAL '${days} days'
         GROUP BY endpoint
         ORDER BY request_count DESC
         LIMIT 10`
      );

      const topKeys = await query(
        `SELECT 
           ak.name,
           ak.key_prefix,
           COUNT(*) as request_count,
           SUM(ul.total_tokens) as total_tokens
         FROM usage_logs ul
         JOIN api_keys ak ON ul.api_key_id = ak.id
         WHERE ul.created_at >= NOW() - INTERVAL '${days} days'
         GROUP BY ak.id, ak.name, ak.key_prefix
         ORDER BY request_count DESC
         LIMIT 10`
      );

      return {
        dailyStats: result.rows,
        topEndpoints: topEndpoints.rows,
        topKeys: topKeys.rows
      };
    } catch (error) {
      console.error('Failed to get system stats:', error);
      throw new Error('Failed to retrieve system statistics');
    }
  }

  // 清理过期的 Keys
  async cleanupExpiredKeys() {
    try {
      const result = await query(
        'UPDATE api_keys SET is_active = false WHERE expires_at IS NOT NULL AND expires_at < NOW() AND is_active = true RETURNING key_prefix'
      );

      if (result.rows.length > 0) {
        console.log(`🧹 Deactivated ${result.rows.length} expired API keys`);
        this.clearCache();
      }

      return result.rows.length;
    } catch (error) {
      console.error('Failed to cleanup expired keys:', error);
      return 0;
    }
  }

  // 清除缓存
  clearCache() {
    this.keyCache.clear();
  }

  // 获取缓存统计
  getCacheStats() {
    return {
      size: this.keyCache.size,
      memoryUsage: JSON.stringify([...this.keyCache.entries()]).length
    };
  }
}