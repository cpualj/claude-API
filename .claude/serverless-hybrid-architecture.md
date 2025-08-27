# Vercel + Supabase + 自托管 Worker 混合架构

## 架构概述

利用 Vercel 的 Serverless 优势处理 Web 请求，Supabase 提供数据存储和认证，自托管 Worker 运行 Claude CLI。

```
┌──────────────────────────────────────────────────────┐
│                   用户请求                           │
└─────────────────────┬────────────────────────────────┘
                      ▼
┌──────────────────────────────────────────────────────┐
│              Vercel (Edge Functions)                  │
├──────────────────────────────────────────────────────┤
│  • Next.js 应用 (管理界面)                           │
│  • API Routes (请求验证和路由)                       │
│  • Edge Functions (低延迟响应)                       │
│  • 静态资源 CDN                                      │
└─────────────────┬───────────────┬────────────────────┘
                  │               │
                  ▼               ▼
┌─────────────────────┐  ┌────────────────────────────┐
│     Supabase        │  │   Worker Pool (自托管)      │
├─────────────────────┤  ├────────────────────────────┤
│ • PostgreSQL DB     │  │ • Docker 容器              │
│ • Auth 认证         │  │ • Claude CLI 进程          │
│ • Realtime 订阅     │  │ • WebSocket 连接           │
│ • Storage 存储      │  │ • 队列管理                 │
└─────────────────────┘  └────────────────────────────┘
```

## 1. Vercel 端实现

### 1.1 项目结构
```
claude-api/
├── app/                      # Next.js 13+ App Router
│   ├── api/
│   │   ├── chat/
│   │   │   └── route.ts     # 聊天 API
│   │   ├── workers/
│   │   │   └── route.ts     # Worker 管理
│   │   └── keys/
│   │       └── route.ts     # API Key 管理
│   ├── dashboard/
│   │   └── page.tsx         # 管理面板
│   └── layout.tsx
├── lib/
│   ├── supabase.ts          # Supabase 客户端
│   ├── worker-client.ts     # Worker 通信
│   └── auth.ts              # 认证逻辑
├── components/               # React 组件
└── vercel.json              # Vercel 配置
```

### 1.2 API Route 实现

```typescript
// app/api/chat/route.ts
import { createClient } from '@supabase/supabase-js'
import { WorkerPool } from '@/lib/worker-pool'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)

const workerPool = new WorkerPool({
  workers: process.env.WORKER_URLS?.split(',') || [],
  supabase
})

export async function POST(request: Request) {
  try {
    // 1. 验证 API Key
    const apiKey = request.headers.get('x-api-key')
    if (!apiKey) {
      return Response.json({ error: 'Missing API key' }, { status: 401 })
    }

    const { data: keyData, error: keyError } = await supabase
      .from('api_keys')
      .select('*')
      .eq('key', apiKey)
      .single()

    if (keyError || !keyData || keyData.status !== 'active') {
      return Response.json({ error: 'Invalid API key' }, { status: 401 })
    }

    // 2. 检查配额
    const usage = await checkUsage(keyData.id)
    if (usage.exceeded) {
      return Response.json({ error: 'Quota exceeded' }, { status: 429 })
    }

    // 3. 获取请求内容
    const { message, stream = false, sessionId } = await request.json()

    // 4. 选择可用的 Worker
    const worker = await workerPool.getAvailableWorker()
    
    // 5. 转发请求到 Worker
    if (stream) {
      // SSE 流式响应
      const encoder = new TextEncoder()
      const stream = new TransformStream()
      const writer = stream.writable.getWriter()

      // 异步处理流
      worker.streamChat(message, sessionId).then(async (eventStream) => {
        for await (const event of eventStream) {
          await writer.write(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
          )
        }
        await writer.write(encoder.encode('data: [DONE]\n\n'))
        await writer.close()
      })

      return new Response(stream.readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    } else {
      // 普通响应
      const response = await worker.chat(message, sessionId)
      
      // 记录使用量
      await recordUsage(keyData.id, response.tokens)
      
      return Response.json(response)
    }
  } catch (error) {
    console.error('Chat API error:', error)
    return Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

async function checkUsage(apiKeyId: string) {
  const { data, error } = await supabase
    .rpc('check_api_usage', { key_id: apiKeyId })
  
  return {
    exceeded: data?.exceeded || false,
    usage: data?.usage || {}
  }
}

async function recordUsage(apiKeyId: string, tokens: number) {
  await supabase.from('usage_logs').insert({
    api_key_id: apiKeyId,
    tokens,
    timestamp: new Date().toISOString()
  })
}
```

### 1.3 Worker 连接管理

```typescript
// lib/worker-pool.ts
import { io, Socket } from 'socket.io-client'

interface Worker {
  id: string
  url: string
  socket: Socket
  status: 'connecting' | 'ready' | 'busy' | 'error'
  currentLoad: number
}

export class WorkerPool {
  private workers: Map<string, Worker> = new Map()
  private supabase: any

  constructor(config: { workers: string[], supabase: any }) {
    this.supabase = config.supabase
    this.initializeWorkers(config.workers)
  }

  private initializeWorkers(urls: string[]) {
    urls.forEach((url, index) => {
      const worker: Worker = {
        id: `worker-${index}`,
        url,
        socket: io(url, {
          auth: {
            token: process.env.WORKER_AUTH_TOKEN
          }
        }),
        status: 'connecting',
        currentLoad: 0
      }

      worker.socket.on('connect', () => {
        worker.status = 'ready'
        console.log(`Worker ${worker.id} connected`)
      })

      worker.socket.on('status', (data) => {
        worker.status = data.status
        worker.currentLoad = data.load
      })

      worker.socket.on('disconnect', () => {
        worker.status = 'error'
      })

      this.workers.set(worker.id, worker)
    })
  }

  async getAvailableWorker(): Promise<Worker> {
    // 获取所有可用的 worker
    const availableWorkers = Array.from(this.workers.values())
      .filter(w => w.status === 'ready')
      .sort((a, b) => a.currentLoad - b.currentLoad)

    if (availableWorkers.length === 0) {
      throw new Error('No available workers')
    }

    return availableWorkers[0]
  }

  async chat(workerId: string, message: string, sessionId?: string) {
    const worker = this.workers.get(workerId)
    if (!worker) throw new Error('Worker not found')

    return new Promise((resolve, reject) => {
      worker.socket.emit('chat', { message, sessionId }, (response: any) => {
        if (response.error) {
          reject(new Error(response.error))
        } else {
          resolve(response)
        }
      })
    })
  }

  async streamChat(workerId: string, message: string, sessionId?: string) {
    const worker = this.workers.get(workerId)
    if (!worker) throw new Error('Worker not found')

    return new Promise<AsyncIterable<any>>((resolve) => {
      const events: any[] = []
      let done = false

      worker.socket.emit('stream-chat', { message, sessionId })
      
      worker.socket.on('stream-data', (data) => {
        events.push(data)
      })

      worker.socket.on('stream-end', () => {
        done = true
      })

      const asyncIterable = {
        async *[Symbol.asyncIterator]() {
          while (!done || events.length > 0) {
            if (events.length > 0) {
              yield events.shift()
            } else {
              await new Promise(resolve => setTimeout(resolve, 100))
            }
          }
        }
      }

      resolve(asyncIterable)
    })
  }
}
```

## 2. Supabase 配置

### 2.1 数据库表结构

```sql
-- API Keys 表
CREATE TABLE api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  limits JSONB DEFAULT '{"requests_per_minute": 10, "tokens_per_day": 100000}'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- 使用记录
CREATE TABLE usage_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID REFERENCES api_keys(id),
  tokens INTEGER,
  endpoint VARCHAR(255),
  response_time_ms INTEGER,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);

-- Worker 状态
CREATE TABLE workers (
  id VARCHAR(255) PRIMARY KEY,
  url VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'offline',
  last_heartbeat TIMESTAMPTZ,
  metrics JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 会话存储
CREATE TABLE sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id UUID REFERENCES api_keys(id),
  conversation_id VARCHAR(255),
  context JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建索引
CREATE INDEX idx_api_keys_key ON api_keys(key);
CREATE INDEX idx_usage_logs_timestamp ON usage_logs(timestamp);
CREATE INDEX idx_workers_status ON workers(status);

-- RPC 函数：检查 API 使用量
CREATE OR REPLACE FUNCTION check_api_usage(key_id UUID)
RETURNS TABLE(exceeded BOOLEAN, usage JSONB) AS $$
DECLARE
  key_limits JSONB;
  minute_count INTEGER;
  day_tokens INTEGER;
BEGIN
  -- 获取限制
  SELECT limits INTO key_limits FROM api_keys WHERE id = key_id;
  
  -- 检查每分钟请求数
  SELECT COUNT(*) INTO minute_count
  FROM usage_logs
  WHERE api_key_id = key_id
    AND timestamp > NOW() - INTERVAL '1 minute';
  
  -- 检查每日 token 数
  SELECT COALESCE(SUM(tokens), 0) INTO day_tokens
  FROM usage_logs
  WHERE api_key_id = key_id
    AND timestamp > NOW() - INTERVAL '1 day';
  
  RETURN QUERY
  SELECT 
    (minute_count >= (key_limits->>'requests_per_minute')::INTEGER OR
     day_tokens >= (key_limits->>'tokens_per_day')::INTEGER) AS exceeded,
    jsonb_build_object(
      'minute_requests', minute_count,
      'day_tokens', day_tokens,
      'limits', key_limits
    ) AS usage;
END;
$$ LANGUAGE plpgsql;

-- 实时订阅触发器
CREATE OR REPLACE FUNCTION notify_worker_status()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('worker_status', row_to_json(NEW)::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER worker_status_trigger
AFTER UPDATE ON workers
FOR EACH ROW
EXECUTE FUNCTION notify_worker_status();
```

### 2.2 Supabase 客户端配置

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// 管理员客户端（服务器端使用）
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
)
```

## 3. Worker 节点实现

### 3.1 Docker 镜像

```dockerfile
# Dockerfile
FROM node:20-slim

# 安装 Claude CLI
RUN npm install -g @anthropic-ai/claude-code

WORKDIR /app

# 复制 worker 代码
COPY package*.json ./
RUN npm ci --production

COPY . .

EXPOSE 3002

CMD ["node", "worker.js"]
```

### 3.2 Worker 服务器

```javascript
// worker.js
const express = require('express')
const { Server } = require('socket.io')
const { spawn } = require('child_process')
const { createClient } = require('@supabase/supabase-js')

const app = express()
const server = require('http').createServer(app)
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['*']
  }
})

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

class ClaudeWorker {
  constructor() {
    this.sessions = new Map()
    this.processes = new Map()
    this.currentLoad = 0
    this.maxConcurrent = parseInt(process.env.MAX_CONCURRENT) || 5
  }

  async initialize() {
    // 注册 worker
    await this.registerWorker()
    
    // 定期发送心跳
    setInterval(() => this.sendHeartbeat(), 30000)
  }

  async registerWorker() {
    const workerId = process.env.WORKER_ID || `worker-${Date.now()}`
    await supabase.from('workers').upsert({
      id: workerId,
      url: process.env.WORKER_URL || `http://localhost:3002`,
      status: 'online',
      last_heartbeat: new Date().toISOString()
    })
  }

  async sendHeartbeat() {
    await supabase.from('workers')
      .update({
        status: 'online',
        last_heartbeat: new Date().toISOString(),
        metrics: {
          load: this.currentLoad,
          sessions: this.sessions.size,
          processes: this.processes.size
        }
      })
      .eq('id', process.env.WORKER_ID)
  }

  async executeCommand(message, sessionId) {
    if (this.currentLoad >= this.maxConcurrent) {
      throw new Error('Worker at capacity')
    }

    this.currentLoad++

    try {
      // 获取或创建 Claude 进程
      let claudeProcess = this.processes.get(sessionId)
      
      if (!claudeProcess) {
        claudeProcess = spawn('claude', ['--no-interactive'], {
          env: {
            ...process.env,
            ANTHROPIC_API_KEY: process.env.CLAUDE_API_KEY
          }
        })
        this.processes.set(sessionId, claudeProcess)
      }

      // 发送消息并获取响应
      return new Promise((resolve, reject) => {
        let response = ''
        
        claudeProcess.stdout.on('data', (data) => {
          response += data.toString()
        })

        claudeProcess.stdin.write(message + '\n')

        // 设置超时
        setTimeout(() => {
          resolve({
            response,
            tokens: this.estimateTokens(response)
          })
        }, 30000) // 30秒超时
      })
    } finally {
      this.currentLoad--
    }
  }

  estimateTokens(text) {
    // 简单估算：约 4 个字符 = 1 token
    return Math.ceil(text.length / 4)
  }
}

const worker = new ClaudeWorker()
worker.initialize()

// Socket.io 连接处理
io.use((socket, next) => {
  const token = socket.handshake.auth.token
  if (token === process.env.WORKER_AUTH_TOKEN) {
    next()
  } else {
    next(new Error('Authentication failed'))
  }
})

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id)

  // 发送当前状态
  socket.emit('status', {
    status: 'ready',
    load: worker.currentLoad
  })

  // 处理聊天请求
  socket.on('chat', async (data, callback) => {
    try {
      const result = await worker.executeCommand(data.message, data.sessionId)
      callback(result)
    } catch (error) {
      callback({ error: error.message })
    }
  })

  // 处理流式聊天
  socket.on('stream-chat', async (data) => {
    try {
      const sessionId = data.sessionId || `session-${Date.now()}`
      const claudeProcess = spawn('claude', ['--stream'], {
        env: process.env
      })

      claudeProcess.stdout.on('data', (chunk) => {
        socket.emit('stream-data', {
          chunk: chunk.toString(),
          sessionId
        })
      })

      claudeProcess.on('close', () => {
        socket.emit('stream-end', { sessionId })
      })

      claudeProcess.stdin.write(data.message + '\n')
    } catch (error) {
      socket.emit('stream-error', { error: error.message })
    }
  })

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id)
  })
})

const PORT = process.env.PORT || 3002
server.listen(PORT, () => {
  console.log(`Worker listening on port ${PORT}`)
})
```

## 4. 部署步骤

### 4.1 Vercel 部署

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
# 在 Vercel Dashboard 中设置:
# - SUPABASE_URL
# - SUPABASE_ANON_KEY
# - SUPABASE_SERVICE_KEY
# - WORKER_URLS (多个 worker 地址，逗号分隔)
# - WORKER_AUTH_TOKEN

# 3. 部署到 Vercel
vercel --prod
```

### 4.2 Worker 部署选项

#### 选项 A: Railway
```yaml
# railway.yaml
services:
  worker:
    build: .
    dockerfile: Dockerfile
    env:
      SUPABASE_URL: ${{ SUPABASE_URL }}
      SUPABASE_SERVICE_KEY: ${{ SUPABASE_SERVICE_KEY }}
      CLAUDE_API_KEY: ${{ CLAUDE_API_KEY }}
      WORKER_AUTH_TOKEN: ${{ WORKER_AUTH_TOKEN }}
    ports:
      - 3002
```

#### 选项 B: Fly.io
```toml
# fly.toml
app = "claude-worker"

[build]
  dockerfile = "Dockerfile"

[[services]]
  internal_port = 3002
  protocol = "tcp"

  [[services.ports]]
    port = 443
    handlers = ["http", "tls"]

[env]
  PORT = "3002"
```

#### 选项 C: Docker Compose (VPS)
```yaml
version: '3.8'

services:
  worker1:
    build: .
    environment:
      - WORKER_ID=worker-1
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
      - CLAUDE_API_KEY=${CLAUDE_API_KEY_1}
    ports:
      - "3002:3002"
    restart: always

  worker2:
    build: .
    environment:
      - WORKER_ID=worker-2
      - SUPABASE_URL=${SUPABASE_URL}
      - SUPABASE_SERVICE_KEY=${SUPABASE_SERVICE_KEY}
      - CLAUDE_API_KEY=${CLAUDE_API_KEY_2}
    ports:
      - "3003:3002"
    restart: always

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - worker1
      - worker2
```

## 5. 成本分析

### Vercel
- **免费套餐**: 100GB 带宽，100万次请求
- **Pro**: $20/月，1TB 带宽

### Supabase
- **免费套餐**: 500MB 数据库，2GB 带宽
- **Pro**: $25/月，8GB 数据库，50GB 带宽

### Worker 节点
- **Railway**: $5/月起
- **Fly.io**: 免费套餐可用
- **VPS**: $5-10/月 (DigitalOcean, Vultr)
- **家用电脑**: 免费

**总成本**: 
- 最低：$0（免费套餐 + 家用电脑）
- 推荐：$10-30/月（获得更好的性能和可靠性）

## 6. 优势

1. **易于部署**: Vercel 一键部署，Worker 使用 Docker
2. **低成本**: 充分利用免费套餐
3. **高可用**: Vercel 全球 CDN + 多 Worker 节点
4. **易于扩展**: 随时增加 Worker 节点
5. **实时监控**: Supabase Realtime 订阅
6. **安全**: API Key 认证 + Worker Token 验证