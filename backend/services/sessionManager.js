import { v4 as uuidv4 } from 'uuid';
import { query } from '../db/init.js';
import { SessionCache } from './redis.js';

export class SessionManager {
  constructor(redis) {
    this.redis = redis;
    this.sessionCache = new SessionCache(redis?.redis, 3600); // 1小时默认TTL
    this.cleanupInterval = null;
    
    // 启动清理任务
    this.startCleanupTask();
  }

  // 创建新会话
  async createSession(apiKeyId, toolId, options = {}) {
    const {
      initialContext = [],
      metadata = {},
      ttlSeconds = 3600 // 1小时默认
    } = options;

    try {
      const sessionId = uuidv4();
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

      // 保存到数据库
      const result = await query(
        `INSERT INTO sessions (id, api_key_id, tool_id, context, metadata, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          sessionId,
          apiKeyId,
          toolId,
          JSON.stringify(initialContext),
          JSON.stringify(metadata),
          expiresAt
        ]
      );

      const session = result.rows[0];

      // 缓存到 Redis
      await this.sessionCache.set(sessionId, {
        id: sessionId,
        apiKeyId,
        toolId,
        context: initialContext,
        metadata,
        isActive: true,
        createdAt: session.created_at,
        expiresAt: expiresAt.toISOString()
      });

      console.log(`✅ Session created: ${sessionId} for tool: ${toolId}`);

      return {
        id: sessionId,
        toolId,
        context: initialContext,
        metadata,
        isActive: true,
        createdAt: session.created_at,
        expiresAt
      };

    } catch (error) {
      console.error('Failed to create session:', error);
      throw new Error('Failed to create session');
    }
  }

  // 获取会话
  async getSession(sessionId, apiKeyId = null) {
    try {
      // 先从缓存获取
      let session = await this.sessionCache.get(sessionId);
      
      if (!session) {
        // 从数据库获取
        const result = await query(
          `SELECT * FROM sessions WHERE id = $1 AND is_active = true`,
          [sessionId]
        );

        if (result.rows.length === 0) {
          return null;
        }

        const dbSession = result.rows[0];
        
        // 检查是否过期
        if (new Date() > new Date(dbSession.expires_at)) {
          await this.deleteSession(sessionId);
          return null;
        }

        session = {
          id: dbSession.id,
          apiKeyId: dbSession.api_key_id,
          toolId: dbSession.tool_id,
          context: dbSession.context,
          metadata: dbSession.metadata,
          isActive: dbSession.is_active,
          lastActivityAt: dbSession.last_activity_at,
          createdAt: dbSession.created_at,
          expiresAt: dbSession.expires_at
        };

        // 重新缓存
        await this.sessionCache.set(sessionId, session);
      }

      // 验证权限
      if (apiKeyId && session.apiKeyId !== apiKeyId) {
        return null;
      }

      return session;

    } catch (error) {
      console.error('Failed to get session:', error);
      return null;
    }
  }

  // 更新会话上下文
  async updateSession(sessionId, apiKeyId, updates = {}) {
    try {
      const session = await this.getSession(sessionId, apiKeyId);
      if (!session) {
        throw new Error('Session not found or access denied');
      }

      const {
        context,
        metadata = {},
        extendTtlSeconds = null
      } = updates;

      let newExpiresAt = session.expiresAt;
      if (extendTtlSeconds) {
        newExpiresAt = new Date(Date.now() + extendTtlSeconds * 1000);
      }

      const updateFields = [];
      const values = [];
      let paramIndex = 1;

      if (context !== undefined) {
        updateFields.push(`context = $${paramIndex}`);
        values.push(JSON.stringify(context));
        paramIndex++;
      }

      if (Object.keys(metadata).length > 0) {
        updateFields.push(`metadata = metadata || $${paramIndex}`);
        values.push(JSON.stringify(metadata));
        paramIndex++;
      }

      if (extendTtlSeconds) {
        updateFields.push(`expires_at = $${paramIndex}`);
        values.push(newExpiresAt);
        paramIndex++;
      }

      updateFields.push(`last_activity_at = NOW()`);
      updateFields.push(`updated_at = NOW()`);

      values.push(sessionId);

      const result = await query(
        `UPDATE sessions 
         SET ${updateFields.join(', ')}
         WHERE id = $${paramIndex} AND is_active = true
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        throw new Error('Session not found');
      }

      const updatedSession = result.rows[0];

      // 更新缓存
      const cacheData = {
        id: updatedSession.id,
        apiKeyId: updatedSession.api_key_id,
        toolId: updatedSession.tool_id,
        context: updatedSession.context,
        metadata: updatedSession.metadata,
        isActive: updatedSession.is_active,
        lastActivityAt: updatedSession.last_activity_at,
        createdAt: updatedSession.created_at,
        expiresAt: updatedSession.expires_at
      };

      if (extendTtlSeconds) {
        await this.sessionCache.set(sessionId, cacheData);
        await this.sessionCache.extend(sessionId, extendTtlSeconds);
      } else {
        await this.sessionCache.set(sessionId, cacheData);
      }

      return cacheData;

    } catch (error) {
      console.error('Failed to update session:', error);
      throw new Error('Failed to update session');
    }
  }

  // 添加消息到会话上下文
  async addMessage(sessionId, apiKeyId, message) {
    try {
      const session = await this.getSession(sessionId, apiKeyId);
      if (!session) {
        throw new Error('Session not found or access denied');
      }

      const context = session.context || [];
      const newMessage = {
        id: uuidv4(),
        timestamp: new Date().toISOString(),
        ...message
      };

      context.push(newMessage);

      // 限制上下文长度（可配置）
      const maxContextLength = process.env.MAX_CONTEXT_LENGTH || 50;
      if (context.length > maxContextLength) {
        context.splice(0, context.length - maxContextLength);
      }

      return await this.updateSession(sessionId, apiKeyId, { context });

    } catch (error) {
      console.error('Failed to add message:', error);
      throw new Error('Failed to add message to session');
    }
  }

  // 删除会话
  async deleteSession(sessionId, apiKeyId = null) {
    try {
      let whereClause = 'id = $1';
      let values = [sessionId];

      if (apiKeyId) {
        whereClause += ' AND api_key_id = $2';
        values.push(apiKeyId);
      }

      const result = await query(
        `UPDATE sessions SET is_active = false, updated_at = NOW() 
         WHERE ${whereClause} AND is_active = true
         RETURNING tool_id`,
        values
      );

      if (result.rows.length === 0) {
        return false;
      }

      // 从缓存删除
      await this.sessionCache.delete(sessionId);

      console.log(`🗑️ Session deleted: ${sessionId}`);
      return true;

    } catch (error) {
      console.error('Failed to delete session:', error);
      return false;
    }
  }

  // 获取用户的所有活跃会话
  async getUserSessions(apiKeyId, filters = {}) {
    try {
      const { toolId, isActive = true, limit = 50, offset = 0 } = filters;

      let whereClause = 'api_key_id = $1';
      const values = [apiKeyId];
      let paramIndex = 2;

      if (isActive !== undefined) {
        whereClause += ` AND is_active = $${paramIndex}`;
        values.push(isActive);
        paramIndex++;
      }

      if (toolId) {
        whereClause += ` AND tool_id = $${paramIndex}`;
        values.push(toolId);
        paramIndex++;
      }

      // 排除已过期的会话
      whereClause += ` AND expires_at > NOW()`;

      const result = await query(
        `SELECT id, tool_id, metadata, is_active, last_activity_at, created_at, expires_at,
                array_length(context, 1) as message_count
         FROM sessions 
         WHERE ${whereClause}
         ORDER BY last_activity_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, limit, offset]
      );

      const countResult = await query(
        `SELECT COUNT(*) as total FROM sessions WHERE ${whereClause}`,
        values
      );

      return {
        sessions: result.rows,
        total: parseInt(countResult.rows[0].total),
        limit,
        offset
      };

    } catch (error) {
      console.error('Failed to get user sessions:', error);
      throw new Error('Failed to retrieve user sessions');
    }
  }

  // 延长会话过期时间
  async extendSession(sessionId, apiKeyId, ttlSeconds = 3600) {
    try {
      return await this.updateSession(sessionId, apiKeyId, {
        extendTtlSeconds: ttlSeconds
      });
    } catch (error) {
      console.error('Failed to extend session:', error);
      throw new Error('Failed to extend session');
    }
  }

  // 清理过期会话
  async cleanupExpiredSessions() {
    try {
      // 清理数据库中的过期会话
      const result = await query(
        `UPDATE sessions 
         SET is_active = false, updated_at = NOW() 
         WHERE expires_at < NOW() AND is_active = true
         RETURNING id, tool_id`
      );

      // 清理缓存中的过期会话
      const cachedSessions = await this.sessionCache.getAllSessions();
      let cleanedFromCache = 0;

      for (const session of cachedSessions) {
        if (new Date(session.expiresAt) < new Date()) {
          await this.sessionCache.delete(session.sessionId);
          cleanedFromCache++;
        }
      }

      const totalCleaned = result.rows.length + cleanedFromCache;
      if (totalCleaned > 0) {
        console.log(`🧹 Cleaned up ${totalCleaned} expired sessions`);
      }

      return totalCleaned;

    } catch (error) {
      console.error('Failed to cleanup expired sessions:', error);
      return 0;
    }
  }

  // 获取会话统计
  async getSessionStats(apiKeyId = null, days = 30) {
    try {
      let whereClause = `created_at >= NOW() - INTERVAL '${days} days'`;
      let values = [];

      if (apiKeyId) {
        whereClause += ' AND api_key_id = $1';
        values.push(apiKeyId);
      }

      const result = await query(
        `SELECT 
           COUNT(*) as total_sessions,
           COUNT(*) FILTER (WHERE is_active = true AND expires_at > NOW()) as active_sessions,
           COUNT(DISTINCT tool_id) as unique_tools,
           AVG(array_length(context, 1)) as avg_messages_per_session,
           DATE_TRUNC('day', created_at) as date,
           COUNT(*) as sessions_per_day
         FROM sessions
         WHERE ${whereClause}
         GROUP BY DATE_TRUNC('day', created_at)
         ORDER BY date DESC`,
        values
      );

      const toolStats = await query(
        `SELECT 
           tool_id,
           COUNT(*) as session_count,
           AVG(array_length(context, 1)) as avg_messages
         FROM sessions
         WHERE ${whereClause}
         GROUP BY tool_id
         ORDER BY session_count DESC`,
        values
      );

      return {
        dailyStats: result.rows,
        toolStats: toolStats.rows
      };

    } catch (error) {
      console.error('Failed to get session stats:', error);
      throw new Error('Failed to retrieve session statistics');
    }
  }

  // 启动清理任务
  startCleanupTask() {
    // 每30分钟清理一次过期会话
    this.cleanupInterval = setInterval(async () => {
      try {
        await this.cleanupExpiredSessions();
      } catch (error) {
        console.error('Cleanup task error:', error);
      }
    }, 30 * 60 * 1000); // 30分钟

    console.log('✅ Session cleanup task started');
  }

  // 停止清理任务
  stopCleanupTask() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      console.log('🛑 Session cleanup task stopped');
    }
  }

  // 获取活跃会话数量
  async getActiveSessionCount() {
    try {
      const result = await query(
        'SELECT COUNT(*) as count FROM sessions WHERE is_active = true AND expires_at > NOW()'
      );
      return parseInt(result.rows[0].count);
    } catch (error) {
      console.error('Failed to get active session count:', error);
      return 0;
    }
  }

  // 强制结束所有会话（用于用户或工具）
  async terminateAllSessions(filters = {}) {
    try {
      const { apiKeyId, toolId } = filters;
      
      let whereClause = 'is_active = true';
      const values = [];
      let paramIndex = 1;

      if (apiKeyId) {
        whereClause += ` AND api_key_id = $${paramIndex}`;
        values.push(apiKeyId);
        paramIndex++;
      }

      if (toolId) {
        whereClause += ` AND tool_id = $${paramIndex}`;
        values.push(toolId);
      }

      const result = await query(
        `UPDATE sessions 
         SET is_active = false, updated_at = NOW()
         WHERE ${whereClause}
         RETURNING id`,
        values
      );

      // 清理缓存
      for (const session of result.rows) {
        await this.sessionCache.delete(session.id);
      }

      console.log(`🛑 Terminated ${result.rows.length} sessions`);
      return result.rows.length;

    } catch (error) {
      console.error('Failed to terminate sessions:', error);
      return 0;
    }
  }

  // 获取缓存统计
  async getCacheStats() {
    try {
      const cachedSessions = await this.sessionCache.getAllSessions();
      return {
        cachedSessions: cachedSessions.length,
        memoryUsage: JSON.stringify(cachedSessions).length
      };
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      return { cachedSessions: 0, memoryUsage: 0 };
    }
  }

  // 关闭会话管理器
  async shutdown() {
    console.log('🛑 Shutting down Session Manager...');
    this.stopCleanupTask();
    console.log('✅ Session Manager shutdown complete');
  }
}