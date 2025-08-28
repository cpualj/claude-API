import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Import services
import claudeBrowserService from './services/claudeBrowserService.js';

// Import routes
import authRoutes from './routes/auth.js';
import healthRoutes from './routes/health.js';
import browserPoolRoutes from './routes/api/browser-pool.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3003;

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
app.use('/api/browser-pool', browserPoolRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'Claude Browser Pool API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      browserPool: {
        initialize: 'POST /api/browser-pool/initialize',
        chat: 'POST /api/browser-pool/chat',
        stats: 'GET /api/browser-pool/stats',
        health: 'GET /api/browser-pool/health',
        recycle: 'POST /api/browser-pool/recycle/:instanceId',
        shutdown: 'POST /api/browser-pool/shutdown',
        testBrowser: 'POST /api/browser-pool/test-browser'
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

// Initialize browser pool on startup (optional)
async function initializeBrowserPool() {
  try {
    console.log('Initializing browser pool on startup...');
    
    const poolOptions = {
      minInstances: parseInt(process.env.BROWSER_POOL_MIN) || 2,
      maxInstances: parseInt(process.env.BROWSER_POOL_MAX) || 5,
      maxMessagesPerInstance: parseInt(process.env.BROWSER_MAX_MESSAGES) || 50,
      warmupOnStart: process.env.BROWSER_WARMUP !== 'false'
    };
    
    await claudeBrowserService.initialize(poolOptions);
    
    console.log('Browser pool initialized successfully');
    
    // Get initial stats
    const stats = await claudeBrowserService.getPoolStats();
    console.log('Initial pool stats:', JSON.stringify(stats, null, 2));
  } catch (error) {
    console.error('Failed to initialize browser pool:', error);
    // Continue running even if initialization fails
  }
}

// Graceful shutdown
async function gracefulShutdown(signal) {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  try {
    // Shutdown browser pool
    await claudeBrowserService.shutdown();
    console.log('Browser pool shut down successfully');
    
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
  console.log(`Claude Browser Pool API Server`);
  console.log(`${'='.repeat(50)}`);
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`${'='.repeat(50)}\n`);
  
  // Initialize browser pool if AUTO_INIT is set
  if (process.env.BROWSER_POOL_AUTO_INIT !== 'false') {
    await initializeBrowserPool();
  }
});

export default app;