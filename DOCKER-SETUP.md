# Docker Multi-Account Setup Guide

## 概述

本系统使用 Docker 容器隔离技术，允许在单台机器上运行多个 Claude CLI 实例，每个实例使用独立的 Claude Pro 账号（$200 订阅），实现自动负载均衡。

## 架构说明

```
┌──────────────────────────────────────────────┐
│              Frontend (React)                 │
│                Port: 3030                     │
└───────────────────┬──────────────────────────┘
                    │
┌───────────────────▼──────────────────────────┐
│         Orchestrator (Load Balancer)         │
│                Port: 3000                     │
│    • Round-robin / Least-connections         │
│    • Request queue management                │
│    • Health checks                           │
└────┬──────────────┬──────────────┬──────────┘
     │              │              │
┌────▼────┐    ┌────▼────┐    ┌────▼────┐
│Worker 1 │    │Worker 2 │    │Worker 3 │
│Port:4001│    │Port:4002│    │Port:4003│
│Account 1│    │Account 2│    │Account 3│
└─────────┘    └─────────┘    └─────────┘
     │              │              │
┌────▼──────────────▼──────────────▼────┐
│         Redis (Queue & Cache)         │
│            Port: 6379                 │
└────────────────────────────────────────┘
     │
┌────▼────────────────────────────────────┐
│      PostgreSQL (Persistent Storage)     │
│            Port: 5432                    │
└──────────────────────────────────────────┘
```

## 前置要求

1. Docker Desktop (Windows/Mac) 或 Docker Engine (Linux)
2. Docker Compose v2.0+
3. 至少 2 个 Claude Pro 账号（$200/月订阅）
4. 8GB+ RAM (推荐 16GB)

## 快速开始

### 1. 克隆项目

```bash
git clone <your-repo>
cd claude-api
```

### 2. 配置环境变量

复制示例配置文件：

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置你的 Claude 账号：

```env
# Claude Pro 账号 1
CLAUDE_EMAIL_1=your-first-account@example.com
CLAUDE_PASSWORD_1=your-password-1

# Claude Pro 账号 2  
CLAUDE_EMAIL_2=your-second-account@example.com
CLAUDE_PASSWORD_2=your-password-2

# Claude Pro 账号 3 (可选)
CLAUDE_EMAIL_3=your-third-account@example.com
CLAUDE_PASSWORD_3=your-password-3

# 数据库密码
POSTGRES_PASSWORD=secure_password_here

# JWT 密钥
JWT_SECRET=your-super-secret-jwt-key-change-this
```

### 3. 启动服务

#### 基础模式（2 个账号）

```bash
docker-compose -f docker-compose-multi-account.yml up -d
```

#### 完整模式（3 个账号）

```bash
docker-compose -f docker-compose-multi-account.yml --profile multi-account up -d
```

#### 带监控模式

```bash
docker-compose -f docker-compose-multi-account.yml --profile monitoring up -d
```

### 4. 验证服务

检查所有服务状态：

```bash
docker-compose -f docker-compose-multi-account.yml ps
```

预期输出：
```
NAME                     STATUS    PORTS
claude-redis            running    0.0.0.0:6379->6379/tcp
claude-postgres         running    0.0.0.0:5432->5432/tcp  
claude-worker-account1  running    0.0.0.0:4001->4001/tcp
claude-worker-account2  running    0.0.0.0:4002->4002/tcp
claude-orchestrator     running    0.0.0.0:3000->3000/tcp
claude-frontend         running    0.0.0.0:3030->3030/tcp
```

### 5. 访问应用

- **前端界面**: http://localhost:3030
- **API 端点**: http://localhost:3000
- **健康检查**: http://localhost:3000/health

## 详细配置

### Worker 配置

每个 Worker 容器的环境变量：

```yaml
environment:
  WORKER_ID: account1                    # Worker 唯一标识
  WORKER_PORT: 4001                      # Worker 端口
  ACCOUNT_EMAIL: ${CLAUDE_EMAIL_1}       # Claude 账号邮箱
  CLAUDE_CONFIG_PATH: /app/.claude/acc1  # Claude 配置路径
  REDIS_URL: redis://redis:6379          # Redis 连接
  DATABASE_URL: postgresql://...         # 数据库连接
```

### 负载均衡策略

在 `docker-compose-multi-account.yml` 中配置：

```yaml
orchestrator:
  environment:
    # 可选: round-robin, least-connections, weighted, response-time
    LOAD_BALANCE_STRATEGY: least-connections
```

### 速率限制

配置每个账号的速率限制：

```yaml
RATE_LIMITS: |
  {
    "account1": {"requests": 100, "window": "1h"},
    "account2": {"requests": 100, "window": "1h"},
    "account3": {"requests": 100, "window": "1h"}
  }
```

## 监控和维护

### 查看日志

查看所有服务日志：
```bash
docker-compose -f docker-compose-multi-account.yml logs -f
```

查看特定服务日志：
```bash
docker-compose -f docker-compose-multi-account.yml logs -f orchestrator
docker-compose -f docker-compose-multi-account.yml logs -f claude-worker-account1
```

### 健康检查

使用 curl 检查服务健康状态：

```bash
# Orchestrator 健康检查
curl http://localhost:3000/health

# 查看 Worker 状态
curl http://localhost:3000/api/workers

# 查看队列状态
curl http://localhost:3000/api/queue/status
```

### 重启服务

重启单个服务：
```bash
docker-compose -f docker-compose-multi-account.yml restart claude-worker-account1
```

重启所有服务：
```bash
docker-compose -f docker-compose-multi-account.yml restart
```

### 扩展 Worker

动态添加更多 Worker：

```bash
# 扩展 account1 的 worker 到 3 个实例
docker-compose -f docker-compose-multi-account.yml up -d --scale claude-worker-account1=3
```

## 故障排除

### 1. Worker 无法连接

检查 Worker 状态：
```bash
docker logs claude-worker-account1
```

手动测试 Claude CLI：
```bash
docker exec -it claude-worker-account1 claude --version
```

### 2. Redis 连接问题

检查 Redis 状态：
```bash
docker exec -it claude-redis redis-cli ping
```

### 3. 数据库连接问题

检查数据库状态：
```bash
docker exec -it claude-postgres psql -U claude_user -d claude_api -c "SELECT 1"
```

### 4. 认证失败

如果 Claude 账号认证失败：

1. 检查账号凭据是否正确
2. 确认账号是 Claude Pro 订阅
3. 检查是否有 2FA 启用（需要特殊处理）

手动认证：
```bash
docker exec -it claude-worker-account1 /bin/bash
claude auth login
```

## 性能优化

### 1. 调整 Worker 资源限制

编辑 `docker-compose-multi-account.yml`:

```yaml
deploy:
  resources:
    limits:
      cpus: '2.0'      # 增加 CPU 限制
      memory: 2G       # 增加内存限制
```

### 2. 优化 Redis 配置

```yaml
redis:
  command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
```

### 3. 调整队列并发数

```yaml
orchestrator:
  environment:
    QUEUE_CONCURRENCY: 10  # 增加并发处理数
```

## 备份和恢复

### 备份数据库

```bash
docker exec claude-postgres pg_dump -U claude_user claude_api > backup.sql
```

### 恢复数据库

```bash
docker exec -i claude-postgres psql -U claude_user claude_api < backup.sql
```

### 备份 Redis

```bash
docker exec claude-redis redis-cli BGSAVE
docker cp claude-redis:/data/dump.rdb ./redis-backup.rdb
```

## 生产部署

### 1. 使用 Docker Swarm

```bash
# 初始化 Swarm
docker swarm init

# 部署 stack
docker stack deploy -c docker-compose-multi-account.yml claude-api
```

### 2. 使用 Kubernetes

转换为 Kubernetes 配置：
```bash
kompose convert -f docker-compose-multi-account.yml
```

### 3. 启用 HTTPS

使用 nginx 配置 SSL：

```nginx
server {
    listen 443 ssl;
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    
    location / {
        proxy_pass http://orchestrator:3000;
    }
}
```

## 常见问题

### Q: 可以使用多少个 Claude 账号？
A: 理论上没有限制，但建议 3-5 个账号以平衡成本和性能。

### Q: 如何处理账号被限流？
A: 系统会自动检测并将请求路由到其他可用账号。

### Q: 如何添加新账号？
A: 
1. 在 `.env` 添加新账号配置
2. 在 `docker-compose-multi-account.yml` 添加新 Worker 服务
3. 更新 orchestrator 的 WORKERS 环境变量
4. 重启服务

### Q: 系统能处理多少并发请求？
A: 取决于 Worker 数量和配置，典型配置（3 个账号）可处理 30-50 并发请求。

## 支持

遇到问题？请查看：
- 项目 Issues: [GitHub Issues]
- 文档: [Project Wiki]
- 社区: [Discord/Slack]

## 许可证

[Your License]