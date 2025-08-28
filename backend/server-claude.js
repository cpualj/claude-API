import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import claudeService from './services/claudeService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

// Serve static files from public directory
app.use(express.static(path.join(__dirname, 'public')));

// Socket.io setup
const io = new Server(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3030',
    credentials: true
  }
});

// In-memory storage (for development)
const storage = {
  users: new Map(),
  apiKeys: new Map(),
  sessions: new Map(),
  conversations: new Map()
};

// Mock authentication middleware
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' });
  }
  
  // Mock user for development
  req.user = { id: 'dev-user', email: 'dev@example.com' };
  next();
};

// Check Claude CLI availability on startup
let claudeAvailable = false;

// Check if Claude CLI is available
claudeService.checkAvailability().then(available => {
  claudeAvailable = available;
  if (available) {
    console.log('✅ Claude CLI is available - using real Claude integration');
    claudeService.getVersion().then(version => {
      console.log(`📌 Claude CLI version: ${version}`);
    }).catch(() => {
      console.log('📌 Claude CLI version: unknown');
    });
  } else {
    console.log('⚠️ Claude CLI not found - falling back to mock mode');
    console.log('💡 To enable Claude integration, ensure Claude CLI is installed and accessible');
  }
}).catch(err => {
  console.error('Error checking Claude CLI availability:', err);
  console.log('⚠️ Falling back to mock mode');
});

// Routes
app.get('/health', async (req, res) => {
  const claudeStatus = claudeAvailable ? 'connected' : 'mock';
  
  res.json({
    status: 'healthy',
    mode: 'claude-integrated',
    timestamp: new Date().toISOString(),
    services: {
      database: 'mock',
      redis: 'mock',
      claude: claudeStatus,
      workers: 'ready'
    }
  });
});

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  
  if (storage.users.has(email)) {
    return res.status(400).json({ error: 'Email already exists' });
  }
  
  const user = {
    id: `user-${Date.now()}`,
    email,
    name,
    createdAt: new Date()
  };
  
  storage.users.set(email, user);
  
  res.json({
    token: 'dev-token-' + user.id,
    user: { id: user.id, email: user.email, name: user.name }
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  const user = storage.users.get(email) || {
    id: 'dev-user',
    email,
    name: 'Dev User'
  };
  
  res.json({
    token: 'dev-token-' + user.id,
    user: { id: user.id, email: user.email, name: user.name }
  });
});

// Chat API with real Claude integration
app.post('/api/chat', authenticate, async (req, res) => {
  const { message, sessionId = 'default', stream = false, context = [] } = req.body;
  
  try {
    // Check if we should use mock mode
    const useMock = process.env.USE_MOCK_CLAUDE === 'true' || !claudeAvailable;
    
    if (!useMock && claudeAvailable) {
      // Use real Claude CLI
      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        // Set up streaming
        claudeService.on('stream', ({ chunk }) => {
          res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
        });
        
        const response = await claudeService.chat(message, context, { 
          sessionId, 
          stream: true 
        });
        
        res.write(`data: ${JSON.stringify({ done: true, response })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        // Non-streaming response
        const response = await claudeService.chat(message, context, { sessionId });
        
        // Store in conversation history
        if (!storage.conversations.has(sessionId)) {
          storage.conversations.set(sessionId, []);
        }
        storage.conversations.get(sessionId).push(
          { role: 'user', content: message },
          { role: 'assistant', content: response.content }
        );
        
        res.json(response);
      }
    } else {
      // Fallback to mock response
      const mockResponse = {
        id: `msg-${Date.now()}`,
        content: `[Mock Mode] Response to: "${message}"`,
        role: 'assistant',
        usage: {
          inputTokens: message.length,
          outputTokens: 100,
          totalTokens: message.length + 100
        },
        model: 'mock',
        timestamp: new Date()
      };
      
      if (stream) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        
        const words = mockResponse.content.split(' ');
        for (let i = 0; i < words.length; i++) {
          res.write(`data: ${JSON.stringify({ chunk: words[i] + ' ' })}\n\n`);
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        res.json(mockResponse);
      }
    }
  } catch (error) {
    console.error('Chat API error:', error);
    res.status(500).json({ 
      error: 'Failed to process chat request',
      details: error.message 
    });
  }
});

// Sessions API
app.get('/api/sessions', authenticate, (req, res) => {
  const userSessions = Array.from(storage.sessions.values())
    .filter(s => s.userId === req.user.id);
  
  res.json(userSessions);
});

app.post('/api/sessions', authenticate, (req, res) => {
  const { name, toolId = 'claude' } = req.body;
  
  const session = {
    id: `session-${Date.now()}`,
    userId: req.user.id,
    name: name || 'New Session',
    toolId,
    context: [],
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  storage.sessions.set(session.id, session);
  res.json(session);
});

app.get('/api/sessions/:id', authenticate, (req, res) => {
  const session = storage.sessions.get(req.params.id);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // Get conversation history
  const conversation = storage.conversations.get(session.id) || [];
  
  res.json({
    ...session,
    conversation
  });
});

app.delete('/api/sessions/:id', authenticate, (req, res) => {
  const session = storage.sessions.get(req.params.id);
  
  if (!session || session.userId !== req.user.id) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  storage.sessions.delete(req.params.id);
  storage.conversations.delete(req.params.id);
  
  res.json({ success: true });
});

// Tools API
app.get('/api/tools', (req, res) => {
  res.json([
    {
      id: 'claude',
      name: 'Claude',
      version: claudeAvailable ? '3.5 Sonnet' : 'Mock',
      status: claudeAvailable ? 'connected' : 'mock',
      capabilities: ['chat', 'code', 'analysis', 'creative']
    }
  ]);
});

// Usage API
app.get('/api/usage', authenticate, (req, res) => {
  // Calculate usage from conversations
  let totalTokens = 0;
  let totalRequests = 0;
  
  for (const [sessionId, conversation] of storage.conversations.entries()) {
    totalRequests += conversation.filter(m => m.role === 'user').length;
    conversation.forEach(msg => {
      totalTokens += Math.ceil(msg.content.length / 4); // Rough estimate
    });
  }
  
  res.json({
    period: 'current_session',
    totalRequests,
    totalTokens,
    remainingQuota: 1000000 - totalTokens,
    model: claudeAvailable ? 'claude-3-opus' : 'mock',
    breakdown: {
      chat: { requests: totalRequests, tokens: totalTokens }
    }
  });
});

// API Keys management
app.get('/api/keys', authenticate, (req, res) => {
  const userKeys = Array.from(storage.apiKeys.values())
    .filter(k => k.userId === req.user.id);
  
  res.json(userKeys);
});

app.post('/api/keys', authenticate, (req, res) => {
  const { name, expiresIn } = req.body;
  
  const apiKey = {
    id: `key-${Date.now()}`,
    key: `sk-dev-${Math.random().toString(36).substr(2, 9)}`,
    name: name || 'API Key',
    userId: req.user.id,
    createdAt: new Date(),
    expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000) : null,
    lastUsed: null,
    isActive: true
  };
  
  storage.apiKeys.set(apiKey.id, apiKey);
  res.json(apiKey);
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('subscribe', (data) => {
    const { sessionId } = data;
    socket.join(`session-${sessionId}`);
    console.log(`Client ${socket.id} subscribed to session ${sessionId}`);
  });
  
  socket.on('cancel', (data) => {
    const { sessionId } = data;
    const cancelled = claudeService.cancelSession(sessionId);
    socket.emit('cancelled', { sessionId, success: cancelled });
  });
  
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const PORT = process.env.PORT || 3002;
httpServer.listen(PORT, () => {
  console.log(`
🚀 Claude-Integrated Server Running!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Server:     http://localhost:${PORT}
🤖 Claude:     ${claudeAvailable ? '✅ Connected' : '⚠️ Mock Mode'}
💾 Storage:    In-memory
🔧 Mode:       Development with Claude CLI
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Available endpoints:
  GET  /health              - Health check
  POST /api/auth/register   - Register user
  POST /api/auth/login      - Login user
  POST /api/chat            - Chat with Claude (real/mock)
  GET  /api/sessions        - List sessions
  POST /api/sessions        - Create session
  GET  /api/sessions/:id    - Get session with history
  DEL  /api/sessions/:id    - Delete session
  GET  /api/tools           - List available tools
  GET  /api/usage           - Get usage statistics
  GET  /api/keys            - List API keys
  POST /api/keys            - Create API key

WebSocket events:
  subscribe  - Subscribe to session updates
  cancel     - Cancel active Claude request

Press Ctrl+C to stop the server.
  `);
});

export default app;