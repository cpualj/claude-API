-- 创建数据库和表结构
-- Claude API Wrapper 初始化脚本

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'user',
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- API Keys 表
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    last_used_at TIMESTAMP,
    limits JSONB DEFAULT '{"requests_per_minute": 10, "requests_per_day": 1000, "tokens_per_day": 100000}'::jsonb,
    permissions JSONB DEFAULT '{"models": ["claude-3-sonnet"], "max_tokens": 4096, "allow_streaming": true}'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 使用记录表
CREATE TABLE IF NOT EXISTS usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    request_tokens INTEGER DEFAULT 0,
    response_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    response_time_ms INTEGER,
    status_code INTEGER,
    model VARCHAR(100),
    error TEXT,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- 会话表
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
    conversation_id VARCHAR(255),
    context JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Claude 账号表
CREATE TABLE IF NOT EXISTS claude_accounts (
    id VARCHAR(255) PRIMARY KEY,
    email VARCHAR(255),
    type VARCHAR(50), -- 'api_key', 'oauth', 'credentials'
    credentials JSONB, -- 加密存储
    status VARCHAR(50) DEFAULT 'active',
    priority INTEGER DEFAULT 1,
    limits JSONB DEFAULT '{"max_requests_per_hour": 1000, "max_tokens_per_hour": 1000000}'::jsonb,
    metrics JSONB DEFAULT '{}'::jsonb,
    last_used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Worker 节点表
CREATE TABLE IF NOT EXISTS workers (
    id VARCHAR(255) PRIMARY KEY,
    host VARCHAR(255) NOT NULL,
    port INTEGER NOT NULL,
    status VARCHAR(50) DEFAULT 'offline',
    account_id VARCHAR(255) REFERENCES claude_accounts(id),
    last_heartbeat TIMESTAMP,
    metrics JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 系统配置表
CREATE TABLE IF NOT EXISTS system_config (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX idx_api_keys_key ON api_keys(key);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_status ON api_keys(status);

CREATE INDEX idx_usage_logs_api_key_id ON usage_logs(api_key_id);
CREATE INDEX idx_usage_logs_timestamp ON usage_logs(timestamp);

CREATE INDEX idx_sessions_api_key_id ON sessions(api_key_id);
CREATE INDEX idx_sessions_conversation_id ON sessions(conversation_id);

CREATE INDEX idx_claude_accounts_status ON claude_accounts(status);
CREATE INDEX idx_workers_status ON workers(status);

-- 创建函数：检查 API 使用量
CREATE OR REPLACE FUNCTION check_api_usage(key_id UUID)
RETURNS TABLE(
    exceeded BOOLEAN,
    minute_requests INTEGER,
    day_requests INTEGER,
    day_tokens INTEGER,
    limits JSONB
) AS $$
DECLARE
    key_limits JSONB;
    minute_count INTEGER;
    day_count INTEGER;
    day_tokens_count INTEGER;
BEGIN
    -- 获取 API Key 的限制
    SELECT api_keys.limits INTO key_limits 
    FROM api_keys 
    WHERE id = key_id;
    
    -- 检查每分钟请求数
    SELECT COUNT(*) INTO minute_count
    FROM usage_logs
    WHERE api_key_id = key_id
      AND timestamp > NOW() - INTERVAL '1 minute';
    
    -- 检查每日请求数
    SELECT COUNT(*) INTO day_count
    FROM usage_logs
    WHERE api_key_id = key_id
      AND timestamp > NOW() - INTERVAL '1 day';
    
    -- 检查每日 token 数
    SELECT COALESCE(SUM(total_tokens), 0) INTO day_tokens_count
    FROM usage_logs
    WHERE api_key_id = key_id
      AND timestamp > NOW() - INTERVAL '1 day';
    
    RETURN QUERY
    SELECT 
        (minute_count >= (key_limits->>'requests_per_minute')::INTEGER OR
         day_count >= (key_limits->>'requests_per_day')::INTEGER OR
         day_tokens_count >= (key_limits->>'tokens_per_day')::INTEGER) AS exceeded,
        minute_count AS minute_requests,
        day_count AS day_requests,
        day_tokens_count AS day_tokens,
        key_limits AS limits;
END;
$$ LANGUAGE plpgsql;

-- 创建触发器：更新 updated_at 字段
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sessions_updated_at BEFORE UPDATE ON sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_claude_accounts_updated_at BEFORE UPDATE ON claude_accounts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_workers_updated_at BEFORE UPDATE ON workers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 插入默认管理员账号 (密码: admin123456)
INSERT INTO users (email, password_hash, name, role)
VALUES (
    'admin@example.com',
    '$2a$10$YJxLmNqPyR5HmOv5VbH.5OsZwQdPktQjYQaEFZHPOvKqH5H5H5H5H', -- bcrypt hash of 'admin123456'
    'System Admin',
    'admin'
) ON CONFLICT (email) DO NOTHING;

-- 插入默认系统配置
INSERT INTO system_config (key, value, description) VALUES
    ('load_balancing_strategy', '"least-usage"', 'Load balancing strategy: round-robin, least-usage, weighted'),
    ('max_workers_per_account', '5', 'Maximum number of workers per Claude account'),
    ('session_timeout_minutes', '30', 'Session timeout in minutes'),
    ('health_check_interval', '30000', 'Health check interval in milliseconds')
ON CONFLICT (key) DO NOTHING;

-- 创建统计视图
CREATE OR REPLACE VIEW api_usage_stats AS
SELECT 
    ak.id as api_key_id,
    ak.name as api_key_name,
    u.email as user_email,
    COUNT(ul.id) as total_requests,
    SUM(ul.total_tokens) as total_tokens,
    AVG(ul.response_time_ms) as avg_response_time,
    MAX(ul.timestamp) as last_used
FROM api_keys ak
LEFT JOIN users u ON ak.user_id = u.id
LEFT JOIN usage_logs ul ON ak.id = ul.api_key_id
GROUP BY ak.id, ak.name, u.email;

-- 创建 Worker 状态视图
CREATE OR REPLACE VIEW worker_status AS
SELECT 
    w.id,
    w.host,
    w.port,
    w.status,
    ca.email as account_email,
    w.last_heartbeat,
    CASE 
        WHEN w.last_heartbeat > NOW() - INTERVAL '1 minute' THEN 'healthy'
        WHEN w.last_heartbeat > NOW() - INTERVAL '5 minutes' THEN 'warning'
        ELSE 'unhealthy'
    END as health_status,
    w.metrics
FROM workers w
LEFT JOIN claude_accounts ca ON w.account_id = ca.id;

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO claude_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO claude_user;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO claude_user;