import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import claudePoolService from './services/claudePoolService.js';

// Load environment variables
dotenv.config();

const app = express();
const httpServer = createServer(app);

// Middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3030',
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Socket.io setup
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3030',
    credentials: true
  }
});

// 简单的内存存储
const sessions = new Map();

// Mock authentication middleware
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' });
  }
  
  // Mock validation
  req.user = { id: 'dev-user', email: 'dev@example.com' };
  next();
};

// Routes
app.get('/health', (req, res) => {
  const poolStatus = claudePoolService.getPoolStatus();
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    pool: {
      workers: poolStatus.workers.length,
      busy: poolStatus.workers.filter(w => w.busy).length,
      queue: poolStatus.queueLength,
      health: poolStatus.poolHealth
    },
    stats: poolStatus.stats
  });
});

// Chat endpoint using pool
app.post('/api/chat', authenticate, async (req, res) => {
  const { message, sessionId = 'default', stream = false, model } = req.body;
  
  try {
    // 获取池状态
    const poolStatus = claudePoolService.getPoolStatus();
    
    // 如果池太忙，返回 503
    if (poolStatus.queueLength > 20) {
      return res.status(503).json({
        error: 'Service overloaded',
        queueLength: poolStatus.queueLength,
        message: 'Too many requests, please try again later'
      });
    }
    
    // 使用池处理请求
    const result = await claudePoolService.chat(message, { model, stream });
    
    // 保存到会话历史
    if (!sessions.has(sessionId)) {
      sessions.set(sessionId, []);
    }
    
    const history = sessions.get(sessionId);
    history.push(
      { role: 'user', content: message, timestamp: new Date() },
      { role: 'assistant', content: result.content, timestamp: new Date() }
    );
    
    res.json({
      id: `msg-${Date.now()}`,
      content: result.content,
      workerId: result.workerId,
      duration: result.duration,
      usage: {
        inputTokens: Math.ceil(message.length / 4),
        outputTokens: Math.ceil(result.content.length / 4),
        totalTokens: Math.ceil((message.length + result.content.length) / 4)
      },
      poolStatus: {
        queueLength: poolStatus.queueLength,
        busyWorkers: poolStatus.workers.filter(w => w.busy).length,
        totalWorkers: poolStatus.workers.length
      }
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      error: 'Failed to process chat request',
      details: error.message
    });
  }
});

// Pool management endpoints
app.get('/api/pool/status', (req, res) => {
  res.json(claudePoolService.getPoolStatus());
});

app.post('/api/pool/scale', authenticate, async (req, res) => {
  const { size } = req.body;
  
  if (!size || size < 1 || size > 10) {
    return res.status(400).json({
      error: 'Invalid pool size',
      message: 'Pool size must be between 1 and 10'
    });
  }
  
  await claudePoolService.scalePool(size);
  res.json({
    success: true,
    newSize: size,
    status: claudePoolService.getPoolStatus()
  });
});

// Session endpoints
app.post('/api/sessions', authenticate, (req, res) => {
  const sessionId = `session-${Date.now()}`;
  sessions.set(sessionId, []);
  
  res.json({
    id: sessionId,
    createdAt: new Date().toISOString()
  });
});

app.get('/api/sessions/:id', authenticate, (req, res) => {
  const { id } = req.params;
  const history = sessions.get(id);
  
  if (!history) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  res.json({
    id,
    messages: history,
    messageCount: history.length
  });
});

// Auth endpoints (mock)
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  // Mock authentication
  if (email && password) {
    res.json({
      token: 'dev-token-' + email,
      user: {
        id: 'dev-user',
        email,
        name: 'Dev User'
      }
    });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

// WebSocket handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // 监听池事件并广播给客户端
  claudePoolService.on('processing', (data) => {
    socket.emit('pool-event', { type: 'processing', ...data });
  });
  
  claudePoolService.on('completed', (data) => {
    socket.emit('pool-event', { type: 'completed', ...data });
  });
  
  claudePoolService.on('queued', (data) => {
    socket.emit('pool-event', { type: 'queued', ...data });
  });
  
  // 定期发送池状态
  const statusInterval = setInterval(() => {
    socket.emit('pool-status', claudePoolService.getPoolStatus());
  }, 5000);
  
  socket.on('disconnect', () => {
    clearInterval(statusInterval);
    console.log('Client disconnected:', socket.id);
  });
});

// Start server
const PORT = process.env.PORT || 3003;
httpServer.listen(PORT, () => {
  console.log(`
🚀 Claude Pool Server Running!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Server:     http://localhost:${PORT}
🏊 Pool Size:  ${claudePoolService.poolSize} workers
💾 Storage:    In-memory
🔧 Mode:       Multi-instance Claude CLI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Available endpoints:
  GET  /health              - Health check & pool status
  POST /api/chat            - Chat with Claude (pool)
  GET  /api/pool/status     - Get pool status
  POST /api/pool/scale      - Scale pool size
  GET  /api/sessions        - List sessions
  POST /api/sessions        - Create session
  GET  /api/sessions/:id    - Get session history

WebSocket events:
  pool-status    - Pool status updates
  pool-event     - Processing events

Press Ctrl+C to stop the server.
  `);
  
  // 显示池状态
  const poolStatus = claudePoolService.getPoolStatus();
  console.log('Worker Pool Status:');
  poolStatus.workers.forEach(worker => {
    console.log(`  ${worker.busy ? '🔴' : '🟢'} ${worker.id}: ${worker.busy ? 'BUSY' : 'IDLE'}`);
  });
});

export default app;