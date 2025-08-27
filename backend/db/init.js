import { Pool } from 'pg';
import fs from 'fs/promises';
import path from 'path';

let pool;

export async function initDatabase() {
  try {
    // 创建连接池
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/claude_api',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // 测试连接
    const client = await pool.connect();
    console.log('✅ PostgreSQL connected successfully');
    client.release();

    // 运行迁移
    await runMigrations();
    
    return pool;
  } catch (error) {
    console.error('❌ Database initialization failed:', error);
    throw error;
  }
}

export async function runMigrations() {
  const client = await pool.connect();
  
  try {
    // 开始事务
    await client.query('BEGIN');

    // 创建迁移记录表
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);

    // 定义迁移脚本
    const migrations = [
      {
        name: '001_create_users_table',
        sql: `
          CREATE TABLE IF NOT EXISTS users (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(50) DEFAULT 'user',
            is_active BOOLEAN DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
          CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
        `
      },
      {
        name: '002_create_api_keys_table',
        sql: `
          CREATE TABLE IF NOT EXISTS api_keys (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            name VARCHAR(255) NOT NULL,
            key_hash VARCHAR(255) NOT NULL UNIQUE,
            key_prefix VARCHAR(20) NOT NULL,
            permissions JSONB DEFAULT '{}',
            rate_limit_per_hour INTEGER DEFAULT 1000,
            is_active BOOLEAN DEFAULT true,
            last_used_at TIMESTAMP WITH TIME ZONE,
            expires_at TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
          CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
          CREATE INDEX IF NOT EXISTS idx_api_keys_key_prefix ON api_keys(key_prefix);
        `
      },
      {
        name: '003_create_usage_logs_table',
        sql: `
          CREATE TABLE IF NOT EXISTS usage_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
            endpoint VARCHAR(255) NOT NULL,
            method VARCHAR(10) NOT NULL,
            status_code INTEGER,
            input_tokens INTEGER DEFAULT 0,
            output_tokens INTEGER DEFAULT 0,
            total_tokens INTEGER DEFAULT 0,
            response_time_ms INTEGER,
            error_message TEXT,
            metadata JSONB DEFAULT '{}',
            ip_address INET,
            user_agent TEXT,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_usage_logs_api_key_id ON usage_logs(api_key_id);
          CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at);
          CREATE INDEX IF NOT EXISTS idx_usage_logs_endpoint ON usage_logs(endpoint);
        `
      },
      {
        name: '004_create_sessions_table',
        sql: `
          CREATE TABLE IF NOT EXISTS sessions (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
            tool_id VARCHAR(100) NOT NULL,
            context JSONB DEFAULT '[]',
            metadata JSONB DEFAULT '{}',
            is_active BOOLEAN DEFAULT true,
            last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '1 hour',
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_sessions_api_key_id ON sessions(api_key_id);
          CREATE INDEX IF NOT EXISTS idx_sessions_tool_id ON sessions(tool_id);
          CREATE INDEX IF NOT EXISTS idx_sessions_is_active ON sessions(is_active);
          CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
        `
      },
      {
        name: '005_create_cli_tools_table',
        sql: `
          CREATE TABLE IF NOT EXISTS cli_tools (
            id VARCHAR(100) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            description TEXT,
            command VARCHAR(255) NOT NULL,
            args JSONB DEFAULT '{}',
            environment JSONB DEFAULT '{}',
            auth_required BOOLEAN DEFAULT false,
            auth_config JSONB DEFAULT '{}',
            session_supported BOOLEAN DEFAULT false,
            streaming_supported BOOLEAN DEFAULT false,
            rate_limit INTEGER DEFAULT 60,
            timeout_seconds INTEGER DEFAULT 300,
            is_enabled BOOLEAN DEFAULT true,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_cli_tools_is_enabled ON cli_tools(is_enabled);
        `
      },
      {
        name: '006_create_workers_table',
        sql: `
          CREATE TABLE IF NOT EXISTS workers (
            id VARCHAR(100) PRIMARY KEY,
            hostname VARCHAR(255) NOT NULL,
            port INTEGER NOT NULL,
            status VARCHAR(50) DEFAULT 'offline',
            capabilities JSONB DEFAULT '{}',
            current_load INTEGER DEFAULT 0,
            max_concurrent INTEGER DEFAULT 5,
            last_heartbeat_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );

          CREATE INDEX IF NOT EXISTS idx_workers_status ON workers(status);
          CREATE INDEX IF NOT EXISTS idx_workers_last_heartbeat ON workers(last_heartbeat_at);
        `
      }
    ];

    // 执行每个迁移
    for (const migration of migrations) {
      const { rows } = await client.query(
        'SELECT 1 FROM migrations WHERE name = $1',
        [migration.name]
      );

      if (rows.length === 0) {
        console.log(`Running migration: ${migration.name}`);
        await client.query(migration.sql);
        await client.query(
          'INSERT INTO migrations (name) VALUES ($1)',
          [migration.name]
        );
        console.log(`✅ Migration completed: ${migration.name}`);
      } else {
        console.log(`⏭️ Migration already applied: ${migration.name}`);
      }
    }

    // 提交事务
    await client.query('COMMIT');
    console.log('✅ All migrations completed successfully');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function getDatabase() {
  if (!pool) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return pool;
}

export async function query(text, params) {
  if (!pool) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return pool.query(text, params);
}

export async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('✅ Database connection closed');
  }
}