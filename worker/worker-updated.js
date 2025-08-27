const { Server } = require('socket.io');
const { createServer } = require('http');
const { Client } = require('pg');
const redis = require('redis');
const ClaudeSDKWrapper = require('./claude-sdk-wrapper');
require('dotenv').config();

class ClaudeWorker {
  constructor() {
    this.workerId = process.env.WORKER_ID || `worker-${Date.now()}`;
    this.port = process.env.WORKER_PORT || 3002;
    this.currentLoad = 0;
    this.maxConcurrent = parseInt(process.env.MAX_CONCURRENT) || 5;
    
    // 初始化 Claude SDK Wrapper
    this.initializeClaudeClients();
    
    this.server = createServer();
    this.io = new Server(this.server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST']
      }
    });
    
    this.setupDatabase();
    this.setupRedis();
  }

  initializeClaudeClients() {
    // 支持多账号配置
    this.claudeClients = [];
    
    // 尝试从环境变量获取多账号配置
    const accountsJson = process.env.CLAUDE_ACCOUNTS;
    if (accountsJson) {
      try {
        const accounts = JSON.parse(accountsJson);
        accounts.forEach((account, index) => {
          const client = new ClaudeSDKWrapper({
            apiKey: account.apiKey,
            model: account.model || 'claude-3-sonnet-20240229',
            sessionDir: `/app/sessions/account-${index}`
          });
          this.claudeClients.push({
            id: `account-${index}`,
            email: account.email,
            client: client,
            usage: {
              requests: 0,
              tokens: 0,
              errors: 0
            }
          });
        });
        console.log(`✅ Initialized ${this.claudeClients.length} Claude accounts`);
      } catch (error) {
        console.error('Error parsing CLAUDE_ACCOUNTS:', error);
      }
    }
    
    // 如果没有多账号配置，使用单个 API Key
    if (this.claudeClients.length === 0) {
      const apiKey = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
      if (apiKey) {
        const client = new ClaudeSDKWrapper({
          apiKey: apiKey,
          sessionDir: '/app/sessions/default'
        });
        this.claudeClients.push({
          id: 'default',
          email: 'default@account',
          client: client,
          usage: {
            requests: 0,
            tokens: 0,
            errors: 0
          }
        });
        console.log('✅ Initialized single Claude account');
      } else {
        console.error('❌ No Claude API key found!');
        console.log('Please set CLAUDE_API_KEY or CLAUDE_ACCOUNTS in environment variables');
      }
    }
  }

  getOptimalClient() {
    // 选择使用率最低的客户端
    if (this.claudeClients.length === 0) {
      throw new Error('No Claude clients available');
    }
    
    // 简单的轮询策略，可以根据需要改进
    const client = this.claudeClients.reduce((optimal, current) => {
      const currentScore = current.usage.requests + (current.usage.errors * 10);
      const optimalScore = optimal.usage.requests + (optimal.usage.errors * 10);
      return currentScore < optimalScore ? current : optimal;
    });
    
    return client;
  }

  async setupDatabase() {
    try {
      this.db = new Client({
        connectionString: process.env.DATABASE_URL || 
          'postgresql://claude_user:claude_password@postgres:5432/claude_api'
      });
      await this.db.connect();
      console.log('✅ Connected to PostgreSQL');
    } catch (error) {
      console.error('❌ Failed to connect to PostgreSQL:', error.message);
      // 不连接数据库也可以工作，只是不记录日志
      this.db = null;
    }
  }

  async setupRedis() {
    try {
      this.redis = redis.createClient({
        url: process.env.REDIS_URL || 'redis://redis:6379'
      });
      await this.redis.connect();
      console.log('✅ Connected to Redis');
    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error.message);
      this.redis = null;
    }
  }

  async initialize() {
    await this.registerWorker();
    this.startHeartbeat();
    this.setupSocketHandlers();
    this.startServer();
  }

  async registerWorker() {
    if (!this.db) return;
    
    try {
      await this.db.query(`
        INSERT INTO workers (id, host, port, status, metrics)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (id) DO UPDATE
        SET status = 'online',
            host = $2,
            port = $3,
            last_heartbeat = CURRENT_TIMESTAMP,
            metrics = $5
      `, [
        this.workerId,
        'worker',
        this.port,
        'online',
        JSON.stringify({
          load: 0,
          accounts: this.claudeClients.length,
          maxConcurrent: this.maxConcurrent
        })
      ]);
      console.log(`✅ Worker ${this.workerId} registered`);
    } catch (error) {
      console.error('Failed to register worker:', error.message);
    }
  }

  startHeartbeat() {
    setInterval(async () => {
      if (!this.db) return;
      
      try {
        await this.db.query(`
          UPDATE workers 
          SET last_heartbeat = CURRENT_TIMESTAMP,
              status = 'online',
              metrics = $1
          WHERE id = $2
        `, [
          JSON.stringify({
            load: this.currentLoad,
            accounts: this.claudeClients.length,
            accountsStatus: this.claudeClients.map(c => ({
              id: c.id,
              requests: c.usage.requests,
              errors: c.usage.errors
            })),
            maxConcurrent: this.maxConcurrent
          }),
          this.workerId
        ]);
      } catch (error) {
        console.error('Heartbeat failed:', error.message);
      }
    }, 30000);
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);
      
      // 发送 worker 状态
      socket.emit('worker-status', {
        workerId: this.workerId,
        status: 'ready',
        load: this.currentLoad,
        maxConcurrent: this.maxConcurrent,
        accounts: this.claudeClients.length
      });

      // 处理聊天请求
      socket.on('chat', async (data, callback) => {
        if (this.currentLoad >= this.maxConcurrent) {
          return callback({ 
            success: false, 
            error: 'Worker at maximum capacity' 
          });
        }

        this.currentLoad++;
        
        try {
          const client = this.getOptimalClient();
          const result = await client.client.sendMessage(
            data.message,
            data.sessionId,
            data.options || {}
          );
          
          // 更新使用统计
          client.usage.requests++;
          if (result.usage) {
            client.usage.tokens += result.usage.totalTokens;
          }
          
          // 记录到数据库
          if (this.db && data.apiKeyId) {
            await this.recordUsage(data.apiKeyId, result.usage, 0);
          }
          
          callback(result);
        } catch (error) {
          console.error('Chat error:', error);
          
          // 更新错误统计
          const client = this.getOptimalClient();
          client.usage.errors++;
          
          callback({ 
            success: false, 
            error: error.message 
          });
        } finally {
          this.currentLoad--;
        }
      });

      // 处理流式聊天
      socket.on('stream-chat', async (data) => {
        if (this.currentLoad >= this.maxConcurrent) {
          return socket.emit('stream-error', { 
            error: 'Worker at maximum capacity' 
          });
        }

        this.currentLoad++;
        
        try {
          const client = this.getOptimalClient();
          const stream = client.client.streamMessage(
            data.message,
            data.sessionId,
            data.options || {}
          );
          
          let totalTokens = 0;
          
          for await (const chunk of stream) {
            if (chunk.type === 'text') {
              socket.emit('stream-data', chunk);
            } else if (chunk.type === 'done') {
              totalTokens = chunk.usage?.total_tokens || 0;
              socket.emit('stream-end', {
                sessionId: chunk.sessionId,
                usage: chunk.usage
              });
            } else if (chunk.type === 'error') {
              socket.emit('stream-error', { 
                error: chunk.error 
              });
            }
          }
          
          // 更新使用统计
          client.usage.requests++;
          client.usage.tokens += totalTokens;
          
        } catch (error) {
          console.error('Stream error:', error);
          socket.emit('stream-error', { 
            error: error.message 
          });
        } finally {
          this.currentLoad--;
        }
      });

      // 会话管理
      socket.on('create-session', (data, callback) => {
        try {
          const client = this.getOptimalClient();
          const session = client.client.createSession(data.sessionId);
          callback({ 
            success: true, 
            sessionId: session.id 
          });
        } catch (error) {
          callback({ 
            success: false, 
            error: error.message 
          });
        }
      });

      socket.on('get-status', (data, callback) => {
        callback({
          workerId: this.workerId,
          status: 'online',
          load: this.currentLoad,
          maxConcurrent: this.maxConcurrent,
          accounts: this.claudeClients.map(c => ({
            id: c.id,
            email: c.email,
            requests: c.usage.requests,
            errors: c.usage.errors,
            tokens: c.usage.tokens
          }))
        });
      });

      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
      });
    });
  }

  async recordUsage(apiKeyId, usage, responseTime) {
    if (!this.db) return;
    
    try {
      await this.db.query(`
        INSERT INTO usage_logs 
        (api_key_id, endpoint, method, request_tokens, response_tokens, total_tokens, response_time_ms, status_code)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        apiKeyId,
        '/api/chat',
        'POST',
        usage?.inputTokens || 0,
        usage?.outputTokens || 0,
        usage?.totalTokens || 0,
        responseTime,
        200
      ]);
    } catch (error) {
      console.error('Failed to record usage:', error.message);
    }
  }

  startServer() {
    this.server.listen(this.port, '0.0.0.0', () => {
      console.log(`
╔═══════════════════════════════════════════════╗
║                                               ║
║     Claude Worker Node                       ║
║     ID: ${this.workerId.padEnd(37)} ║
║     Port: ${String(this.port).padEnd(36)} ║
║     Accounts: ${String(this.claudeClients.length).padEnd(32)} ║
║                                               ║
╚═══════════════════════════════════════════════╝
      `);
    });
  }

  async cleanup() {
    if (this.db) {
      await this.db.query(`
        UPDATE workers 
        SET status = 'offline' 
        WHERE id = $1
      `, [this.workerId]);
      await this.db.end();
    }
    
    if (this.redis) {
      await this.redis.disconnect();
    }
    
    this.server.close();
  }
}

// 启动 Worker
const worker = new ClaudeWorker();
worker.initialize().catch(console.error);

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('Shutting down worker...');
  await worker.cleanup();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down worker...');
  await worker.cleanup();
  process.exit(0);
});