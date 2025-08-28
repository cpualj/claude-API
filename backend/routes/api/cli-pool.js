import express from 'express';
import claudeCliPoolService from '../../services/claudeCliPoolService.js';

const router = express.Router();

// Initialize CLI pool
router.post('/initialize', async (req, res) => {
  try {
    const options = req.body || {};
    await claudeCliPoolService.initialize(options);
    const stats = claudeCliPoolService.getStats();
    
    res.json({
      success: true,
      message: 'Claude CLI pool initialized successfully',
      stats
    });
  } catch (error) {
    console.error('Failed to initialize CLI pool:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Send message via CLI pool
router.post('/chat', async (req, res) => {
  try {
    const { message, sessionId, stream } = req.body;
    
    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    console.log(`Received chat request for session ${sessionId}: ${message.substring(0, 50)}...`);

    // Handle streaming response
    if (stream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      // For now, stream the complete response
      try {
        const response = await claudeCliPoolService.sendMessage(message, { sessionId });
        
        // Simulate streaming by sending chunks
        const chunks = response.content.match(/.{1,100}/g) || [];
        for (const chunk of chunks) {
          res.write(`data: ${JSON.stringify({ 
            type: 'chunk', 
            content: chunk,
            instanceId: response.instanceId 
          })}\n\n`);
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        res.write(`data: ${JSON.stringify({ 
          type: 'end', 
          instanceId: response.instanceId,
          duration: response.duration
        })}\n\n`);
        res.end();
      } catch (error) {
        res.write(`data: ${JSON.stringify({ 
          type: 'error', 
          error: error.message 
        })}\n\n`);
        res.end();
      }
    } else {
      // Regular response
      const response = await claudeCliPoolService.sendMessage(message, { sessionId });

      res.json({
        success: true,
        response: {
          ...response,
          role: 'assistant',
          sessionId: sessionId || 'default'
        }
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

// Send multiple messages concurrently
router.post('/chat-batch', async (req, res) => {
  try {
    const { messages } = req.body;
    
    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({
        success: false,
        error: 'Messages array is required'
      });
    }

    console.log(`Processing batch of ${messages.length} messages`);
    
    // Send all messages concurrently
    const promises = messages.map((msg, index) => 
      claudeCliPoolService.sendMessage(msg.message || msg, {
        sessionId: msg.sessionId || `batch-${index}`
      }).catch(error => ({
        error: error.message,
        message: msg.message || msg
      }))
    );

    const responses = await Promise.all(promises);
    
    res.json({
      success: true,
      responses,
      stats: {
        total: messages.length,
        successful: responses.filter(r => !r.error).length,
        failed: responses.filter(r => r.error).length
      }
    });
  } catch (error) {
    console.error('Batch chat error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get pool statistics
router.get('/stats', async (req, res) => {
  try {
    const stats = claudeCliPoolService.getStats();
    
    res.json({
      success: true,
      stats,
      health: {
        poolSize: stats.poolSize,
        readyInstances: stats.readyInstances,
        busyInstances: stats.busyInstances,
        utilization: stats.poolUtilization.toFixed(2) + '%'
      }
    });
  } catch (error) {
    console.error('Failed to get pool stats:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get specific instance info
router.get('/instance/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const stats = claudeCliPoolService.getStats();
    const instance = stats.instances.find(i => i.id === id);
    
    if (!instance) {
      return res.status(404).json({
        success: false,
        error: 'Instance not found'
      });
    }
    
    res.json({
      success: true,
      instance
    });
  } catch (error) {
    console.error('Failed to get instance info:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Health check
router.get('/health', async (req, res) => {
  try {
    const stats = claudeCliPoolService.getStats();
    const healthy = stats.readyInstances > 0;
    
    res.json({
      success: true,
      healthy,
      details: {
        poolSize: stats.poolSize,
        readyInstances: stats.readyInstances,
        busyInstances: stats.busyInstances,
        poolUtilization: stats.poolUtilization
      }
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      healthy: false
    });
  }
});

// Force health check
router.post('/health-check', async (req, res) => {
  try {
    await claudeCliPoolService.performHealthCheck();
    const stats = claudeCliPoolService.getStats();
    
    res.json({
      success: true,
      message: 'Health check completed',
      stats
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Shutdown CLI pool
router.post('/shutdown', async (req, res) => {
  try {
    await claudeCliPoolService.shutdown();
    
    res.json({
      success: true,
      message: 'Claude CLI pool shut down successfully'
    });
  } catch (error) {
    console.error('Failed to shutdown CLI pool:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;