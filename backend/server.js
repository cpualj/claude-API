import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { config } from 'dotenv';

import { initDatabase } from './db/init.js';
import { setupRedis } from './services/redis.js';
import { WorkerManager } from './services/workerManager.js';
import { ApiKeyManager } from './services/apiKeyManager.js';
import { SessionManager } from './services/sessionManager.js';

// 导入路由
import authRoutes from './routes/auth.js';
import apiRoutes from './routes/api.js';
import adminRoutes from './routes/admin.js';
import healthRoutes from './routes/health.js';

config(); // 替代 require('dotenv').config()

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3030',
    credentials: true
  }
});

// 中间件
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3030',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 初始化服务
let workerManager;
let apiKeyManager;
let sessionManager;
let redis;

async function initializeServices() {
  console.log('🚀 Initializing services...');
  
  try {
    // 初始化数据库
    await initDatabase();
    console.log('✅ Database initialized');
    
    // 初始化 Redis
    redis = await setupRedis();
    console.log('✅ Redis connected');
    
    // 初始化管理器
    workerManager = new WorkerManager(io, redis);
    apiKeyManager = new ApiKeyManager(redis);
    sessionManager = new SessionManager(redis);
    
    // 启动 Worker 管理器
    await workerManager.initialize();
    console.log('✅ Worker manager initialized');
    
    // 将服务注入到请求上下文
    app.use((req, res, next) => {
      req.services = {
        workerManager,
        apiKeyManager,
        sessionManager,
        redis,
        io
      };
      next();
    });
    
    console.log('✅ All services initialized successfully');
  } catch (error) {
    console.error('❌ Service initialization failed:', error);
    process.exit(1);
  }
}

// 路由
app.use('/health', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

// 错误处理
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// Socket.io 连接处理
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('subscribe-workers', () => {
    socket.join('workers-status');
    if (workerManager) {
      socket.emit('workers-update', workerManager.getWorkersStatus());
    }
  });
  
  socket.on('subscribe-sessions', () => {
    socket.join('sessions-status');
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// 优雅关闭处理
async function gracefulShutdown(signal) {
  console.log(`\n📡 Received ${signal}, shutting down gracefully...`);
  
  // 停止接受新连接
  server.close(async () => {
    console.log('🔌 HTTP server closed');
    
    try {
      // 关闭所有服务
      if (workerManager) {
        await workerManager.shutdown();
      }
      
      if (sessionManager) {
        await sessionManager.shutdown();
      }
      
      if (redis) {
        const { closeRedis } = await import('./services/redis.js');
        await closeRedis();
      }
      
      const { closeDatabase } = await import('./db/init.js');
      await closeDatabase();
      
      console.log('✅ All services shut down gracefully');
      process.exit(0);
      
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  });
  
  // 强制退出超时
  setTimeout(() => {
    console.error('⏰ Shutdown timeout, forcing exit');
    process.exit(1);
  }, 30000); // 30秒超时
}

// 注册信号处理
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 未捕获异常处理
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

// 启动服务器
const PORT = process.env.PORT || 3001;

async function start() {
  try {
    await initializeServices();
    
    server.listen(PORT, '0.0.0.0', () => {
      console.log(`
╔═══════════════════════════════════════════════╗
║                                               ║
║     Claude API Wrapper Server                ║
║                                               ║
║     🌍 Environment: ${(process.env.NODE_ENV || 'development').padEnd(19)} ║
║     🚀 Running on: http://localhost:${PORT}      ║
║     📊 Health: http://localhost:${PORT}/health   ║
║     🔐 Admin: http://localhost:${PORT}/api/admin ║
║     💬 Chat: http://localhost:${PORT}/api/chat   ║
║                                               ║
╚═══════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

start();