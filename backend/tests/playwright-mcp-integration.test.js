/**
 * Playwright MCP Integration Test
 * This test demonstrates using Playwright MCP to control multiple browser instances
 * that interact with Claude chat interface.
 * 
 * Run this test with: node backend/tests/playwright-mcp-integration.test.js
 */

const claudeBrowserService = (await import('../services/claudeBrowserService.js')).default;

// Configuration
const TEST_CONFIG = {
  claudeUrl: 'https://claude.ai/new',
  browsers: 3, // Number of browser instances to create
  messagesPerBrowser: 2,
  delayBetweenMessages: 2000
};

// Test messages to send
const TEST_MESSAGES = [
  "What is 2 + 2?",
  "Tell me a very short joke",
  "What's the capital of France?",
  "How do you say hello in Spanish?",
  "What is the speed of light?",
  "Name a primary color"
];

class PlaywrightMcpIntegrationTest {
  constructor() {
    this.browserInstances = new Map();
    this.results = [];
  }

  async run() {
    console.log('\n🚀 Starting Playwright MCP Integration Test');
    console.log('=' .repeat(50));
    
    try {
      // Step 1: Initialize the browser pool service
      await this.initializeBrowserPool();
      
      // Step 2: Create multiple browser instances
      await this.createBrowserInstances();
      
      // Step 3: Send messages concurrently
      await this.sendConcurrentMessages();
      
      // Step 4: Display results
      this.displayResults();
      
      // Step 5: Cleanup
      await this.cleanup();
      
      console.log('\n✅ Test completed successfully!');
    } catch (error) {
      console.error('\n❌ Test failed:', error.message);
      await this.cleanup();
      process.exit(1);
    }
  }

  async initializeBrowserPool() {
    console.log('\n📦 Initializing browser pool service...');
    
    await claudeBrowserService.initialize({
      minInstances: TEST_CONFIG.browsers,
      maxInstances: TEST_CONFIG.browsers * 2,
      maxMessagesPerInstance: 10,
      warmupOnStart: false
    });
    
    const stats = await claudeBrowserService.getPoolStats();
    console.log(`✓ Pool initialized with ${stats.poolStats.poolSize} instances`);
  }

  async createBrowserInstances() {
    console.log(`\n🌐 Creating ${TEST_CONFIG.browsers} browser instances...`);
    
    for (let i = 0; i < TEST_CONFIG.browsers; i++) {
      const instanceId = `browser-test-${i + 1}`;
      
      // This would normally use Playwright MCP to create actual browser
      // For now, we'll simulate it
      console.log(`  Creating instance: ${instanceId}`);
      
      this.browserInstances.set(instanceId, {
        id: instanceId,
        created: Date.now(),
        messages: []
      });
    }
    
    console.log(`✓ Created ${this.browserInstances.size} browser instances`);
  }

  async sendConcurrentMessages() {
    console.log('\n📨 Sending messages concurrently...');
    
    const messagePromises = [];
    let messageIndex = 0;
    
    // Send messages to each browser
    for (const [instanceId, instance] of this.browserInstances) {
      for (let i = 0; i < TEST_CONFIG.messagesPerBrowser; i++) {
        const message = TEST_MESSAGES[messageIndex % TEST_MESSAGES.length];
        messageIndex++;
        
        const promise = this.sendMessageToBrowser(instanceId, message, i);
        messagePromises.push(promise);
        
        // Add delay between messages
        if (i < TEST_CONFIG.messagesPerBrowser - 1) {
          await this.delay(TEST_CONFIG.delayBetweenMessages);
        }
      }
    }
    
    // Wait for all messages to complete
    const results = await Promise.allSettled(messagePromises);
    
    // Process results
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        this.results.push(result.value);
      } else {
        console.error(`  Message ${index + 1} failed:`, result.reason);
      }
    });
    
    console.log(`✓ Processed ${this.results.length} messages`);
  }

  async sendMessageToBrowser(instanceId, message, messageNum) {
    const startTime = Date.now();
    console.log(`  [${instanceId}] Sending message ${messageNum + 1}: "${message}"`);
    
    try {
      // Use the browser service to send message
      // In production, this would use actual Playwright MCP
      const response = await claudeBrowserService.sendMessage(message, {
        sessionId: instanceId,
        mockMode: true // Using mock mode for testing
      });
      
      const duration = Date.now() - startTime;
      
      const result = {
        instanceId,
        message,
        response: response.content,
        duration,
        timestamp: new Date()
      };
      
      // Store in instance
      const instance = this.browserInstances.get(instanceId);
      if (instance) {
        instance.messages.push(result);
      }
      
      console.log(`    ✓ [${instanceId}] Response received in ${duration}ms`);
      
      return result;
    } catch (error) {
      console.error(`    ✗ [${instanceId}] Error: ${error.message}`);
      throw error;
    }
  }

  displayResults() {
    console.log('\n📊 Test Results');
    console.log('=' .repeat(50));
    
    // Display per-browser statistics
    for (const [instanceId, instance] of this.browserInstances) {
      console.log(`\n🌐 ${instanceId}:`);
      console.log(`  Messages sent: ${instance.messages.length}`);
      
      if (instance.messages.length > 0) {
        const avgDuration = instance.messages.reduce((sum, m) => sum + m.duration, 0) / instance.messages.length;
        console.log(`  Average response time: ${avgDuration.toFixed(2)}ms`);
        
        instance.messages.forEach((msg, index) => {
          console.log(`    ${index + 1}. "${msg.message}" → ${msg.duration}ms`);
        });
      }
    }
    
    // Display overall statistics
    console.log('\n📈 Overall Statistics:');
    const stats = claudeBrowserService.getPoolStats();
    console.log(`  Total messages: ${stats.messageStats.totalMessages}`);
    console.log(`  Successful: ${stats.messageStats.successfulMessages}`);
    console.log(`  Failed: ${stats.messageStats.failedMessages}`);
    console.log(`  Average response time: ${stats.messageStats.averageResponseTime.toFixed(2)}ms`);
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up...');
    
    try {
      await claudeBrowserService.shutdown();
      console.log('✓ Browser pool shut down');
    } catch (error) {
      console.error('Error during cleanup:', error.message);
    }
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Helper function to demonstrate actual Playwright MCP usage
async function demonstratePlaywrightMcp() {
  console.log('\n📝 Playwright MCP Usage Example:');
  console.log('=' .repeat(50));
  console.log(`
  // This is how you would use Playwright MCP in production:
  
  // 1. Navigate to Claude
  await mcp_playwright_browser_navigate({ 
    url: 'https://claude.ai/new' 
  });
  
  // 2. Take a snapshot to see the page structure
  await mcp_playwright_browser_snapshot();
  
  // 3. Type a message
  await mcp_playwright_browser_type({
    element: 'Chat input field',
    ref: '[contenteditable="true"]',
    text: 'Hello Claude!'
  });
  
  // 4. Click send button
  await mcp_playwright_browser_click({
    element: 'Send button',
    ref: 'button[aria-label="Send message"]'
  });
  
  // 5. Wait for response
  await mcp_playwright_browser_wait_for({
    text: 'Assistant',
    time: 5
  });
  
  // 6. Extract the response
  const snapshot = await mcp_playwright_browser_snapshot();
  // Parse snapshot to get Claude's response
  `);
}

// Run the test
async function main() {
  // Show example first
  await demonstratePlaywrightMcp();
  
  // Run actual test
  const test = new PlaywrightMcpIntegrationTest();
  await test.run();
}

// Execute if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export default PlaywrightMcpIntegrationTest;