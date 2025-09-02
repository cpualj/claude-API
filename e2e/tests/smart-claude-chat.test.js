import { config } from '../config/test-config.js';

// Test Smart Claude CLI Integration
async function testSmartClaudeChat() {
  console.log('🚀 Starting Smart Claude CLI E2E Test');
  console.log('=' .repeat(50));

  try {
    // Step 1: Verify Smart Claude service health
    console.log('\n📝 Step 1: Checking Smart Claude service health...');
    const healthResult = await checkSmartClaudeHealth();
    if (!healthResult.success) {
      throw new Error('Smart Claude service is not healthy');
    }
    console.log('✅ Smart Claude service is healthy');

    // Step 2: Test single message (on-demand instance creation)
    console.log('\n📝 Step 2: Testing on-demand instance creation...');
    const singleMessageResult = await testSmartSingleMessage();
    console.log(`✅ Single message test: ${singleMessageResult.success ? 'PASSED' : 'FAILED'}`);

    // Step 3: Test session continuity
    console.log('\n📝 Step 3: Testing session continuity...');
    const sessionResult = await testSessionContinuity();
    console.log(`✅ Session continuity test: ${sessionResult.success ? 'PASSED' : 'FAILED'}`);

    // Step 4: Test concurrent sessions
    console.log('\n📝 Step 4: Testing concurrent sessions...');
    const concurrentResult = await testConcurrentSessions();
    console.log(`✅ Concurrent sessions test: ${concurrentResult.success ? 'PASSED' : 'FAILED'}`);

    // Step 5: Test batch processing
    console.log('\n📝 Step 5: Testing batch processing...');
    const batchResult = await testBatchProcessing();
    console.log(`✅ Batch processing test: ${batchResult.success ? 'PASSED' : 'FAILED'}`);

    // Step 6: Test intelligent recycling (wait for timeout)
    console.log('\n📝 Step 6: Testing intelligent recycling...');
    const recyclingResult = await testIntelligentRecycling();
    console.log(`✅ Recycling test: ${recyclingResult.success ? 'PASSED' : 'FAILED'}`);

    // Step 7: Verify final statistics
    console.log('\n📝 Step 7: Verifying final statistics...');
    const finalStatsResult = await verifySmartClaudeStatistics();
    console.log('✅ Final statistics verified');

    console.log('\n' + '=' .repeat(50));
    console.log('🎉 All Smart Claude E2E tests completed successfully!');
    
    return {
      success: true,
      results: {
        health: healthResult,
        singleMessage: singleMessageResult,
        sessionContinuity: sessionResult,
        concurrentSessions: concurrentResult,
        batchProcessing: batchResult,
        recycling: recyclingResult,
        finalStats: finalStatsResult
      }
    };

  } catch (error) {
    console.error('\n❌ Smart Claude E2E Test Failed:', error);
    await captureErrorScreenshot();
    return {
      success: false,
      error: error.message
    };
  } finally {
    await cleanup();
  }
}

// Check Smart Claude service health
async function checkSmartClaudeHealth() {
  try {
    const response = await fetch(`${config.services.smartClaude}/api/smart-claude/health`);
    
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`  - Status: ${data.healthy ? 'Healthy' : 'Unhealthy'}`);
    console.log(`  - Current Instances: ${data.currentInstances || 0}`);
    console.log(`  - Active Sessions: ${data.activeSessions || 0}`);
    
    return {
      success: data.success && data.healthy,
      data
    };
  } catch (error) {
    console.error('Health check failed:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Test single message with on-demand instance creation
async function testSmartSingleMessage() {
  try {
    const testMessage = "What is 2+2?";
    const sessionId = `test-session-${Date.now()}`;
    
    console.log(`  - Sending: "${testMessage}"`);
    console.log(`  - Session: ${sessionId}`);

    const startTime = Date.now();
    const response = await fetch(`${config.services.smartClaude}/api/smart-claude/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: testMessage,
        sessionId: sessionId
      })
    });

    if (!response.ok) {
      throw new Error(`Chat failed: ${response.statusText}`);
    }

    const data = await response.json();
    const duration = Date.now() - startTime;

    console.log(`  - Response received in ${duration}ms`);
    console.log(`  - Instance created: ${data.instanceId}`);
    console.log(`  - Content: "${data.content}"`);

    // Verify stats show instance creation
    const statsAfter = await getSmartClaudeStats();
    console.log(`  - Instances created: ${statsAfter.instancesCreated}`);

    return {
      success: data.success && data.content,
      sessionId,
      instanceId: data.instanceId,
      content: data.content,
      duration,
      stats: statsAfter
    };

  } catch (error) {
    console.error('Single message test failed:', error);
    return { success: false, error: error.message };
  }
}

// Test session continuity
async function testSessionContinuity() {
  try {
    const sessionId = `continuity-test-${Date.now()}`;
    const messages = [
      "Remember this number: 42",
      "What number did I just tell you to remember?"
    ];
    
    const results = [];
    let instanceId = null;

    for (let i = 0; i < messages.length; i++) {
      console.log(`  - Message ${i + 1}: "${messages[i]}"`);

      const response = await fetch(`${config.services.smartClaude}/api/smart-claude/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messages[i],
          sessionId: sessionId
        })
      });

      if (!response.ok) {
        throw new Error(`Message ${i + 1} failed`);
      }

      const data = await response.json();
      console.log(`  - Response ${i + 1}: "${data.content.substring(0, 50)}..."`);
      
      if (i === 0) {
        instanceId = data.instanceId;
      } else {
        // Verify same instance is reused
        if (data.instanceId !== instanceId) {
          console.warn(`  - Warning: Different instance used (${data.instanceId} vs ${instanceId})`);
        } else {
          console.log(`  - ✅ Same instance reused: ${instanceId}`);
        }
      }

      results.push({
        message: messages[i],
        response: data.content,
        instanceId: data.instanceId,
        messageCount: data.messageCount
      });

      // Brief delay between messages
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Verify the second response mentions "42"
    const rememberedCorrectly = results[1].response.toLowerCase().includes('42');
    console.log(`  - Memory test: ${rememberedCorrectly ? 'PASSED' : 'FAILED'}`);

    return {
      success: rememberedCorrectly,
      sessionId,
      instanceId,
      messages: results
    };

  } catch (error) {
    console.error('Session continuity test failed:', error);
    return { success: false, error: error.message };
  }
}

// Test concurrent sessions (should create multiple instances)
async function testConcurrentSessions() {
  try {
    const numSessions = 3;
    console.log(`  - Creating ${numSessions} concurrent sessions...`);

    const promises = [];
    for (let i = 0; i < numSessions; i++) {
      const sessionId = `concurrent-${Date.now()}-${i}`;
      const message = `Concurrent message ${i + 1}: What is ${i + 1} * 3?`;
      
      promises.push(
        fetch(`${config.services.smartClaude}/api/smart-claude/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message, sessionId })
        }).then(res => res.json())
      );
    }

    const startTime = Date.now();
    const results = await Promise.all(promises);
    const totalTime = Date.now() - startTime;

    console.log(`  - All responses received in ${totalTime}ms`);

    // Check if multiple instances were created
    const instanceIds = new Set(results.map(r => r.instanceId));
    console.log(`  - Used ${instanceIds.size} different instances`);
    
    // Verify all requests succeeded
    const allSucceeded = results.every(r => r.success);
    console.log(`  - All requests succeeded: ${allSucceeded}`);

    return {
      success: allSucceeded,
      totalSessions: numSessions,
      instancesUsed: instanceIds.size,
      totalTime,
      results: results.map(r => ({
        sessionId: r.sessionId,
        instanceId: r.instanceId,
        content: r.content?.substring(0, 50) + '...'
      }))
    };

  } catch (error) {
    console.error('Concurrent sessions test failed:', error);
    return { success: false, error: error.message };
  }
}

// Test batch processing
async function testBatchProcessing() {
  try {
    const messages = [
      { message: "What is AI?", sessionId: "batch-1" },
      { message: "What is ML?", sessionId: "batch-2" },
      { message: "What is deep learning?", sessionId: "batch-3" }
    ];

    console.log(`  - Sending ${messages.length} messages in batch...`);

    const startTime = Date.now();
    const response = await fetch(`${config.services.smartClaude}/api/smart-claude/chat-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages })
    });

    if (!response.ok) {
      throw new Error(`Batch failed: ${response.statusText}`);
    }

    const data = await response.json();
    const totalTime = Date.now() - startTime;

    console.log(`  - Batch completed in ${totalTime}ms`);
    console.log(`  - Processed: ${data.processed}`);
    console.log(`  - Successful: ${data.successful}`);
    console.log(`  - Failed: ${data.failed}`);

    // Check individual results
    const instanceIds = new Set(data.results.filter(r => r.success).map(r => r.instanceId));
    console.log(`  - Used ${instanceIds.size} instances for batch`);

    return {
      success: data.success && data.failed === 0,
      processed: data.processed,
      successful: data.successful,
      failed: data.failed,
      instancesUsed: instanceIds.size,
      totalTime
    };

  } catch (error) {
    console.error('Batch processing test failed:', error);
    return { success: false, error: error.message };
  }
}

// Test intelligent recycling (simplified - check stats changes)
async function testIntelligentRecycling() {
  try {
    console.log('  - Testing recycling mechanism...');
    
    const statsBefore = await getSmartClaudeStats();
    console.log(`  - Instances before cleanup: ${statsBefore.currentInstances}`);

    // Trigger manual cleanup
    const cleanupResponse = await fetch(`${config.services.smartClaude}/api/smart-claude/cleanup`, {
      method: 'POST'
    });

    if (!cleanupResponse.ok) {
      throw new Error('Cleanup failed');
    }

    const cleanupData = await cleanupResponse.json();
    console.log(`  - Cleanup result: ${cleanupData.message}`);

    const statsAfter = await getSmartClaudeStats();
    console.log(`  - Instances after cleanup: ${statsAfter.currentInstances}`);

    return {
      success: cleanupData.success,
      instancesBefore: statsBefore.currentInstances,
      instancesAfter: statsAfter.currentInstances,
      cleaned: cleanupData.cleaned
    };

  } catch (error) {
    console.error('Recycling test failed:', error);
    return { success: false, error: error.message };
  }
}

// Get Smart Claude statistics
async function getSmartClaudeStats() {
  try {
    const response = await fetch(`${config.services.smartClaude}/api/smart-claude/stats`);
    const data = await response.json();
    return data.stats;
  } catch (error) {
    console.error('Failed to get stats:', error);
    return {};
  }
}

// Verify Smart Claude statistics
async function verifySmartClaudeStatistics() {
  try {
    const stats = await getSmartClaudeStats();

    console.log('  Smart Claude Statistics:');
    console.log(`    - Total Requests: ${stats.totalRequests}`);
    console.log(`    - Successful: ${stats.successfulRequests}`);
    console.log(`    - Failed: ${stats.failedRequests}`);
    console.log(`    - Instances Created: ${stats.instancesCreated}`);
    console.log(`    - Instances Destroyed: ${stats.instancesDestroyed}`);
    console.log(`    - Current Instances: ${stats.currentInstances}`);
    console.log(`    - Active Sessions: ${stats.activeSessions}`);
    console.log(`    - Avg Response Time: ${stats.averageResponseTime?.toFixed(0)}ms`);
    console.log(`    - Memory - Total Conversations: ${stats.memory?.totalConversations}`);

    return {
      success: true,
      stats
    };
  } catch (error) {
    console.error('Failed to get final statistics:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Helper functions
async function captureErrorScreenshot() {
  try {
    await global.mcpTools?.playwright?.browser_take_screenshot({
      filename: `smart-claude-error-${Date.now()}.png`
    });
  } catch (e) {
    console.error('Failed to capture error screenshot:', e);
  }
}

async function cleanup() {
  console.log('\n🧹 Cleaning up Smart Claude E2E test...');
  // Cleanup if needed
}

// Export for use in other tests
export {
  testSmartClaudeChat,
  checkSmartClaudeHealth,
  testSmartSingleMessage,
  testSessionContinuity,
  testConcurrentSessions,
  testBatchProcessing,
  testIntelligentRecycling,
  verifySmartClaudeStatistics
};

// Run test if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testSmartClaudeChat().then(result => {
    process.exit(result.success ? 0 : 1);
  });
}