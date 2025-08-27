import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import { Server } from 'socket.io';
import { authenticateAPIKey } from '../../middleware/auth.js';
import { rateLimiter } from '../../middleware/rate-limit.js';

// Mock dependencies before importing router
vi.mock('../../services/universal-chat-service');
vi.mock('../../middleware/auth');
vi.mock('../../middleware/rate-limit');
vi.mock('socket.io');

// Import router after mocks are set up
const routerModule = await import('./universal-chat.js');
const router = routerModule.default;
const { resetChatService } = routerModule;
const UniversalChatService = (await import('../../services/universal-chat-service.js')).default;

describe('Universal Chat API Routes', () => {
  let app;
  let mockService;
  let mockIO;

  beforeEach(() => {
    // Reset the service for each test
    resetChatService();
    
    // Setup Express app
    app = express();
    app.use(express.json());
    
    // Mock authentication middleware
    authenticateAPIKey.mockImplementation((req, res, next) => {
      req.apiKey = { id: 'test-key', userId: 'test-user' };
      next();
    });

    // Mock rate limiter
    rateLimiter.mockImplementation((req, res, next) => next());

    // Mock Socket.IO
    mockIO = {
      emit: vi.fn(),
      to: vi.fn(() => mockIO),
    };
    app.locals.io = mockIO;

    // Setup router
    app.use('/api/chat', router);

    // Setup mock service
    mockService = {
      chat: vi.fn(),
      streamChat: vi.fn(),
      createSession: vi.fn(),
      getSession: vi.fn(),
      endSession: vi.fn(),
      listSessions: vi.fn(),
      getAvailableTools: vi.fn(),
      validateToolConfig: vi.fn(),
    };
    UniversalChatService.mockImplementation(() => mockService);

    vi.clearAllMocks();
  });

  describe('POST /api/chat/message', () => {
    it('should send a chat message successfully', async () => {
      const mockResponse = {
        success: true,
        response: 'Hello! How can I help you?',
        usage: {
          inputTokens: 10,
          outputTokens: 20,
          totalTokens: 30,
        },
        toolId: 'claude',
        sessionId: 'session-123',
      };

      mockService.chat.mockResolvedValueOnce(mockResponse);

      const response = await request(app)
        .post('/api/chat/message')
        .set('X-API-Key', 'test-key')
        .send({
          message: 'Hello',
          toolId: 'claude',
          sessionId: 'session-123',
        })
        .expect(200);

      expect(response.body).toEqual(mockResponse);
      expect(mockService.chat).toHaveBeenCalledWith({
        message: 'Hello',
        toolId: 'claude',
        sessionId: 'session-123',
        userId: 'test-user',
        apiKeyId: 'test-key',
      });
    });

    it('should validate required message field', async () => {
      const response = await request(app)
        .post('/api/chat/message')
        .set('X-API-Key', 'test-key')
        .send({
          toolId: 'claude',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Message is required'),
      });
    });

    it('should handle service errors', async () => {
      mockService.chat.mockRejectedValueOnce(
        new Error('Tool not available')
      );

      const response = await request(app)
        .post('/api/chat/message')
        .set('X-API-Key', 'test-key')
        .send({
          message: 'Hello',
          toolId: 'unavailable-tool',
        })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Chat request failed',
      });
    });

    it('should require authentication', async () => {
      authenticateAPIKey.mockImplementationOnce((req, res, next) => {
        res.status(401).json({ error: 'Invalid API key' });
      });

      await request(app)
        .post('/api/chat/message')
        .send({ message: 'Hello' })
        .expect(401);
    });

    it('should respect rate limiting', async () => {
      rateLimiter.mockImplementationOnce((req, res, next) => {
        res.status(429).json({ error: 'Rate limit exceeded' });
      });

      await request(app)
        .post('/api/chat/message')
        .set('X-API-Key', 'test-key')
        .send({ message: 'Hello' })
        .expect(429);
    });
  });

  describe('POST /api/chat/stream', () => {
    it('should stream chat responses', async () => {
      const mockStream = async function* () {
        yield { type: 'text', content: 'Hello' };
        yield { type: 'text', content: ' world' };
        yield { type: 'done', usage: { totalTokens: 10 } };
      };

      mockService.streamChat.mockReturnValueOnce(mockStream());

      const response = await request(app)
        .post('/api/chat/stream')
        .set('X-API-Key', 'test-key')
        .send({
          message: 'Hello',
          toolId: 'claude',
        })
        .expect(200);

      // Check SSE headers
      expect(response.headers['content-type']).toBe('text/event-stream');
      expect(response.headers['cache-control']).toBe('no-cache');
      
      // Parse SSE events
      const events = response.text
        .split('\n\n')
        .filter(e => e.startsWith('data: '))
        .map(e => JSON.parse(e.replace('data: ', '')));

      expect(events).toHaveLength(3);
      expect(events[0]).toEqual({ type: 'text', content: 'Hello' });
      expect(events[2]).toMatchObject({ type: 'done' });
    });

    it('should handle stream errors', async () => {
      const mockStream = async function* () {
        yield { type: 'text', content: 'Starting...' };
        throw new Error('Stream interrupted');
      };

      mockService.streamChat.mockReturnValueOnce(mockStream());

      const response = await request(app)
        .post('/api/chat/stream')
        .set('X-API-Key', 'test-key')
        .send({
          message: 'Hello',
          toolId: 'claude',
        })
        .expect(200);

      const events = response.text
        .split('\n\n')
        .filter(e => e.startsWith('data: '))
        .map(e => JSON.parse(e.replace('data: ', '')));

      const errorEvent = events.find(e => e.type === 'error');
      expect(errorEvent).toMatchObject({
        type: 'error',
        error: 'Stream interrupted',
      });
    });
  });

  describe('POST /api/chat/session', () => {
    it('should create a new session', async () => {
      const mockSession = {
        id: 'session-456',
        toolId: 'claude',
        userId: 'test-user',
        createdAt: new Date().toISOString(),
        context: [],
      };

      mockService.createSession.mockResolvedValueOnce(mockSession);

      const response = await request(app)
        .post('/api/chat/session')
        .set('X-API-Key', 'test-key')
        .send({
          toolId: 'claude',
        })
        .expect(201);

      expect(response.body).toEqual({
        success: true,
        session: mockSession,
      });
      expect(mockService.createSession).toHaveBeenCalledWith({
        toolId: 'claude',
        userId: 'test-user',
      });
    });

    it('should validate tool availability', async () => {
      mockService.createSession.mockRejectedValueOnce(
        new Error('Tool not enabled')
      );

      const response = await request(app)
        .post('/api/chat/session')
        .set('X-API-Key', 'test-key')
        .send({
          toolId: 'disabled-tool',
        })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to create session',
      });
    });
  });

  describe('GET /api/chat/session/:sessionId', () => {
    it('should get session details', async () => {
      const mockSession = {
        id: 'session-123',
        toolId: 'claude',
        userId: 'test-user',
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString(),
        context: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
      };

      mockService.getSession.mockResolvedValueOnce(mockSession);

      const response = await request(app)
        .get('/api/chat/session/session-123')
        .set('X-API-Key', 'test-key')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        session: mockSession,
      });
      expect(mockService.getSession).toHaveBeenCalledWith(
        'session-123',
        'test-user'
      );
    });

    it('should handle session not found', async () => {
      mockService.getSession.mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/api/chat/session/non-existent')
        .set('X-API-Key', 'test-key')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'Session not found',
      });
    });
  });

  describe('DELETE /api/chat/session/:sessionId', () => {
    it('should end a session', async () => {
      mockService.endSession.mockResolvedValueOnce({
        success: true,
      });

      const response = await request(app)
        .delete('/api/chat/session/session-123')
        .set('X-API-Key', 'test-key')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'Session ended successfully',
      });
      expect(mockService.endSession).toHaveBeenCalledWith(
        'session-123',
        'test-user'
      );
    });

    it('should handle session cleanup errors', async () => {
      mockService.endSession.mockRejectedValueOnce(
        new Error('Process cleanup failed')
      );

      const response = await request(app)
        .delete('/api/chat/session/session-123')
        .set('X-API-Key', 'test-key')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to end session',
      });
    });
  });

  describe('GET /api/chat/sessions', () => {
    it('should list user sessions', async () => {
      const mockSessions = [
        {
          id: 'session-1',
          toolId: 'claude',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'session-2',
          toolId: 'openai',
          createdAt: new Date().toISOString(),
        },
      ];

      mockService.listSessions.mockResolvedValueOnce(mockSessions);

      const response = await request(app)
        .get('/api/chat/sessions')
        .set('X-API-Key', 'test-key')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        sessions: mockSessions,
      });
      expect(mockService.listSessions).toHaveBeenCalledWith('test-user', undefined);
    });

    it('should support filtering by tool', async () => {
      const mockSessions = [
        {
          id: 'session-1',
          toolId: 'claude',
          createdAt: new Date().toISOString(),
        },
      ];

      mockService.listSessions.mockResolvedValueOnce(mockSessions);

      const response = await request(app)
        .get('/api/chat/sessions?toolId=claude')
        .set('X-API-Key', 'test-key')
        .expect(200);

      expect(response.body.sessions).toEqual(mockSessions);
      expect(mockService.listSessions).toHaveBeenCalledWith(
        'test-user',
        { toolId: 'claude' }
      );
    });
  });

  describe('GET /api/chat/tools', () => {
    it('should list available tools', async () => {
      const mockTools = [
        {
          id: 'claude',
          name: 'Claude Code',
          enabled: true,
          authStatus: 'authenticated',
        },
        {
          id: 'openai',
          name: 'OpenAI CLI',
          enabled: true,
          authStatus: 'not_authenticated',
        },
      ];

      mockService.getAvailableTools.mockResolvedValueOnce(mockTools);

      const response = await request(app)
        .get('/api/chat/tools')
        .set('X-API-Key', 'test-key')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        tools: mockTools,
      });
    });

    it('should handle service unavailability', async () => {
      mockService.getAvailableTools.mockRejectedValueOnce(
        new Error('Service unavailable')
      );

      const response = await request(app)
        .get('/api/chat/tools')
        .set('X-API-Key', 'test-key')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to fetch available tools',
      });
    });
  });

  describe('WebSocket Events', () => {
    it('should emit events for successful chat', async () => {
      const mockResponse = {
        success: true,
        response: 'Hello!',
        sessionId: 'session-123',
      };

      mockService.chat.mockResolvedValueOnce(mockResponse);

      await request(app)
        .post('/api/chat/message')
        .set('X-API-Key', 'test-key')
        .send({
          message: 'Hello',
          sessionId: 'session-123',
        })
        .expect(200);

      expect(mockIO.to).toHaveBeenCalledWith('session-123');
      expect(mockIO.emit).toHaveBeenCalledWith('chat:response', {
        sessionId: 'session-123',
        response: 'Hello!',
      });
    });

    it('should emit stream events', async () => {
      const mockStream = async function* () {
        yield { type: 'text', content: 'Hi' };
        yield { type: 'done' };
      };

      mockService.streamChat.mockReturnValueOnce(mockStream());

      await request(app)
        .post('/api/chat/stream')
        .set('X-API-Key', 'test-key')
        .send({
          message: 'Hello',
          sessionId: 'session-123',
        })
        .expect(200);

      expect(mockIO.to).toHaveBeenCalledWith('session-123');
      expect(mockIO.emit).toHaveBeenCalledWith('chat:stream', 
        expect.objectContaining({ type: 'text' })
      );
    });
  });
});