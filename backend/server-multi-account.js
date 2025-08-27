import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import MultiAccountClaudeService from './services/multiAccountService.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    credentials: true
  }
});

// Initialize multi-account service
const claudeService = new MultiAccountClaudeService();

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  const status = claudeService.getStatus();
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'multi-account-claude',
    accounts: status.accounts.filter(a => a.configured).length,
    availableAccounts: claudeService.getAvailableAccountsCount(),
    queueLength: status.queueLength
  });
});

// Get service status
app.get('/api/status', (req, res) => {
  res.json(claudeService.getStatus());
});

// Refresh accounts configuration
app.post('/api/accounts/refresh', (req, res) => {
  const status = claudeService.refreshAccountsStatus();
  res.json({
    success: true,
    status
  });
});

// Get queue information
app.get('/api/queue', (req, res) => {
  res.json(claudeService.getQueueInfo());
});

// Clear queue
app.delete('/api/queue', (req, res) => {
  const cleared = claudeService.clearQueue();
  res.json({
    success: true,
    clearedCount: cleared
  });
});

// Main chat endpoint with load balancing
app.post('/api/chat', async (req, res) => {
  const { message, options = {} } = req.body;
  
  if (!message) {
    return res.status(400).json({
      success: false,
      error: 'Message is required'
    });
  }
  
  // Check if any accounts are configured
  const status = claudeService.getStatus();
  const configuredAccounts = status.accounts.filter(a => a.configured);
  
  if (configuredAccounts.length === 0) {
    return res.status(503).json({
      success: false,
      error: 'No Claude accounts configured. Please run setup-claude-accounts.bat first.'
    });
  }
  
  try {
    // Send to queue for processing
    const result = await claudeService.sendMessage(message, options);
    
    res.json({
      success: true,
      response: result.content,
      accountUsed: result.accountUsed,
      queueLength: result.queueLength,
      timestamp: result.timestamp
    });
    
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Streaming chat endpoint (SSE)
app.post('/api/chat/stream', async (req, res) => {
  const { message, options = {} } = req.body;
  
  if (!message) {
    return res.status(400).json({
      success: false,
      error: 'Message is required'
    });
  }
  
  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  try {
    // Send initial event
    res.write(`data: ${JSON.stringify({ type: 'start', message: 'Processing...' })}\n\n`);
    
    // Process with Claude
    const result = await claudeService.sendMessage(message, options);
    
    // Send result in chunks (simulate streaming)
    const chunks = result.content.match(/.{1,50}/g) || [];
    for (const chunk of chunks) {
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
      await new Promise(resolve => setTimeout(resolve, 50)); // Small delay between chunks
    }
    
    // Send completion event
    res.write(`data: ${JSON.stringify({ 
      type: 'done', 
      accountUsed: result.accountUsed,
      timestamp: result.timestamp 
    })}\n\n`);
    
    res.end();
    
  } catch (error) {
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    res.end();
  }
});

// WebSocket handling for real-time updates
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  // Send current status on connection
  socket.emit('status', claudeService.getStatus());
  
  // Subscribe to service events
  const handleStatusUpdate = () => {
    socket.emit('status', claudeService.getStatus());
  };
  
  claudeService.on('request-completed', handleStatusUpdate);
  claudeService.on('request-failed', handleStatusUpdate);
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    claudeService.off('request-completed', handleStatusUpdate);
    claudeService.off('request-failed', handleStatusUpdate);
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

// Start server
const PORT = process.env.PORT || 3003;
httpServer.listen(PORT, () => {
  console.log(`
🎯 Multi-Account Claude Service Started!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Server:     http://localhost:${PORT}
🤖 Service:    Multi-Account Load Balancing
📊 Accounts:   Checking configuration...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Endpoints:
  GET  /health              - Service health check
  GET  /api/status          - Get accounts status
  POST /api/accounts/refresh - Refresh account configs
  GET  /api/queue           - Get queue information
  DELETE /api/queue         - Clear queue
  POST /api/chat            - Send message (load balanced)
  POST /api/chat/stream     - Stream response (SSE)

WebSocket events:
  status - Real-time status updates

⚠️  Note: Run setup-claude-accounts.bat to configure Claude accounts
  `);
  
  // Show initial status
  const status = claudeService.getStatus();
  console.log('\nAccount Status:');
  status.accounts.forEach(account => {
    if (account.configured) {
      console.log(`  ✅ ${account.id}: ${account.email}`);
    } else {
      console.log(`  ❌ ${account.id}: Not configured`);
    }
  });
  
  if (status.accounts.filter(a => a.configured).length === 0) {
    console.log('\n⚠️  WARNING: No accounts configured!');
    console.log('Please run: setup-claude-accounts.bat');
  }
});