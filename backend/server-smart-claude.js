import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Import smart Claude service
import smartClaudeCliService from './services/smartClaudeCliService.js';

// Import routes
import authRoutes from './routes/auth.js';
import healthRoutes from './routes/health.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.SMART_CLAUDE_PORT || 3006;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static('public'));
app.use(express.static(path.join(__dirname, 'public')));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/health', healthRoutes);

// Smart Claude API Routes
app.post('/api/smart-claude/chat', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    console.log(`Chat request - Session: ${sessionId || 'none'}, Message: ${message.substring(0, 100)}...`);
    
    const response = await smartClaudeCliService.sendMessage(message, { 
      sessionId: sessionId || `session-${Date.now()}` 
    });

    res.json({
      success: true,
      ...response
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 批量处理
app.post('/api/smart-claude/chat-batch', async (req, res) => {
  try {
    const { messages } = req.body;
    
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Messages array is required'
      });
    }

    console.log(`Batch request with ${messages.length} messages`);
    
    const results = await Promise.all(
      messages.map(async (item, index) => {
        try {
          const response = await smartClaudeCliService.sendMessage(
            item.message, 
            { sessionId: item.sessionId || `batch-${Date.now()}-${index}` }
          );
          return { success: true, ...response };
        } catch (error) {
          return { success: false, error: error.message };
        }
      })
    );

    res.json({
      success: true,
      results,
      processed: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length
    });
  } catch (error) {
    console.error('Batch error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取统计信息
app.get('/api/smart-claude/stats', async (req, res) => {
  try {
    const stats = smartClaudeCliService.getStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 健康检查
app.get('/api/smart-claude/health', async (req, res) => {
  try {
    const health = await smartClaudeCliService.healthCheck();
    res.json({
      success: true,
      ...health
    });
  } catch (error) {
    console.error('Health check error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 手动清理
app.post('/api/smart-claude/cleanup', async (req, res) => {
  try {
    const cleaned = await smartClaudeCliService.cleanup();
    res.json({
      success: true,
      message: `Cleaned up ${cleaned} idle instances`,
      cleaned
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 获取实例信息
app.get('/api/smart-claude/instance/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const info = smartClaudeCliService.getInstanceInfo(id);
    
    if (!info) {
      return res.status(404).json({
        success: false,
        error: 'Instance not found'
      });
    }

    res.json({
      success: true,
      instance: info
    });
  } catch (error) {
    console.error('Instance info error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Smart Claude CLI API',
    version: '2.0.0',
    status: 'running',
    description: 'Dynamic on-demand Claude CLI instances with intelligent recycling',
    features: [
      'Zero pre-allocation - instances created only when needed',
      'Intelligent automatic recycling based on usage patterns',
      'Session-based conversation continuity', 
      'Automatic idle timeout and cleanup',
      'Dynamic scaling based on demand',
      'Memory-efficient conversation management'
    ],
    endpoints: {
      chat: 'POST /api/smart-claude/chat',
      batchChat: 'POST /api/smart-claude/chat-batch',
      stats: 'GET /api/smart-claude/stats',
      health: 'GET /api/smart-claude/health',
      cleanup: 'POST /api/smart-claude/cleanup',
      instanceInfo: 'GET /api/smart-claude/instance/:id'
    },
    advantages: [
      '🚀 Faster startup - no pre-initialization',
      '💾 Lower memory usage - instances created on demand',
      '🔄 Smarter recycling - based on actual usage patterns',
      '📊 Better scaling - adapts to real workload',
      '🧹 Self-cleaning - automatic idle instance removal'
    ]
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error'
  });
});

// Graceful shutdown
async function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  try {
    await smartClaudeCliService.shutdown();
    console.log('Smart Claude CLI service shut down successfully');
    
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
    
    // Force exit after 5 seconds
    setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 5000);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const server = app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Smart Claude CLI API Server`);
  console.log(`${'='.repeat(60)}`);
  console.log(`🌐 Server running on http://localhost:${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`\n✨ New Architecture Features:`);
  console.log(`  🎯 Zero Pre-allocation: Instances created only when needed`);
  console.log(`  🧠 Smart Recycling: Auto-destroy after 5min idle OR 50 messages`);
  console.log(`  🔄 Session Management: Conversation continuity across requests`);
  console.log(`  📊 Dynamic Scaling: Scales up/down based on actual demand`);
  console.log(`  🧹 Self-Cleaning: No manual maintenance required`);
  console.log(`  💾 Memory Efficient: Lower resource usage than pool approach`);
  console.log(`${'='.repeat(60)}\n`);
});

export default app;