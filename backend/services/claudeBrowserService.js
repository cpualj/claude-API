import EventEmitter from 'events';
import browserPoolService from './browserPoolService.js';
import playwrightMcpService from './playwrightMcpService.js';

class ClaudeBrowserService extends EventEmitter {
  constructor() {
    super();
    this.initialized = false;
    this.mode = 'browser'; // 'browser' or 'cli'
    this.stats = {
      totalMessages: 0,
      successfulMessages: 0,
      failedMessages: 0,
      averageResponseTime: 0
    };
  }

  async initialize(options = {}) {
    if (this.initialized) return;

    console.log('Initializing Claude Browser Service...');
    
    try {
      // Initialize Playwright MCP service
      await playwrightMcpService.initialize();
      
      // Initialize browser pool
      const poolOptions = {
        minInstances: options.minInstances || 2,
        maxInstances: options.maxInstances || 5,
        maxMessagesPerInstance: options.maxMessagesPerInstance || 50,
        maxInstanceAge: options.maxInstanceAge || 3600000,
        warmupOnStart: options.warmupOnStart !== false,
        ...options
      };
      
      await browserPoolService.initialize(poolOptions);
      
      // Set up event listeners
      this.setupEventListeners();
      
      this.initialized = true;
      this.emit('initialized', {
        mode: this.mode,
        poolStats: browserPoolService.getStats()
      });
      
      console.log('Claude Browser Service initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Claude Browser Service:', error);
      throw error;
    }
  }

  setupEventListeners() {
    // Listen to browser pool events
    browserPoolService.on('instanceCreated', async (data) => {
      console.log(`Browser instance created: ${data.id}`);
      try {
        await playwrightMcpService.createBrowser(data.id);
      } catch (error) {
        console.error(`Failed to create Playwright browser for ${data.id}:`, error);
      }
    });

    browserPoolService.on('instanceRecycled', async (data) => {
      console.log(`Browser instance recycled: ${data.id}`);
      try {
        await playwrightMcpService.closeBrowser(data.id);
      } catch (error) {
        console.error(`Failed to close Playwright browser for ${data.id}:`, error);
      }
    });

    // Listen to Playwright MCP events
    playwrightMcpService.on('messageSent', (data) => {
      this.emit('messageSent', data);
    });

    playwrightMcpService.on('browserClosed', (data) => {
      this.emit('browserClosed', data);
    });
  }

  async sendMessage(message, options = {}) {
    if (!this.initialized) {
      await this.initialize();
    }

    this.stats.totalMessages++;
    const startTime = Date.now();
    
    try {
      console.log(`Processing message: ${message.substring(0, 50)}...`);
      
      // Get browser instance from pool
      const instance = await browserPoolService.acquireInstance(options);
      
      try {
        // Send message via Playwright MCP
        const messageData = await playwrightMcpService.sendMessage(
          instance.id, 
          message, 
          options
        );
        
        // For actual implementation with Playwright MCP,
        // this will wait for real response from Claude
        let response;
        
        if (options.mockMode) {
          // Mock mode for testing
          response = this.generateMockResponse(message, instance.id);
        } else {
          // Wait for actual response
          response = await playwrightMcpService.waitForResponse(
            instance.id,
            messageData.messageId,
            options.timeout || 30000
          );
        }
        
        // Update stats
        const duration = Date.now() - startTime;
        this.updateStats(true, duration);
        
        // Format response
        const formattedResponse = {
          id: messageData.messageId,
          instanceId: instance.id,
          content: response.content || response,
          role: 'assistant',
          timestamp: new Date(),
          duration,
          usage: {
            inputTokens: this.estimateTokens(message),
            outputTokens: this.estimateTokens(response.content || response),
            totalTokens: this.estimateTokens(message) + this.estimateTokens(response.content || response)
          },
          model: 'claude-3-opus-via-browser',
          sessionId: options.sessionId || 'default'
        };
        
        // Update instance conversation history
        instance.conversationHistory.push({
          role: 'user',
          content: message,
          timestamp: new Date()
        });
        
        instance.conversationHistory.push({
          role: 'assistant',
          content: formattedResponse.content,
          timestamp: new Date()
        });
        
        this.emit('messageCompleted', formattedResponse);
        
        return formattedResponse;
        
      } finally {
        // Always release the instance
        await browserPoolService.releaseInstance(instance.id);
      }
      
    } catch (error) {
      this.updateStats(false, Date.now() - startTime);
      console.error('Failed to send message:', error);
      this.emit('messageError', { error: error.message, message });
      throw error;
    }
  }

  async chat(message, context = [], options = {}) {
    // Build context string if provided
    let fullMessage = message;
    
    if (context && context.length > 0) {
      const contextString = context.map(msg => {
        return `${msg.role === 'user' ? 'Human' : 'Assistant'}: ${msg.content}`;
      }).join('\n\n');
      
      fullMessage = contextString + '\n\nHuman: ' + message;
    }
    
    return await this.sendMessage(fullMessage, {
      ...options,
      isChat: true,
      context
    });
  }

  async streamMessage(message, options = {}) {
    // For streaming, we'll emit events as chunks arrive
    const responsePromise = this.sendMessage(message, {
      ...options,
      stream: true
    });
    
    // Emit stream events
    this.emit('streamStart', { message });
    
    responsePromise.then(response => {
      this.emit('streamEnd', response);
    }).catch(error => {
      this.emit('streamError', error);
    });
    
    return responsePromise;
  }

  generateMockResponse(message, instanceId) {
    // Generate a mock response for testing
    const responses = [
      "I understand your request. Here's my response based on the browser-controlled Claude instance.",
      "Processing your message through the browser automation system.",
      "This response is generated via the Playwright-controlled browser instance.",
      `Browser instance ${instanceId} is handling your request.`
    ];
    
    return responses[Math.floor(Math.random() * responses.length)] + 
           ` Your message was: "${message.substring(0, 50)}..."`;
  }

  updateStats(success, duration) {
    if (success) {
      this.stats.successfulMessages++;
      const total = this.stats.successfulMessages;
      this.stats.averageResponseTime = 
        (this.stats.averageResponseTime * (total - 1) + duration) / total;
    } else {
      this.stats.failedMessages++;
    }
  }

  estimateTokens(text) {
    // Rough estimate: ~4 characters per token
    if (!text) return 0;
    return Math.ceil(text.length / 4);
  }

  async getPoolStats() {
    return {
      service: 'Claude Browser Service',
      initialized: this.initialized,
      mode: this.mode,
      messageStats: this.stats,
      poolStats: browserPoolService.getStats(),
      browserStats: playwrightMcpService.getAllBrowserStats()
    };
  }

  async healthCheck() {
    if (!this.initialized) {
      return {
        healthy: false,
        reason: 'Service not initialized'
      };
    }
    
    try {
      const poolStats = browserPoolService.getStats();
      const browserStats = playwrightMcpService.getAllBrowserStats();
      
      const healthy = poolStats.healthyInstances > 0;
      
      return {
        healthy,
        details: {
          poolSize: poolStats.poolSize,
          healthyInstances: poolStats.healthyInstances,
          busyInstances: poolStats.busyInstances,
          totalBrowsers: browserStats.length,
          readyBrowsers: browserStats.filter(b => b.isReady).length
        }
      };
    } catch (error) {
      return {
        healthy: false,
        reason: error.message
      };
    }
  }

  async recycleInstance(instanceId) {
    console.log(`Recycling browser instance: ${instanceId}`);
    
    try {
      await playwrightMcpService.closeBrowser(instanceId);
      await browserPoolService.recycleInstance(instanceId);
      return true;
    } catch (error) {
      console.error(`Failed to recycle instance ${instanceId}:`, error);
      throw error;
    }
  }

  async shutdown() {
    console.log('Shutting down Claude Browser Service...');
    
    try {
      // Shutdown all components
      await browserPoolService.shutdown();
      await playwrightMcpService.shutdown();
      
      this.initialized = false;
      this.emit('shutdown');
      
      console.log('Claude Browser Service shut down successfully');
    } catch (error) {
      console.error('Error during shutdown:', error);
      throw error;
    }
  }

  // Test helper methods
  async simulateResponse(instanceId, messageId, content) {
    // This method helps with testing by simulating a response
    playwrightMcpService.simulateResponse(messageId, content);
  }

  async testBrowserCreation() {
    // Test method to verify browser creation
    const testId = `test-browser-${Date.now()}`;
    
    try {
      const browser = await playwrightMcpService.createBrowser(testId);
      const health = await playwrightMcpService.checkBrowserHealth(testId);
      await playwrightMcpService.closeBrowser(testId);
      
      return {
        success: true,
        browser,
        health
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Create singleton instance
const claudeBrowserService = new ClaudeBrowserService();

export default claudeBrowserService;