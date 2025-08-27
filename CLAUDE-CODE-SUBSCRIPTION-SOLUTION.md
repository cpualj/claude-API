# 利用 $200 Claude Code 订阅套餐的解决方案

## 🎯 核心目标
**充分利用 Claude Code $200/月 订阅的无限使用权限，而不是按 token 付费**

## 🔑 关键挑战与解决方案

### 挑战 1: Claude Code 需要浏览器登录
Claude Code CLI 使用 OAuth 认证，需要浏览器完成登录流程。

### 解决方案：预认证 + Token 共享

## 📋 实施方案

### 方案 A: 宿主机认证 + Docker 挂载（最简单）✅

这是最实用的方案，在宿主机上完成认证，然后共享给 Docker 容器。

#### 步骤 1: 在宿主机安装并认证 Claude Code

**Windows (PowerShell):**
```powershell
# 安装 Claude Code
npm install -g @anthropic-ai/claude-code

# 登录（会打开浏览器）
claude login

# 验证登录成功
claude --version

# 找到认证文件位置
echo $env:USERPROFILE\.claude
# 通常在 C:\Users\你的用户名\.claude\
```

**Mac/Linux:**
```bash
# 安装 Claude Code
npm install -g @anthropic-ai/claude-code

# 登录
claude login

# 验证
claude --version

# 认证文件位置
ls ~/.claude/
```

#### 步骤 2: 修改 docker-compose.yml 挂载认证目录

```yaml
version: '3.8'

services:
  worker1:
    build:
      context: ./worker
      dockerfile: Dockerfile.claude-code
    container_name: claude-worker-1
    volumes:
      # 关键：挂载宿主机的 Claude 认证目录
      - ${HOME}/.claude:/root/.claude:ro  # Linux/Mac
      # - ${USERPROFILE}/.claude:/root/.claude:ro  # Windows
      - ./worker:/app
      - /app/node_modules
    environment:
      WORKER_ID: worker-1
      WORKER_PORT: 3002
      # 不需要 API Key！
    ports:
      - "3002:3002"
```

#### 步骤 3: 创建专用的 Dockerfile

```dockerfile
# worker/Dockerfile.claude-code
FROM node:20

# 安装 Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app

# 复制应用代码
COPY package*.json ./
RUN npm ci
COPY . .

# 创建脚本验证认证
RUN echo '#!/bin/bash\n\
if [ -f /root/.claude/config.json ]; then\n\
  echo "✅ Claude authentication found"\n\
else\n\
  echo "❌ Claude authentication not found"\n\
  echo "Please run: claude login on host machine"\n\
  exit 1\n\
fi\n\
exec "$@"' > /entrypoint.sh && chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "worker-claude-code.js"]
```

### 方案 B: 远程 Worker（推荐用于生产）🚀

在可以图形登录的机器上运行 Worker，通过网络连接到主服务。

#### 架构设计：

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│   Docker     │────▶│   Worker     │────▶│   Worker     │
│   主服务     │     │   (办公PC)   │     │   (家里PC)  │
│  (云服务器)  │     │  Claude登录  │     │  Claude登录  │
└──────────────┘     └──────────────┘     └──────────────┘
```

#### Worker 独立部署脚本：

```javascript
// remote-worker/standalone-worker.js
const io = require('socket.io-client');
const { spawn } = require('child_process');
const os = require('os');

class RemoteClaudeWorker {
  constructor(config) {
    this.workerId = `worker-${os.hostname()}-${Date.now()}`;
    this.serverUrl = config.serverUrl || 'http://your-server:3001';
    this.authToken = config.authToken;
    
    // 连接到主服务器
    this.socket = io(this.serverUrl, {
      auth: { token: this.authToken }
    });
    
    this.setupHandlers();
    this.verifyClaudeAuth();
  }
  
  async verifyClaudeAuth() {
    return new Promise((resolve, reject) => {
      const proc = spawn('claude', ['--version']);
      
      proc.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Claude Code authenticated');
          this.registerWorker();
          resolve();
        } else {
          console.error('❌ Claude Code not authenticated');
          console.log('Please run: claude login');
          reject();
        }
      });
    });
  }
  
  registerWorker() {
    this.socket.emit('worker-register', {
      workerId: this.workerId,
      hostname: os.hostname(),
      platform: os.platform(),
      capabilities: {
        maxConcurrent: 5,
        models: ['claude-3-opus', 'claude-3-sonnet']
      }
    });
  }
  
  setupHandlers() {
    this.socket.on('execute-command', async (data) => {
      const result = await this.executeClaudeCommand(data);
      this.socket.emit('command-result', result);
    });
  }
  
  async executeClaudeCommand(data) {
    return new Promise((resolve) => {
      const args = [];
      if (data.stream) args.push('--stream');
      
      const proc = spawn('claude', args);
      let output = '';
      
      proc.stdout.on('data', (chunk) => {
        output += chunk.toString();
        if (data.stream) {
          this.socket.emit('stream-chunk', {
            sessionId: data.sessionId,
            chunk: chunk.toString()
          });
        }
      });
      
      proc.stdin.write(data.message + '\n');
      proc.stdin.end();
      
      proc.on('close', () => {
        resolve({
          sessionId: data.sessionId,
          response: output,
          success: true
        });
      });
    });
  }
}

// 启动配置
const worker = new RemoteClaudeWorker({
  serverUrl: process.env.SERVER_URL || 'http://localhost:3001',
  authToken: process.env.WORKER_TOKEN || 'your-secret-token'
});
```

#### 在 Windows 上创建自启动服务：

```batch
@echo off
:: remote-worker/start-worker.bat
cd /d C:\claude-worker
node standalone-worker.js
```

使用 Task Scheduler 设置开机自启。

### 方案 C: 会话保持技术（高级）🔧

保持 Claude Code 会话长期有效：

```javascript
// worker/session-keeper.js
class ClaudeSessionKeeper {
  constructor() {
    this.sessions = new Map();
    this.processPool = [];
    this.maxProcesses = 5;
    
    this.initializeProcessPool();
  }
  
  async initializeProcessPool() {
    for (let i = 0; i < this.maxProcesses; i++) {
      const proc = await this.createClaudeProcess(i);
      this.processPool.push({
        id: i,
        process: proc,
        busy: false,
        lastUsed: Date.now()
      });
    }
  }
  
  async createClaudeProcess(id) {
    return new Promise((resolve, reject) => {
      // 创建持久的 Claude 进程
      const proc = spawn('claude', ['--no-interactive'], {
        env: {
          ...process.env,
          CLAUDE_SESSION_ID: `session-${id}`
        }
      });
      
      proc.stdout.once('data', () => {
        console.log(`✅ Claude process ${id} ready`);
        resolve(proc);
      });
      
      // 保持进程活跃
      setInterval(() => {
        proc.stdin.write('\n');
      }, 30000); // 每30秒发送心跳
    });
  }
  
  async getAvailableProcess() {
    // 找到空闲的进程
    const available = this.processPool.find(p => !p.busy);
    if (available) {
      available.busy = true;
      available.lastUsed = Date.now();
      return available;
    }
    
    // 等待进程可用
    return new Promise((resolve) => {
      const check = setInterval(() => {
        const proc = this.processPool.find(p => !p.busy);
        if (proc) {
          clearInterval(check);
          proc.busy = true;
          proc.lastUsed = Date.now();
          resolve(proc);
        }
      }, 100);
    });
  }
  
  async sendMessage(message, sessionId) {
    const proc = await this.getAvailableProcess();
    
    try {
      // 发送消息到 Claude
      const response = await this.executeCommand(proc.process, message);
      
      // 保存会话上下文
      if (!this.sessions.has(sessionId)) {
        this.sessions.set(sessionId, []);
      }
      this.sessions.get(sessionId).push({
        message,
        response,
        timestamp: Date.now()
      });
      
      return response;
    } finally {
      proc.busy = false;
    }
  }
}
```

## 🎯 最佳实践建议

### 1. 多账号池化管理

```javascript
// 账号池配置
const accounts = [
  { email: 'account1@gmail.com', machineId: 'office-pc' },
  { email: 'account2@gmail.com', machineId: 'home-pc' },
  { email: 'account3@gmail.com', machineId: 'laptop' }
];
```

### 2. 自动重新认证

```javascript
// 定期检查并刷新认证
async function checkAndRefreshAuth() {
  const proc = spawn('claude', ['--check-auth']);
  
  proc.on('close', (code) => {
    if (code !== 0) {
      console.log('需要重新认证');
      // 发送通知给管理员
      sendAlert('Claude needs re-authentication');
    }
  });
}

setInterval(checkAndRefreshAuth, 3600000); // 每小时检查
```

### 3. 使用状态监控

```javascript
class ClaudeMonitor {
  async getStatus() {
    return {
      authenticated: await this.checkAuth(),
      usage: await this.getUsageStats(),
      sessions: this.getActiveSessions(),
      health: this.getHealthStatus()
    };
  }
  
  async getUsageStats() {
    // Claude Code 订阅是无限使用，但可以统计请求数
    return {
      requestsToday: this.requestCount,
      avgResponseTime: this.avgTime,
      errors: this.errorCount
    };
  }
}
```

## 🚨 重要提醒

1. **不要分享认证文件** - `.claude/config.json` 包含你的认证信息
2. **定期检查登录状态** - Token 可能过期
3. **备份认证文件** - 避免重复登录
4. **监控使用情况** - 虽然无限使用，但要避免滥用

## 📝 快速开始检查单

- [ ] 在本地机器安装 Claude Code
- [ ] 运行 `claude login` 完成认证
- [ ] 找到 `.claude` 目录位置
- [ ] 修改 docker-compose.yml 挂载认证目录
- [ ] 启动 Docker 服务
- [ ] 验证 Worker 可以调用 Claude

## 🎉 总结

通过挂载宿主机的 Claude 认证目录，我们可以在 Docker 中使用 Claude Code 订阅，实现：

- ✅ **零 API 成本** - 利用 $200 订阅的无限使用
- ✅ **简单部署** - 只需挂载一个目录
- ✅ **多账号支持** - 可以部署多个 Worker
- ✅ **灵活扩展** - 支持远程 Worker

这样就真正实现了利用 Claude Code 订阅套餐的目标！