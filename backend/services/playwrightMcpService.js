import EventEmitter from 'events';

class PlaywrightMcpService extends EventEmitter {
  constructor() {
    super();
    this.browsers = new Map();
    this.claudeUrl = 'https://claude.ai/new';
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;
    
    console.log('Initializing Playwright MCP Service...');
    this.initialized = true;
    this.emit('initialized');
  }

  async createBrowser(browserId, options = {}) {
    try {
      console.log(`Creating browser instance: ${browserId}`);
      
      // Store browser metadata
      const browserData = {
        id: browserId,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        messageCount: 0,
        isReady: false,
        currentUrl: null,
        conversationId: null,
        options
      };
      
      this.browsers.set(browserId, browserData);
      
      // Navigate to Claude and prepare for interaction
      await this.navigateToClaude(browserId);
      
      return browserData;
    } catch (error) {
      console.error(`Failed to create browser ${browserId}:`, error);
      this.browsers.delete(browserId);
      throw error;
    }
  }

  async navigateToClaude(browserId) {
    const browser = this.browsers.get(browserId);
    if (!browser) {
      throw new Error(`Browser ${browserId} not found`);
    }

    try {
      // This will be called from the test using Playwright MCP
      // We'll store the state and let the test handle actual navigation
      browser.currentUrl = this.claudeUrl;
      browser.lastActivity = Date.now();
      
      console.log(`Browser ${browserId} ready to navigate to Claude`);
      
      // Mark browser as ready for use
      browser.isReady = true;
      
      return browser;
    } catch (error) {
      console.error(`Failed to navigate browser ${browserId} to Claude:`, error);
      browser.isReady = false;
      throw error;
    }
  }

  async sendMessage(browserId, message, options = {}) {
    const browser = this.browsers.get(browserId);
    if (!browser) {
      throw new Error(`Browser ${browserId} not found`);
    }

    if (!browser.isReady) {
      throw new Error(`Browser ${browserId} is not ready`);
    }

    const startTime = Date.now();
    
    try {
      console.log(`Sending message via browser ${browserId}: ${message.substring(0, 50)}...`);
      
      // Update browser state
      browser.lastActivity = Date.now();
      browser.messageCount++;
      
      // This will be handled by the actual Playwright MCP test
      // We'll return a structured response that the test can fill in
      const response = {
        browserId,
        messageId: `msg-${Date.now()}-${browserId}`,
        request: {
          message,
          timestamp: new Date(),
          options
        },
        response: {
          content: null, // Will be filled by Playwright MCP
          timestamp: null,
          duration: null
        },
        status: 'pending'
      };
      
      this.emit('messageSent', response);
      
      return response;
    } catch (error) {
      console.error(`Failed to send message via browser ${browserId}:`, error);
      throw error;
    }
  }

  async waitForResponse(browserId, messageId, timeout = 30000) {
    const browser = this.browsers.get(browserId);
    if (!browser) {
      throw new Error(`Browser ${browserId} not found`);
    }

    console.log(`Waiting for response from browser ${browserId}, message ${messageId}`);
    
    // This is a placeholder - actual implementation will be done via Playwright MCP
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for response from browser ${browserId}`));
      }, timeout);

      // In real implementation, we'd listen for the response event
      this.once(`response-${messageId}`, (response) => {
        clearTimeout(timer);
        browser.lastActivity = Date.now();
        resolve(response);
      });
    });
  }

  async checkBrowserHealth(browserId) {
    const browser = this.browsers.get(browserId);
    if (!browser) {
      return { healthy: false, reason: 'Browser not found' };
    }

    try {
      // Check if browser has been inactive for too long
      const inactiveTime = Date.now() - browser.lastActivity;
      if (inactiveTime > 600000) { // 10 minutes
        return { healthy: false, reason: 'Browser inactive for too long' };
      }

      // Check if browser has processed too many messages
      if (browser.messageCount > 100) {
        return { healthy: false, reason: 'Browser has processed too many messages' };
      }

      // This will be verified via actual Playwright MCP
      return { healthy: true, browser };
    } catch (error) {
      return { healthy: false, reason: error.message };
    }
  }

  async closeBrowser(browserId) {
    const browser = this.browsers.get(browserId);
    if (!browser) {
      console.warn(`Browser ${browserId} not found`);
      return;
    }

    try {
      console.log(`Closing browser ${browserId}`);
      
      // Clean up browser data
      this.browsers.delete(browserId);
      
      // Emit event for cleanup
      this.emit('browserClosed', { browserId });
      
      return true;
    } catch (error) {
      console.error(`Failed to close browser ${browserId}:`, error);
      throw error;
    }
  }

  async extractResponse(browserId) {
    const browser = this.browsers.get(browserId);
    if (!browser) {
      throw new Error(`Browser ${browserId} not found`);
    }

    // This will be implemented via Playwright MCP
    // Returns the extracted response from Claude
    return {
      browserId,
      content: null, // Will be extracted via Playwright MCP
      timestamp: new Date()
    };
  }

  getBrowserStats(browserId) {
    const browser = this.browsers.get(browserId);
    if (!browser) {
      return null;
    }

    return {
      id: browser.id,
      createdAt: browser.createdAt,
      lastActivity: browser.lastActivity,
      messageCount: browser.messageCount,
      isReady: browser.isReady,
      currentUrl: browser.currentUrl,
      uptime: Date.now() - browser.createdAt,
      idleTime: Date.now() - browser.lastActivity
    };
  }

  getAllBrowserStats() {
    const stats = [];
    for (const [id, browser] of this.browsers) {
      stats.push(this.getBrowserStats(id));
    }
    return stats;
  }

  async recycleAllBrowsers() {
    console.log('Recycling all browsers...');
    const closePromises = [];
    
    for (const [id] of this.browsers) {
      closePromises.push(this.closeBrowser(id));
    }
    
    await Promise.all(closePromises);
    console.log('All browsers recycled');
  }

  // Helper method to simulate a response (for testing)
  simulateResponse(messageId, content) {
    this.emit(`response-${messageId}`, {
      content,
      timestamp: new Date(),
      duration: Math.random() * 2000 + 1000 // Random duration 1-3 seconds
    });
  }

  async shutdown() {
    console.log('Shutting down Playwright MCP Service...');
    await this.recycleAllBrowsers();
    this.initialized = false;
    this.emit('shutdown');
  }
}

// Create singleton instance
const playwrightMcpService = new PlaywrightMcpService();

export default playwrightMcpService;