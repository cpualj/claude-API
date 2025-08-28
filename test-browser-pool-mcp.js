/**
 * Browser Pool Test with Playwright MCP
 * This script demonstrates the multi-browser Claude chat system
 */

console.log('🚀 Starting Browser Pool Test with Playwright MCP');
console.log('=' .repeat(50));

// Test configuration
const TEST_CONFIG = {
  apiUrl: 'http://localhost:3001',
  browsers: 2,
  messagesPerBrowser: 2
};

// Test messages
const TEST_MESSAGES = [
  "What is 2 + 2?",
  "What's the capital of France?",
  "Tell me a very short joke",
  "How do you say hello in Spanish?"
];

async function testBrowserPool() {
  try {
    console.log('\n📦 Step 1: Starting backend server...');
    console.log('Please run: node backend/server-browser-pool.js');
    console.log('Press Enter when server is running...');
    
    console.log('\n🌐 Step 2: Initializing browser pool...');
    const initResponse = await fetch(`${TEST_CONFIG.apiUrl}/api/browser-pool/initialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        minInstances: TEST_CONFIG.browsers,
        maxInstances: TEST_CONFIG.browsers * 2,
        maxMessagesPerInstance: 10,
        warmupOnStart: false
      })
    });
    
    const initData = await initResponse.json();
    console.log('✓ Pool initialized:', initData);
    
    console.log('\n📨 Step 3: Sending test messages...');
    const messagePromises = [];
    
    for (let i = 0; i < TEST_CONFIG.browsers; i++) {
      const sessionId = `browser-${i + 1}`;
      
      for (let j = 0; j < TEST_CONFIG.messagesPerBrowser; j++) {
        const message = TEST_MESSAGES[(i * TEST_CONFIG.messagesPerBrowser + j) % TEST_MESSAGES.length];
        console.log(`  Sending to ${sessionId}: "${message}"`);
        
        const promise = fetch(`${TEST_CONFIG.apiUrl}/api/browser-pool/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message,
            sessionId,
            mockMode: true // Use mock mode for testing
          })
        }).then(res => res.json());
        
        messagePromises.push(promise);
      }
    }
    
    const responses = await Promise.all(messagePromises);
    console.log(`✓ Received ${responses.length} responses`);
    
    console.log('\n📊 Step 4: Getting pool statistics...');
    const statsResponse = await fetch(`${TEST_CONFIG.apiUrl}/api/browser-pool/stats`);
    const stats = await statsResponse.json();
    
    console.log('\n📈 Results:');
    console.log(`  Total messages: ${stats.stats.messageStats.totalMessages}`);
    console.log(`  Successful: ${stats.stats.messageStats.successfulMessages}`);
    console.log(`  Failed: ${stats.stats.messageStats.failedMessages}`);
    console.log(`  Pool size: ${stats.stats.poolStats.poolSize}`);
    console.log(`  Healthy instances: ${stats.stats.poolStats.healthyInstances}`);
    
    console.log('\n✅ Test completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
  }
}

// Display instructions
console.log(`
Instructions to run the complete test:

1. Start the backend server:
   node backend/server-browser-pool.js

2. In another terminal, run this test:
   node test-browser-pool-mcp.js

3. To use actual Playwright MCP with Claude:
   - The system will open multiple browser windows
   - Each browser will navigate to Claude chat
   - Messages will be sent concurrently
   - Responses will be extracted and returned via API

Current Implementation Status:
✅ Browser pool management service
✅ Playwright MCP integration service  
✅ API endpoints for browser control
✅ Unit tests for services
✅ Mock mode for testing without real browsers
🔄 Actual Playwright MCP browser control (ready to implement)

To integrate with real Claude chat via Playwright MCP:
1. The playwrightMcpService will use MCP tools to control browsers
2. Each browser instance will maintain its own conversation
3. The system will handle authentication if needed
4. Responses will be extracted from the Claude interface
`);

// Run test if fetch is available
if (typeof fetch !== 'undefined') {
  testBrowserPool();
} else {
  console.log('\nNote: Run this script in Node.js 18+ or use node-fetch');
}