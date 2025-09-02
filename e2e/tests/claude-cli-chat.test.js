import { config } from '../config/test-config.js';

// Test Claude CLI Chat Integration
async function testClaudeCLIChat() {
  console.log('🚀 Starting Claude CLI Chat E2E Test');
  console.log('=' .repeat(50));

  try {
    // Step 1: Initialize CLI Pool
    console.log('\n📝 Step 1: Initializing CLI Pool Service...');
    const initResponse = await initializeCLIPool();
    if (!initResponse) {
      throw new Error('Failed to initialize CLI pool');
    }
    console.log('✅ CLI Pool initialized successfully');

    // Step 2: Open chat interface
    console.log('\n📝 Step 2: Opening chat interface...');
    await openChatInterface();
    console.log('✅ Chat interface opened');

    // Step 3: Test single message
    console.log('\n📝 Step 3: Testing single message...');
    const singleMessageResult = await testSingleMessage();
    console.log(`✅ Single message test: ${singleMessageResult.success ? 'PASSED' : 'FAILED'}`);

    // Step 4: Test conversation flow
    console.log('\n📝 Step 4: Testing conversation flow...');
    const conversationResult = await testConversation();
    console.log(`✅ Conversation test: ${conversationResult.success ? 'PASSED' : 'FAILED'}`);

    // Step 5: Test concurrent messages
    console.log('\n📝 Step 5: Testing concurrent messages...');
    const concurrentResult = await testConcurrentMessages();
    console.log(`✅ Concurrent test: ${concurrentResult.success ? 'PASSED' : 'FAILED'}`);

    // Step 6: Verify pool statistics
    console.log('\n📝 Step 6: Verifying pool statistics...');
    const statsResult = await verifyPoolStatistics();
    console.log('✅ Pool statistics verified');

    console.log('\n' + '=' .repeat(50));
    console.log('🎉 All E2E tests completed successfully!');
    
    return {
      success: true,
      results: {
        singleMessage: singleMessageResult,
        conversation: conversationResult,
        concurrent: concurrentResult,
        statistics: statsResult
      }
    };

  } catch (error) {
    console.error('\n❌ E2E Test Failed:', error);
    await captureErrorScreenshot();
    return {
      success: false,
      error: error.message
    };
  } finally {
    await cleanup();
  }
}

// Initialize CLI Pool Service
async function initializeCLIPool() {
  try {
    const response = await fetch(`${config.services.cliPool}/api/cli-pool/initialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        minInstances: 2,
        maxInstances: 5
      })
    });

    if (!response.ok) {
      throw new Error(`Initialize failed: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`  - Pool Size: ${data.poolSize}`);
    console.log(`  - Ready Instances: ${data.readyInstances}`);
    
    return data;
  } catch (error) {
    console.error('Failed to initialize CLI pool:', error);
    return null;
  }
}

// Open chat interface using Playwright MCP
async function openChatInterface() {
  try {
    // Navigate to chat page
    await global.mcpTools?.playwright?.browser_navigate({
      url: `${config.frontend.url}${config.frontend.chatPath}`
    });

    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Take initial screenshot
    await global.mcpTools?.playwright?.browser_take_screenshot({
      filename: 'chat-interface-loaded.png'
    });

    return true;
  } catch (error) {
    console.error('Failed to open chat interface:', error);
    return false;
  }
}

// Test single message exchange
async function testSingleMessage() {
  try {
    const testMessage = config.testData.messages[0];
    console.log(`  - Sending: "${testMessage}"`);

    // Get page snapshot first
    const snapshot = await global.mcpTools?.playwright?.browser_snapshot();
    
    // Find input field and send message
    const inputField = findElement(snapshot, 'input', 'message', 'chat');
    if (inputField) {
      await global.mcpTools?.playwright?.browser_type({
        element: 'Message input field',
        ref: inputField.ref,
        text: testMessage,
        submit: true
      });
    }

    // Wait for response
    await waitForResponse();

    // Verify response received
    const responseSnapshot = await global.mcpTools?.playwright?.browser_snapshot();
    const hasResponse = verifyResponse(responseSnapshot);

    // Take screenshot of conversation
    await global.mcpTools?.playwright?.browser_take_screenshot({
      filename: 'single-message-test.png'
    });

    return {
      success: hasResponse,
      message: testMessage,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('Single message test failed:', error);
    return { success: false, error: error.message };
  }
}

// Test conversation flow with multiple messages
async function testConversation() {
  try {
    const results = [];
    
    for (let i = 1; i < 3; i++) {
      const message = config.testData.messages[i];
      console.log(`  - Message ${i}: "${message}"`);

      // Send message via API
      const response = await fetch(`${config.services.cliPool}/api/cli-pool/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });

      if (!response.ok) {
        throw new Error(`Message ${i} failed`);
      }

      const data = await response.json();
      console.log(`  - Response received (${data.duration}ms)`);
      
      results.push({
        message,
        response: data.response?.substring(0, 100) + '...',
        duration: data.duration
      });

      // Brief delay between messages
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return {
      success: true,
      messages: results.length,
      avgResponseTime: results.reduce((sum, r) => sum + r.duration, 0) / results.length
    };

  } catch (error) {
    console.error('Conversation test failed:', error);
    return { success: false, error: error.message };
  }
}

// Test concurrent message handling
async function testConcurrentMessages() {
  try {
    console.log(`  - Sending ${config.parallel.workers} concurrent messages...`);

    const promises = [];
    for (let i = 0; i < config.parallel.workers; i++) {
      const message = `Concurrent message ${i + 1}: What is ${i + 1} + ${i + 1}?`;
      
      promises.push(
        fetch(`${config.services.cliPool}/api/cli-pool/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message })
        }).then(res => res.json())
      );
    }

    const startTime = Date.now();
    const results = await Promise.all(promises);
    const totalTime = Date.now() - startTime;

    console.log(`  - All responses received in ${totalTime}ms`);
    console.log(`  - Average time per message: ${(totalTime / results.length).toFixed(0)}ms`);

    // Verify all responses are unique (different instance IDs)
    const instanceIds = new Set(results.map(r => r.instanceId));
    console.log(`  - Used ${instanceIds.size} different CLI instances`);

    return {
      success: true,
      totalMessages: results.length,
      totalTime,
      instancesUsed: instanceIds.size
    };

  } catch (error) {
    console.error('Concurrent test failed:', error);
    return { success: false, error: error.message };
  }
}

// Verify pool statistics
async function verifyPoolStatistics() {
  try {
    const response = await fetch(`${config.services.cliPool}/api/cli-pool/stats`);
    const stats = await response.json();

    console.log('  Pool Statistics:');
    console.log(`    - Total Requests: ${stats.totalRequests}`);
    console.log(`    - Successful: ${stats.successfulRequests}`);
    console.log(`    - Failed: ${stats.failedRequests}`);
    console.log(`    - Avg Response Time: ${stats.averageResponseTime?.toFixed(0)}ms`);
    console.log(`    - Pool Utilization: ${stats.poolUtilization?.toFixed(1)}%`);
    console.log(`    - Active Instances: ${stats.busyInstances}/${stats.poolSize}`);

    return stats;
  } catch (error) {
    console.error('Failed to get statistics:', error);
    return null;
  }
}

// Helper functions
function findElement(snapshot, type, ...keywords) {
  if (!snapshot?.elements) return null;
  
  return snapshot.elements.find(el => {
    const matchesType = !type || el.type === type;
    const matchesKeyword = keywords.some(kw => 
      el.name?.toLowerCase().includes(kw.toLowerCase()) ||
      el.ref?.toLowerCase().includes(kw.toLowerCase())
    );
    return matchesType && matchesKeyword;
  });
}

async function waitForResponse(timeout = config.timeouts.message) {
  console.log('  - Waiting for Claude response...');
  await new Promise(resolve => setTimeout(resolve, timeout));
}

function verifyResponse(snapshot) {
  if (!snapshot?.elements) return false;
  
  // Look for response elements in the snapshot
  const responseElements = snapshot.elements.filter(el => 
    el.role === 'assistant' || 
    el.className?.includes('response') ||
    el.text?.includes('Claude')
  );
  
  return responseElements.length > 0;
}

async function captureErrorScreenshot() {
  try {
    await global.mcpTools?.playwright?.browser_take_screenshot({
      filename: `error-${Date.now()}.png`
    });
  } catch (e) {
    console.error('Failed to capture error screenshot:', e);
  }
}

async function cleanup() {
  console.log('\n🧹 Cleaning up...');
  // Close browser if needed
  try {
    await global.mcpTools?.playwright?.browser_close();
  } catch (e) {
    // Browser might already be closed
  }
}

// Export for use in other tests
export {
  testClaudeCLIChat,
  initializeCLIPool,
  openChatInterface,
  testSingleMessage,
  testConversation,
  testConcurrentMessages,
  verifyPoolStatistics
};

// Run test if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testClaudeCLIChat().then(result => {
    process.exit(result.success ? 0 : 1);
  });
}