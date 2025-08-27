import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { Server } from 'socket.io';

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

// In-memory storage for development
const mockDatabase = {
  users: new Map(),
  apiKeys: new Map(),
  sessions: new Map(),
  requests: []
};

// Mock authentication middleware
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'No authorization header' });
  }
  
  // Mock user
  req.user = { id: 'dev-user', email: 'dev@example.com' };
  next();
};

// Routes
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    mode: 'development',
    timestamp: new Date().toISOString(),
    services: {
      database: 'mock',
      redis: 'mock',
      workers: 'mock'
    }
  });
});

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  const { email, password, name } = req.body;
  
  if (mockDatabase.users.has(email)) {
    return res.status(400).json({ error: 'Email already exists' });
  }
  
  const user = {
    id: `user-${Date.now()}`,
    email,
    name,
    createdAt: new Date()
  };
  
  mockDatabase.users.set(email, user);
  
  res.json({
    token: 'dev-token-' + user.id,
    user: { id: user.id, email: user.email, name: user.name }
  });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  
  // Mock login - accept any credentials in dev mode
  const user = mockDatabase.users.get(email) || {
    id: 'dev-user',
    email,
    name: 'Dev User'
  };
  
  res.json({
    token: 'dev-token-' + user.id,
    user: { id: user.id, email: user.email, name: user.name }
  });
});

// Chat API
app.post('/api/chat', authenticate, async (req, res) => {
  const { message, sessionId, stream = false } = req.body;
  
  // Mock response
  const response = {
    id: `msg-${Date.now()}`,
    content: `Mock response to: "${message}"`,
    usage: {
      inputTokens: message.length,
      outputTokens: 50,
      totalTokens: message.length + 50
    },
    timestamp: new Date()
  };
  
  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Simulate streaming
    const words = response.content.split(' ');
    for (let i = 0; i < words.length; i++) {
      res.write(`data: ${JSON.stringify({ chunk: words[i] + ' ' })}\n\n`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    res.write('data: [DONE]\n\n');
    res.end();
  } else {
    res.json(response);
  }
});

// Sessions API
app.get('/api/sessions', authenticate, (req, res) => {
  const userSessions = Array.from(mockDatabase.sessions.values())
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
  
  mockDatabase.sessions.set(session.id, session);
  res.json(session);
});

// Tools API
app.get('/api/tools', (req, res) => {
  res.json([
    {
      id: 'claude',
      name: 'Claude',
      version: '3.5',
      status: 'mock',
      capabilities: ['chat', 'code', 'analysis']
    }
  ]);
});

// Usage API
app.get('/api/usage', authenticate, (req, res) => {
  res.json({
    period: 'current_month',
    totalRequests: 42,
    totalTokens: 12345,
    remainingQuota: 987655,
    breakdown: {
      chat: { requests: 30, tokens: 10000 },
      code: { requests: 12, tokens: 2345 }
    }
  });
});

// API Keys management
app.get('/api/keys', authenticate, (req, res) => {
  const userKeys = Array.from(mockDatabase.apiKeys.values())
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
  
  mockDatabase.apiKeys.set(apiKey.id, apiKey);
  res.json(apiKey);
});

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  
  socket.on('subscribe', (data) => {
    console.log('Client subscribed:', data);
    socket.join(data.room || 'default');
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
const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`
🚀 Development Server Running!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📡 Server:     http://localhost:${PORT}
💾 Database:   In-memory mock
📦 Redis:      In-memory mock  
🔧 Mode:       Development (No external dependencies)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Available endpoints:
  GET  /health              - Health check
  POST /api/auth/register   - Register user
  POST /api/auth/login      - Login user
  POST /api/chat            - Send chat message
  GET  /api/sessions        - List sessions
  POST /api/sessions        - Create session
  GET  /api/tools           - List available tools
  GET  /api/usage           - Get usage statistics
  GET  /api/keys            - List API keys
  POST /api/keys            - Create API key

Press Ctrl+C to stop the server.
  `);
});

export default app;