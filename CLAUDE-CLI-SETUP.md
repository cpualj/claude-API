# Claude CLI 在 Docker 中的配置指南

## 📌 重要说明

由于 Claude CLI 的官方工具可能需要特殊的认证流程（OAuth、浏览器登录等），在 Docker 容器中我们使用 **Anthropic SDK** 直接调用 API，这样更稳定可靠。

## 🔑 方案选择

### 方案 1: 使用 Anthropic API Key（推荐）✅

这是最简单可靠的方案，直接使用 API Key 调用 Claude。

**优点**:
- 配置简单，只需 API Key
- 稳定可靠，官方支持
- 支持所有功能（流式响应、会话管理等）

**配置步骤**:

1. **获取 API Key**
   - 访问 https://console.anthropic.com/
   - 创建 API Key
   - 复制 Key

2. **配置 .env 文件**
   ```env
   # 单账号配置
   CLAUDE_API_KEY=sk-ant-api03-xxxxxxxxxxxxx
   
   # 或多账号配置（JSON格式）
   CLAUDE_ACCOUNTS='[
     {
       "email": "account1@example.com",
       "apiKey": "sk-ant-api03-xxx",
       "model": "claude-3-opus-20240229"
     },
     {
       "email": "account2@example.com", 
       "apiKey": "sk-ant-api03-yyy",
       "model": "claude-3-sonnet-20240229"
     }
   ]'
   ```

3. **启动服务**
   ```bash
   docker-compose up -d
   ```

### 方案 2: 使用 Claude Code 订阅（需要额外配置）⚠️

如果你有 Claude Code 订阅（$200套餐），需要特殊处理：

**挑战**:
- Claude Code 使用 OAuth 认证
- 需要浏览器登录
- Token 需要定期刷新

**解决方案**:

1. **本地获取 Token**
   ```bash
   # 在本地机器上安装 Claude CLI
   npm install -g @anthropic-ai/claude-code
   
   # 登录获取 token
   claude login
   
   # 查看 token 位置（通常在 ~/.claude/config.json）
   cat ~/.claude/config.json
   ```

2. **复制 Token 到 Docker**
   ```dockerfile
   # 修改 worker/Dockerfile
   FROM node:20-slim
   
   # 复制认证文件
   COPY claude-config.json /root/.claude/config.json
   
   # 安装 Claude CLI
   RUN npm install -g @anthropic-ai/claude-code
   ```

3. **使用 Token 刷新脚本**
   ```javascript
   // worker/token-refresher.js
   const fs = require('fs');
   const { exec } = require('child_process');
   
   class TokenRefresher {
     async refreshToken() {
       // 读取当前 token
       const config = JSON.parse(
         fs.readFileSync('/root/.claude/config.json')
       );
       
       // 检查是否过期
       if (this.isTokenExpired(config.token)) {
         // 使用 refresh token 获取新 token
         await this.getNewToken(config.refreshToken);
       }
     }
   }
   ```

### 方案 3: 混合模式（最灵活）🚀

结合 API Key 和 Claude Code 订阅，实现最大灵活性：

```javascript
// worker/claude-hybrid.js
class ClaudeHybridClient {
  constructor() {
    this.clients = [];
    
    // 添加 API Key 客户端
    if (process.env.CLAUDE_API_KEY) {
      this.clients.push({
        type: 'api',
        client: new AnthropicSDK({
          apiKey: process.env.CLAUDE_API_KEY
        })
      });
    }
    
    // 添加 Claude Code 客户端
    if (fs.existsSync('/root/.claude/config.json')) {
      this.clients.push({
        type: 'cli',
        client: new ClaudeCLIWrapper()
      });
    }
  }
  
  async sendMessage(message) {
    // 智能选择客户端
    const client = this.selectBestClient();
    return await client.send(message);
  }
}
```

## 🐳 Docker 配置详解

### 完整的 Worker Dockerfile

```dockerfile
FROM node:20-slim

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    curl \
    git \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 安装 Node.js 依赖
COPY package.json ./
RUN npm install

# 安装 Anthropic SDK
RUN npm install @anthropic-ai/sdk

# 可选：安装 Claude CLI（如果有认证）
# RUN npm install -g @anthropic-ai/claude-code

# 复制代码
COPY . .

# 创建必要目录
RUN mkdir -p /app/sessions /app/logs

EXPOSE 3002

CMD ["node", "worker.js"]
```

### 环境变量配置

```env
# ========== Claude 配置 ==========

# 方式 1: 直接使用 API Key
CLAUDE_API_KEY=sk-ant-api03-xxxxx

# 方式 2: 多账号配置
CLAUDE_ACCOUNTS='[{"email":"test@example.com","apiKey":"sk-ant-xxx"}]'

# 模型选择
CLAUDE_MODEL=claude-3-sonnet-20240229
# 可选: claude-3-opus-20240229 (更强但更贵)
#       claude-3-haiku-20240307 (更快更便宜)

# Token 限制
MAX_TOKENS=4096

# ========== Worker 配置 ==========
WORKER_ID=worker-1
WORKER_PORT=3002
MAX_CONCURRENT=5

# ========== 数据库配置 ==========
DATABASE_URL=postgresql://claude_user:claude_password@postgres:5432/claude_api
REDIS_URL=redis://redis:6379
```

## 🧪 测试配置

创建测试脚本验证配置：

```javascript
// worker/test-claude.js
const ClaudeSDKWrapper = require('./claude-sdk-wrapper');

async function test() {
  console.log('Testing Claude configuration...');
  
  try {
    const client = new ClaudeSDKWrapper({
      apiKey: process.env.CLAUDE_API_KEY
    });
    
    const result = await client.sendMessage('Say hello!');
    
    if (result.success) {
      console.log('✅ Claude API working!');
      console.log('Response:', result.response);
    } else {
      console.log('❌ Failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

test();
```

运行测试：
```bash
docker-compose run --rm worker1 node test-claude.js
```

## 🔍 常见问题

### 1. "No API key found"
**解决**: 检查 .env 文件中的 `CLAUDE_API_KEY`

### 2. "Rate limit exceeded"  
**解决**: 配置多个账号进行负载均衡

### 3. "Authentication failed"
**解决**: 
- 确认 API Key 正确
- 检查账号是否有效
- 查看是否超出配额

### 4. Docker 容器内无法访问 Claude
**解决**:
```bash
# 进入容器调试
docker exec -it claude-worker-1 bash

# 测试网络
curl https://api.anthropic.com/v1/messages

# 查看环境变量
env | grep CLAUDE

# 手动测试
node test-claude.js
```

## 📊 监控和日志

### 查看 Worker 状态
```bash
# 实时日志
docker-compose logs -f worker1

# 检查健康状态
curl http://localhost:3002/health

# 查看所有 worker
docker-compose ps | grep worker
```

### 数据库中查看使用情况
```sql
-- 连接到 PostgreSQL
docker-compose exec postgres psql -U claude_user -d claude_api

-- 查看 worker 状态
SELECT * FROM workers;

-- 查看使用统计
SELECT * FROM usage_logs ORDER BY timestamp DESC LIMIT 10;

-- 查看账号使用情况
SELECT 
  api_key_id,
  COUNT(*) as requests,
  SUM(total_tokens) as total_tokens
FROM usage_logs 
GROUP BY api_key_id;
```

## 🚀 生产环境建议

1. **使用多个 API Key**: 避免单点限制
2. **配置监控告警**: 及时发现问题
3. **定期轮换 Key**: 提高安全性
4. **使用 Redis 缓存**: 减少重复请求
5. **启用日志聚合**: 便于问题排查

## 📚 参考资源

- [Anthropic API 文档](https://docs.anthropic.com/)
- [Claude 模型对比](https://www.anthropic.com/claude)
- [API 定价](https://www.anthropic.com/pricing)
- [最佳实践](https://docs.anthropic.com/claude/docs/best-practices)