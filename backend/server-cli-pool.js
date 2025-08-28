import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Import services
import claudeCliPoolService from './services/claudeCliPoolService.js';

// Import routes
import authRoutes from './routes/auth.js';
import healthRoutes from './routes/health.js';
import cliPoolRoutes from './routes/api/cli-pool.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3004;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/health', healthRoutes);
app.use('/api/cli-pool', cliPoolRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Claude CLI Pool API',
    version: '1.0.0',
    status: 'running',
    description: 'Multi-instance Claude CLI wrapper for concurrent conversations',
    endpoints: {
      health: '/health',
      cliPool: {
        initialize: 'POST /api/cli-pool/initialize',
        chat: 'POST /api/cli-pool/chat',
        chatBatch: 'POST /api/cli-pool/chat-batch',
        stats: 'GET /api/cli-pool/stats',
        health: 'GET /api/cli-pool/health',
        instanceInfo: 'GET /api/cli-pool/instance/:id',
        healthCheck: 'POST /api/cli-pool/health-check',
        shutdown: 'POST /api/cli-pool/shutdown'
      },
      auth: {
        login: 'POST /api/auth/login',
        register: 'POST /api/auth/register'
      }
    }
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

// Initialize CLI pool on startup (optional)
async function initializeCliPool() {
  try {
    console.log('Initializing Claude CLI pool on startup...');
    
    const poolOptions = {
      minInstances: parseInt(process.env.CLI_POOL_MIN) || 2,
      maxInstances: parseInt(process.env.CLI_POOL_MAX) || 5,
      maxMessagesPerInstance: parseInt(process.env.CLI_MAX_MESSAGES) || 100,
      staleTimeout: parseInt(process.env.CLI_STALE_TIMEOUT) || 600000,
      healthCheckInterval: parseInt(process.env.CLI_HEALTH_CHECK_INTERVAL) || 30000
    };
    
    await claudeCliPoolService.initialize(poolOptions);
    
    console.log('Claude CLI pool initialized successfully');
    
    // Get initial stats
    const stats = claudeCliPoolService.getStats();
    console.log('Initial pool stats:', JSON.stringify(stats, null, 2));
  } catch (error) {
    console.error('Failed to initialize CLI pool:', error);
    // Continue running even if initialization fails
    // Pool can be initialized later via API
  }
}

// Graceful shutdown
async function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  try {
    // Shutdown CLI pool
    await claudeCliPoolService.shutdown();
    console.log('Claude CLI pool shut down successfully');
    
    // Close server
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
    
    // Force exit after 10 seconds
    setTimeout(() => {
      console.error('Could not close connections in time, forcefully shutting down');
      process.exit(1);
    }, 10000);
  } catch (error) {
    console.error('Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Start server
const server = app.listen(PORT, async () => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Claude CLI Pool API Server`);
  console.log(`${'='.repeat(50)}`);
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`${'='.repeat(50)}`);
  console.log(`\nFeatures:`);
  console.log(`  ✅ Multiple Claude CLI instances running concurrently`);
  console.log(`  ✅ Each instance maintains independent conversation context`);
  console.log(`  ✅ Automatic load balancing across instances`);
  console.log(`  ✅ Instance recycling and health checks`);
  console.log(`  ✅ Support for batch message processing`);
  console.log(`${'='.repeat(50)}\n`);
  
  // Initialize CLI pool if AUTO_INIT is set
  if (process.env.CLI_POOL_AUTO_INIT !== 'false') {
    await initializeCliPool();
  }
});

export default app;