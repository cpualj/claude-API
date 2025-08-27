import express from 'express';
import UniversalChatService from '../../services/universal-chat-service.js';
import { authenticateAPIKey } from '../../middleware/auth.js';
import { rateLimiter } from '../../middleware/rate-limit.js';

const router = express.Router();

// Initialize service - use factory for testing
let chatService;
export const getChatService = () => {
  if (!chatService) {
    chatService = new UniversalChatService();
  }
  return chatService;
};

// For testing - allow resetting the service
export const resetChatService = () => {
  chatService = null;
};

// Send a chat message
router.post('/message', authenticateAPIKey, rateLimiter, async (req, res) => {
  try {
    const { message, toolId, sessionId, context, options } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    const result = await getChatService().chat({
      message,
      toolId,
      sessionId,
      context,
      options,
      userId: req.apiKey.userId,
      apiKeyId: req.apiKey.id
    });

    // Emit to WebSocket if available
    if (req.app.locals.io && sessionId) {
      req.app.locals.io.to(sessionId).emit('chat:response', {
        sessionId,
        response: result.response
      });
    }

    res.json(result);
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      success: false,
      error: 'Chat request failed'
    });
  }
});

// Stream chat responses
router.post('/stream', authenticateAPIKey, rateLimiter, async (req, res) => {
  try {
    const { message, toolId, sessionId, context, options } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = getChatService().streamChat({
      message,
      toolId,
      sessionId,
      context,
      options,
      userId: req.apiKey.userId
    });

    for await (const chunk of stream) {
      // Send SSE event
      res.write(`data: ${JSON.stringify(chunk)}\n\n`);

      // Emit to WebSocket if available
      if (req.app.locals.io && sessionId) {
        req.app.locals.io.to(sessionId).emit('chat:stream', chunk);
      }

      if (chunk.type === 'error') {
        break;
      }
    }

    res.end();
  } catch (error) {
    console.error('Stream error:', error);
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    res.end();
  }
});

// Create a new chat session
router.post('/session', authenticateAPIKey, async (req, res) => {
  try {
    const { toolId, initialContext } = req.body;

    const session = await getChatService().createSession({
      toolId,
      initialContext,
      userId: req.apiKey.userId
    });

    res.status(201).json({
      success: true,
      session
    });
  } catch (error) {
    console.error('Session creation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create session'
    });
  }
});

// Get session details
router.get('/session/:sessionId', authenticateAPIKey, async (req, res) => {
  try {
    const session = await getChatService().getSession(
      req.params.sessionId,
      req.apiKey.userId
    );

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      session
    });
  } catch (error) {
    console.error('Session retrieval error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve session'
    });
  }
});

// End a chat session
router.delete('/session/:sessionId', authenticateAPIKey, async (req, res) => {
  try {
    await getChatService().endSession(
      req.params.sessionId,
      req.apiKey.userId
    );

    res.json({
      success: true,
      message: 'Session ended successfully'
    });
  } catch (error) {
    console.error('Session end error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to end session'
    });
  }
});

// List user sessions
router.get('/sessions', authenticateAPIKey, async (req, res) => {
  try {
    const { toolId, active } = req.query;
    
    const filters = {};
    if (toolId) filters.toolId = toolId;
    if (active !== undefined) filters.active = active === 'true';
    
    const sessions = await getChatService().listSessions(
      req.apiKey.userId,
      Object.keys(filters).length > 0 ? filters : undefined
    );

    res.json({
      success: true,
      sessions
    });
  } catch (error) {
    console.error('Session list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list sessions'
    });
  }
});

// Get available tools
router.get('/tools', authenticateAPIKey, async (req, res) => {
  try {
    const tools = await getChatService().getAvailableTools();

    res.json({
      success: true,
      tools
    });
  } catch (error) {
    console.error('Tools list error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch available tools'
    });
  }
});

// Validate tool configuration
router.post('/tools/validate', authenticateAPIKey, async (req, res) => {
  try {
    const { toolConfig } = req.body;
    
    const validation = await getChatService().validateToolConfig(toolConfig);

    res.json({
      success: true,
      validation
    });
  } catch (error) {
    console.error('Tool validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate tool configuration'
    });
  }
});

export default router;