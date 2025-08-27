const { Server } = require('socket.io');
const { createServer } = require('http');
const { spawn } = require('child_process');
const { v4: uuidv4 } = require('uuid');
const { Client } = require('pg');
const redis = require('redis');
require('dotenv').config();

class ClaudeWorker {
  constructor() {
    this.workerId = process.env.WORKER_ID || `worker-${uuidv4()}`;
    this.port = process.env.WORKER_PORT || 3002;
    this.sessions = new Map();
    this.processes = new Map();
    this.currentLoad = 0;
    this.maxConcurrent = parseInt(process.env.MAX_CONCURRENT) || 5;
    this.accountIndex = parseInt(process.env.CLAUDE_ACCOUNT_INDEX) || 0;
    
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

  async setupDatabase() {
    this.db = new Client({
      connectionString: process.env.DATABASE_URL
    });
    await this.db.connect();
    console.log('✅ Connected to PostgreSQL');
  }

  async setupRedis() {
    this.redis = redis.createClient({
      url: process.env.REDIS_URL
    });
    await this.redis.connect();
    console.log('✅ Connected to Redis');
  }

  async initialize() {
    await this.registerWorker();
    this.startHeartbeat();
    this.setupSocketHandlers();
    this.startServer();
  }

  async registerWorker() {
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
        'worker', // Docker 内部主机名
        this.port,
        'online',
        JSON.stringify({
          load: 0,
          sessions: 0,
          maxConcurrent: this.maxConcurrent
        })
      ]);
      console.log(`✅ Worker ${this.workerId} registered`);
    } catch (error) {
      console.error('Failed to register worker:', error);
    }
  }

  startHeartbeat() {
    setInterval(async () => {
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
            sessions: this.sessions.size,
            processes: this.processes.size,
            maxConcurrent: this.maxConcurrent
          }),
          this.workerId
        ]);
      } catch (error) {
        console.error('Heartbeat failed:', error);
      }
    }, 30000); // 30秒心跳
  }

  setupSocketHandlers() {
    this.io.on('connection', (socket) => {
      console.log(`Client connected: ${socket.id}`);
      
      // 发送 worker 状态
      socket.emit('worker-status', {
        workerId: this.workerId,
        status: 'ready',
        load: this.currentLoad,
        maxConcurrent: this.maxConcurrent
      });

      // 处理聊天请求
      socket.on('chat', async (data, callback) => {
        try {
          const result = await this.handleChat(data);
          callback({ success: true, ...result });
        } catch (error) {
          console.error('Chat error:', error);
          callback({ success: false, error: error.message });
        }
      });

      // 处理流式聊天
      socket.on('stream-chat', async (data) => {
        try {
          await this.handleStreamChat(socket, data);
        } catch (error) {
          console.error('Stream chat error:', error);
          socket.emit('stream-error', { error: error.message });
        }
      });

      // 处理会话管理
      socket.on('create-session', async (data, callback) => {
        const sessionId = uuidv4();
        this.sessions.set(sessionId, {
          id: sessionId,
          createdAt: Date.now(),
          context: []
        });
        callback({ sessionId });
      });

      socket.on('delete-session', async (data, callback) => {
        const { sessionId } = data;
        if (this.sessions.has(sessionId)) {
          // 终止相关进程
          const process = this.processes.get(sessionId);
          if (process) {
            process.kill();
            this.processes.delete(sessionId);
          }
          this.sessions.delete(sessionId);
          callback({ success: true });
        } else {
          callback({ success: false, error: 'Session not found' });
        }
      });

      socket.on('disconnect', () => {
        console.log(`Client disconnected: ${socket.id}`);
      });
    });
  }

  async handleChat(data) {
    const { message, sessionId, apiKeyId, options = {} } = data;
    
    if (this.currentLoad >= this.maxConcurrent) {
      throw new Error('Worker at maximum capacity');
    }

    this.currentLoad++;
    const startTime = Date.now();

    try {
      // 获取或创建 Claude 进程
      let claudeProcess = this.processes.get(sessionId);
      
      if (!claudeProcess) {
        // 使用环境变量中的 Claude 账号
        const claudeEnv = this.getClaudeEnvironment();
        
        claudeProcess = spawn('claude', [], {
          env: {
            ...process.env,
            ...claudeEnv
          },
          cwd: '/app/.claude'
        });
        
        this.processes.set(sessionId, claudeProcess);
        
        // 等待进程准备就绪
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // 发送消息并获取响应
      const response = await this.sendToClaudeProcess(claudeProcess, message);
      
      const responseTime = Date.now() - startTime;
      const tokens = this.estimateTokens(message, response);

      // 记录使用情况
      if (apiKeyId) {
        await this.recordUsage(apiKeyId, tokens, responseTime);
      }

      return {
        response,
        sessionId,
        tokens,
        responseTime
      };
    } finally {
      this.currentLoad--;
    }
  }

  async handleStreamChat(socket, data) {
    const { message, sessionId, apiKeyId } = data;
    
    if (this.currentLoad >= this.maxConcurrent) {
      throw new Error('Worker at maximum capacity');
    }

    this.currentLoad++;
    const startTime = Date.now();

    try {
      const claudeEnv = this.getClaudeEnvironment();
      
      const claudeProcess = spawn('claude', ['--stream'], {
        env: {
          ...process.env,
          ...claudeEnv
        },
        cwd: '/app/.claude'
      });

      let responseBuffer = '';
      let totalTokens = 0;

      claudeProcess.stdout.on('data', (chunk) => {
        const text = chunk.toString();
        responseBuffer += text;
        
        socket.emit('stream-data', {
          chunk: text,
          sessionId
        });
      });

      claudeProcess.stderr.on('data', (data) => {
        console.error('Claude stderr:', data.toString());
      });

      claudeProcess.on('close', async (code) => {
        const responseTime = Date.now() - startTime;
        totalTokens = this.estimateTokens(message, responseBuffer);
        
        // 记录使用情况
        if (apiKeyId) {
          await this.recordUsage(apiKeyId, totalTokens, responseTime);
        }

        socket.emit('stream-end', {
          sessionId,
          tokens: totalTokens,
          responseTime
        });
      });

      // 发送消息
      claudeProcess.stdin.write(message + '\n');
      claudeProcess.stdin.end();
      
    } finally {
      this.currentLoad--;
    }
  }

  sendToClaudeProcess(process, message) {
    return new Promise((resolve, reject) => {
      let response = '';
      let errorOutput = '';
      const timeout = setTimeout(() => {
        reject(new Error('Claude process timeout'));
      }, 60000); // 60秒超时

      const dataHandler = (data) => {
        response += data.toString();
      };

      const errorHandler = (data) => {
        errorOutput += data.toString();
      };

      process.stdout.on('data', dataHandler);
      process.stderr.on('data', errorHandler);

      process.stdin.write(message + '\n');
      
      // 等待响应完成
      setTimeout(() => {
        clearTimeout(timeout);
        process.stdout.removeListener('data', dataHandler);
        process.stderr.removeListener('data', errorHandler);
        
        if (errorOutput) {
          console.error('Claude error:', errorOutput);
        }
        
        resolve(response);
      }, 5000); // 给5秒响应时间
    });
  }

  getClaudeEnvironment() {
    // 从环境变量获取 Claude 账号配置
    const accounts = process.env.CLAUDE_ACCOUNTS ? 
      JSON.parse(process.env.CLAUDE_ACCOUNTS) : [];
    
    if (accounts.length === 0) {
      // 使用默认的 API Key
      return {
        ANTHROPIC_API_KEY: process.env.CLAUDE_API_KEY || ''
      };
    }

    // 根据索引选择账号
    const account = accounts[this.accountIndex % accounts.length];
    
    return {
      ANTHROPIC_API_KEY: account.apiKey || '',
      ANTHROPIC_EMAIL: account.email || '',
      // 可以添加更多账号相关的环境变量
    };
  }

  estimateTokens(input, output) {
    // 简单估算：约 4 个字符 = 1 token
    const inputTokens = Math.ceil(input.length / 4);
    const outputTokens = Math.ceil(output.length / 4);
    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens
    };
  }

  async recordUsage(apiKeyId, tokens, responseTime) {
    try {
      await this.db.query(`
        INSERT INTO usage_logs 
        (api_key_id, endpoint, method, request_tokens, response_tokens, total_tokens, response_time_ms, status_code)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        apiKeyId,
        '/api/chat',
        'POST',
        tokens.inputTokens || 0,
        tokens.outputTokens || 0,
        tokens.totalTokens || 0,
        responseTime,
        200
      ]);
    } catch (error) {
      console.error('Failed to record usage:', error);
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
║                                               ║
╚═══════════════════════════════════════════════╝
      `);
    });
  }

  async cleanup() {
    // 清理所有进程
    for (const [sessionId, process] of this.processes) {
      process.kill();
    }
    this.processes.clear();

    // 更新 worker 状态为离线
    await this.db.query(`
      UPDATE workers 
      SET status = 'offline' 
      WHERE id = $1
    `, [this.workerId]);

    // 关闭连接
    await this.db.end();
    await this.redis.disconnect();
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