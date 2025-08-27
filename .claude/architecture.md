# Claude API Wrapper 系统架构设计

## 系统架构图

```
┌─────────────────────────────────────────────────────────────┐
│                         客户端层                              │
├─────────────────────────────────────────────────────────────┤
│  React Admin UI  │  External API Clients  │  SDK/Libraries  │
└─────────────────┬───────────────┬──────────────┬───────────┘
                  │               │              │
                  ▼               ▼              ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Gateway Layer                       │
├─────────────────────────────────────────────────────────────┤
│  Load Balancer  │  Rate Limiter  │  Auth Middleware         │
└─────────────────┬────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
├─────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  REST API    │  │  WebSocket   │  │  Admin API   │     │
│  │  Service     │  │  Service     │  │  Service     │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  Session     │  │  Queue       │  │  Metrics     │     │
│  │  Manager     │  │  Manager     │  │  Collector   │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────┬────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                 Claude CLI Process Pool                      │
├─────────────────────────────────────────────────────────────┤
│  Worker 1  │  Worker 2  │  Worker 3  │  ...  │  Worker N   │
└─────────────────────────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                      Data Layer                              │
├─────────────────────────────────────────────────────────────┤
│  PostgreSQL  │  Redis Cache  │  File Storage  │  Logs      │
└─────────────────────────────────────────────────────────────┘
```

## 核心组件设计

### 1. API Gateway 层

```javascript
// src/server/gateway/index.js
class APIGateway {
  constructor() {
    this.rateLimiter = new RateLimiter();
    this.authMiddleware = new AuthMiddleware();
    this.loadBalancer = new LoadBalancer();
  }

  async handleRequest(req, res) {
    // 1. 认证
    const apiKey = await this.authMiddleware.validate(req);
    
    // 2. 速率限制
    await this.rateLimiter.check(apiKey);
    
    // 3. 路由到合适的服务
    return this.loadBalancer.route(req, res);
  }
}
```

### 2. Claude CLI Process Manager

```javascript
// src/server/claude/ProcessManager.js
class ClaudeProcessManager {
  constructor(config) {
    this.maxWorkers = config.maxWorkers || 10;
    this.workers = new Map();
    this.availableWorkers = [];
    this.busyWorkers = new Set();
    this.queue = [];
  }

  async initialize() {
    for (let i = 0; i < this.maxWorkers; i++) {
      const worker = await this.createWorker(i);
      this.workers.set(worker.id, worker);
      this.availableWorkers.push(worker);
    }
  }

  async createWorker(id) {
    return new ClaudeWorker({
      id: `worker-${id}`,
      onReady: () => this.onWorkerReady(id),
      onError: (err) => this.onWorkerError(id, err)
    });
  }

  async executeCommand(command, sessionId) {
    const worker = await this.getAvailableWorker();
    
    try {
      this.busyWorkers.add(worker);
      const result = await worker.execute(command, sessionId);
      return result;
    } finally {
      this.busyWorkers.delete(worker);
      this.availableWorkers.push(worker);
      this.processQueue();
    }
  }

  async getAvailableWorker() {
    if (this.availableWorkers.length > 0) {
      return this.availableWorkers.shift();
    }
    
    // 等待可用的 worker
    return new Promise((resolve) => {
      this.queue.push(resolve);
    });
  }
}
```

### 3. Session Manager

```javascript
// src/server/session/SessionManager.js
class SessionManager {
  constructor() {
    this.sessions = new Map();
    this.redis = new Redis();
  }

  async createSession(apiKey, options = {}) {
    const sessionId = generateUUID();
    const session = {
      id: sessionId,
      apiKey,
      conversationId: null,
      context: [],
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      ...options
    };

    this.sessions.set(sessionId, session);
    await this.redis.set(`session:${sessionId}`, JSON.stringify(session));
    
    return session;
  }

  async getSession(sessionId) {
    let session = this.sessions.get(sessionId);
    
    if (!session) {
      const cached = await this.redis.get(`session:${sessionId}`);
      if (cached) {
        session = JSON.parse(cached);
        this.sessions.set(sessionId, session);
      }
    }
    
    if (session) {
      session.lastAccessedAt = Date.now();
      await this.updateSession(session);
    }
    
    return session;
  }

  async updateSession(session) {
    this.sessions.set(session.id, session);
    await this.redis.set(
      `session:${session.id}`, 
      JSON.stringify(session),
      'EX',
      3600 // 1小时过期
    );
  }
}
```

### 4. API Key Manager

```javascript
// src/server/auth/ApiKeyManager.js
class ApiKeyManager {
  constructor(db) {
    this.db = db;
    this.cache = new Map();
  }

  async createApiKey(userId, config) {
    const apiKey = {
      id: generateUUID(),
      key: `sk-${generateSecureToken()}`,
      userId,
      name: config.name,
      status: 'active',
      createdAt: new Date(),
      expiresAt: config.expiresAt,
      limits: {
        requestsPerMinute: config.requestsPerMinute || 10,
        requestsPerDay: config.requestsPerDay || 1000,
        tokensPerDay: config.tokensPerDay || 100000
      },
      permissions: {
        models: config.models || ['claude-3-sonnet'],
        maxTokens: config.maxTokens || 4096,
        allowStreaming: config.allowStreaming !== false
      },
      usage: {
        requestsToday: 0,
        tokensToday: 0,
        lastUsedAt: null
      }
    };

    await this.db.apiKeys.create(apiKey);
    this.cache.set(apiKey.key, apiKey);
    
    return apiKey;
  }

  async validateApiKey(key) {
    let apiKey = this.cache.get(key);
    
    if (!apiKey) {
      apiKey = await this.db.apiKeys.findOne({ key });
      if (apiKey) {
        this.cache.set(key, apiKey);
      }
    }

    if (!apiKey || apiKey.status !== 'active') {
      throw new Error('Invalid API key');
    }

    if (apiKey.expiresAt && new Date() > apiKey.expiresAt) {
      throw new Error('API key expired');
    }

    // 检查速率限制
    await this.checkRateLimits(apiKey);
    
    return apiKey;
  }

  async checkRateLimits(apiKey) {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));
    
    // 重置每日计数
    if (!apiKey.usage.lastResetAt || apiKey.usage.lastResetAt < todayStart) {
      apiKey.usage.requestsToday = 0;
      apiKey.usage.tokensToday = 0;
      apiKey.usage.lastResetAt = todayStart;
    }

    if (apiKey.usage.requestsToday >= apiKey.limits.requestsPerDay) {
      throw new Error('Daily request limit exceeded');
    }

    if (apiKey.usage.tokensToday >= apiKey.limits.tokensPerDay) {
      throw new Error('Daily token limit exceeded');
    }

    // 分钟级限制使用 Redis
    const minuteKey = `rate:${apiKey.id}:${Math.floor(Date.now() / 60000)}`;
    const minuteCount = await this.redis.incr(minuteKey);
    await this.redis.expire(minuteKey, 60);

    if (minuteCount > apiKey.limits.requestsPerMinute) {
      throw new Error('Rate limit exceeded');
    }
  }
}
```

### 5. REST API 实现

```javascript
// src/server/api/chat.js
class ChatAPI {
  constructor(processManager, sessionManager) {
    this.processManager = processManager;
    this.sessionManager = sessionManager;
  }

  async chat(req, res) {
    const { message, model, stream = false, sessionId } = req.body;
    const apiKey = req.apiKey;

    // 获取或创建会话
    let session = sessionId 
      ? await this.sessionManager.getSession(sessionId)
      : await this.sessionManager.createSession(apiKey.id);

    if (stream) {
      return this.streamChat(req, res, session, message);
    } else {
      return this.normalChat(req, res, session, message);
    }
  }

  async normalChat(req, res, session, message) {
    try {
      const result = await this.processManager.executeCommand({
        type: 'chat',
        message,
        sessionId: session.id,
        options: {
          model: req.body.model,
          temperature: req.body.temperature,
          maxTokens: req.body.maxTokens
        }
      });

      // 更新使用量
      await this.updateUsage(req.apiKey, result.tokens);

      res.json({
        success: true,
        sessionId: session.id,
        response: result.response,
        usage: {
          promptTokens: result.promptTokens,
          completionTokens: result.completionTokens,
          totalTokens: result.tokens
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async streamChat(req, res, session, message) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    const stream = await this.processManager.executeStreamCommand({
      type: 'chat',
      message,
      sessionId: session.id,
      stream: true
    });

    stream.on('data', (chunk) => {
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);
    });

    stream.on('end', async (usage) => {
      await this.updateUsage(req.apiKey, usage.totalTokens);
      res.write(`data: [DONE]\n\n`);
      res.end();
    });

    stream.on('error', (error) => {
      res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
      res.end();
    });
  }
}
```

## 数据库设计

### PostgreSQL Schema

```sql
-- API Keys 表
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(255) UNIQUE NOT NULL,
    user_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    status VARCHAR(50) DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    last_used_at TIMESTAMP,
    limits JSONB NOT NULL,
    permissions JSONB NOT NULL,
    metadata JSONB,
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- 使用记录表
CREATE TABLE usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id UUID NOT NULL,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    endpoint VARCHAR(255) NOT NULL,
    method VARCHAR(10) NOT NULL,
    request_tokens INTEGER,
    response_tokens INTEGER,
    total_tokens INTEGER,
    response_time_ms INTEGER,
    status_code INTEGER,
    model VARCHAR(100),
    error TEXT,
    FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);

-- 会话表
CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id UUID NOT NULL,
    conversation_id VARCHAR(255),
    context JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);

-- 创建索引
CREATE INDEX idx_api_keys_key ON api_keys(key);
CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_usage_logs_api_key_id ON usage_logs(api_key_id);
CREATE INDEX idx_usage_logs_timestamp ON usage_logs(timestamp);
CREATE INDEX idx_sessions_api_key_id ON sessions(api_key_id);
```

## 部署架构

### Docker Compose 配置

```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "3001:3001"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:pass@postgres:5432/claude_api
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis
    volumes:
      - ./logs:/app/logs
    deploy:
      replicas: 2
      restart_policy:
        condition: on-failure

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_DB=claude_api
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - api

volumes:
  postgres_data:
  redis_data:
```

## 监控和日志

### 监控指标

1. **系统指标**
   - CPU 使用率
   - 内存使用率
   - 磁盘 I/O
   - 网络流量

2. **应用指标**
   - 请求速率 (RPS)
   - 响应时间 (P50, P95, P99)
   - 错误率
   - 活跃会话数
   - Claude CLI 进程状态

3. **业务指标**
   - API Key 使用量
   - Token 消耗
   - 用户活跃度
   - 成本追踪

### 日志策略

```javascript
// src/server/logging/logger.js
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log' 
    }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});
```

## 安全考虑

1. **API 安全**
   - HTTPS 强制
   - API Key 加密存储 (bcrypt)
   - 请求签名验证 (HMAC)
   - SQL 注入防护
   - XSS 防护

2. **进程隔离**
   - 每个 Claude CLI 进程独立运行
   - 使用 Docker 容器隔离
   - 资源限制 (cgroups)

3. **数据保护**
   - 敏感信息加密
   - 定期备份
   - 审计日志
   - GDPR 合规

## 性能优化

1. **缓存策略**
   - Redis 缓存 API Key
   - 会话缓存
   - 响应缓存 (可选)

2. **连接池**
   - 数据库连接池
   - Redis 连接池
   - HTTP Keep-Alive

3. **异步处理**
   - 消息队列 (Bull)
   - 事件驱动架构
   - 非阻塞 I/O

4. **负载均衡**
   - Nginx 反向代理
   - 轮询算法
   - 健康检查