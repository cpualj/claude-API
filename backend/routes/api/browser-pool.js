import express from 'express';
import claudeBrowserService from '../../services/claudeBrowserService.js';

const router = express.Router();

// Initialize browser pool
router.post('/initialize', async (req, res) => {
  try {
    const options = req.body || {};
    await claudeBrowserService.initialize(options);
    const stats = await claudeBrowserService.getPoolStats();
    
    res.json({
      success: true,
      message: 'Browser pool initialized successfully',
      stats
    });
  } catch (error) {
    console.error('Failed to initialize browser pool:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Send message via browser pool
router.post('/chat', async (req, res) => {
  try {
    const { message, context, sessionId, stream, mockMode } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    // Handle streaming response
    if (stream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      claudeBrowserService.on('streamStart', (data) => {
        res.write(`data: ${JSON.stringify({ type: 'start', data })}\n\n`);
      });

      claudeBrowserService.on('streamEnd', (data) => {
        res.write(`data: ${JSON.stringify({ type: 'end', data })}\n\n`);
        res.end();
      });

      claudeBrowserService.on('streamError', (error) => {
        res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
        res.end();
      });

      await claudeBrowserService.streamMessage(message, {
        sessionId,
        mockMode,
        context
      });
    } else {
      // Regular response
      const response = await claudeBrowserService.chat(message, context, {
        sessionId,
        mockMode
      });

      res.json({
        success: true,
        response
      });
    }
  } catch (error) {
    console.error('Chat error:', error);
    
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
});

// Get pool statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = await claudeBrowserService.getPoolStats();
    
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Failed to get pool stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check
router.get('/health', async (req, res) => {
  try {
    const health = await claudeBrowserService.healthCheck();
    
    res.json({
      success: true,
      health
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Recycle a specific browser instance
router.post('/recycle/:instanceId', async (req, res) => {
  try {
    const { instanceId } = req.params;
    
    await claudeBrowserService.recycleInstance(instanceId);
    
    res.json({
      success: true,
      message: `Instance ${instanceId} recycled successfully`
    });
  } catch (error) {
    console.error(`Failed to recycle instance ${req.params.instanceId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Shutdown browser pool
router.post('/shutdown', async (req, res) => {
  try {
    await claudeBrowserService.shutdown();
    
    res.json({
      success: true,
      message: 'Browser pool shut down successfully'
    });
  } catch (error) {
    console.error('Failed to shutdown browser pool:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test browser creation (for debugging)
router.post('/test-browser', async (req, res) => {
  try {
    const result = await claudeBrowserService.testBrowserCreation();
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Test browser creation failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;