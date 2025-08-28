/**
 * Direct Claude CLI Pool Test
 * Tests the CLI pool service directly without needing the server
 */

import claudeCliPoolService from './backend/services/claudeCliPoolService.js';

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = '') {
  console.log(`${color}${message}${colors.reset}`);
}

async function testDirectCliPool() {
  log('\n🚀 Direct Claude CLI Pool Test', colors.bright + colors.cyan);
  log('=' .repeat(60), colors.dim);
  log('This test runs multiple Claude CLI instances concurrently', colors.dim);
  log('Each instance maintains its own conversation context', colors.dim);
  log('=' .repeat(60), colors.dim);

  try {
    // Initialize the pool
    log('\n📦 Initializing CLI pool with 3 instances...', colors.cyan);
    await claudeCliPoolService.initialize({
      minInstances: 3,
      maxInstances: 5,
      maxMessagesPerInstance: 50
    });
    
    const stats = claudeCliPoolService.getStats();
    log(`✓ Pool initialized with ${stats.poolSize} CLI instances`, colors.green);

    // Test 1: Send single message
    log('\n📝 Test 1: Sending single message...', colors.cyan);
    const response1 = await claudeCliPoolService.sendMessage(
      "Hello Claude! Please respond with just 'Hello!'"
    );
    log(`✓ Response from ${response1.instanceId}:`, colors.green);
    log(`  "${response1.content}"`, colors.dim);

    // Test 2: Send multiple messages concurrently
    log('\n⚡ Test 2: Sending 5 messages concurrently...', colors.cyan);
    const messages = [
      "What is 2 + 2?",
      "What's the capital of France?",
      "Name a primary color",
      "What year is it?",
      "Say 'Hi' in Spanish"
    ];

    const startTime = Date.now();
    const promises = messages.map((msg, i) => 
      claudeCliPoolService.sendMessage(msg, { sessionId: `test-${i}` })
        .then(response => {
          log(`  ✓ [${response.instanceId}] Q: "${msg}"`, colors.yellow);
          log(`    A: "${response.content.substring(0, 50)}..."`, colors.dim);
          return response;
        })
        .catch(error => {
          log(`  ✗ Error for "${msg}": ${error.message}`, colors.red);
          return null;
        })
    );

    const responses = await Promise.all(promises);
    const duration = Date.now() - startTime;
    
    const successful = responses.filter(r => r !== null).length;
    log(`\n✓ Processed ${successful}/${messages.length} messages in ${duration}ms`, colors.green);
    
    // Display different instances used
    const instancesUsed = new Set(responses.filter(r => r).map(r => r.instanceId));
    log(`  Used ${instancesUsed.size} different CLI instances`, colors.dim);
    instancesUsed.forEach(id => log(`    - ${id}`, colors.dim));

    // Test 3: Show pool statistics
    log('\n📊 Test 3: Pool Statistics', colors.cyan);
    const finalStats = claudeCliPoolService.getStats();
    
    log('Pool Status:', colors.bright);
    log(`  Total requests: ${finalStats.totalRequests}`, colors.dim);
    log(`  Successful: ${finalStats.successfulRequests}`, colors.green);
    log(`  Failed: ${finalStats.failedRequests}`, colors.red);
    log(`  Pool utilization: ${finalStats.poolUtilization.toFixed(2)}%`, colors.dim);
    
    log('\nInstance Details:', colors.bright);
    finalStats.instances.forEach(instance => {
      const status = instance.ready ? '🟢' : '🔴';
      const busy = instance.busy ? '(busy)' : '(idle)';
      log(`  ${status} ${instance.id} ${busy} - ${instance.messageCount} messages`, colors.dim);
    });

    // Test 4: Conversation context
    log('\n🗣️ Test 4: Testing conversation context...', colors.cyan);
    const contextInstance = finalStats.instances[0].id;
    
    // Send first message
    const context1 = await claudeCliPoolService.sendMessage(
      "My name is TestUser. Can you remember that?",
      { sessionId: 'context-test' }
    );
    log(`  [${context1.instanceId}] Initial message sent`, colors.dim);
    
    // Send follow-up
    const context2 = await claudeCliPoolService.sendMessage(
      "What's my name?",
      { sessionId: 'context-test-2' }
    );
    log(`  [${context2.instanceId}] Follow-up sent to different instance`, colors.dim);
    log(`  Note: Different instances have separate contexts`, colors.yellow);

    log('\n✅ All tests completed successfully!', colors.green + colors.bright);

  } catch (error) {
    log(`\n❌ Test failed: ${error.message}`, colors.red);
    console.error(error);
  } finally {
    // Cleanup
    log('\n🧹 Shutting down CLI pool...', colors.cyan);
    await claudeCliPoolService.shutdown();
    log('✓ CLI pool shut down', colors.green);
  }
}

// Performance benchmark
async function benchmark() {
  log('\n🏃 Performance Benchmark', colors.magenta + colors.bright);
  log('=' .repeat(60), colors.dim);
  
  await claudeCliPoolService.initialize({
    minInstances: 5,
    maxInstances: 10
  });
  
  const messageCount = 10;
  const messages = Array(messageCount).fill(0).map((_, i) => 
    `Calculate ${i + 1} + ${i + 1}`
  );
  
  log(`Sending ${messageCount} messages concurrently...`, colors.dim);
  const startTime = Date.now();
  
  const promises = messages.map(msg => 
    claudeCliPoolService.sendMessage(msg).catch(() => null)
  );
  
  const results = await Promise.all(promises);
  const duration = Date.now() - startTime;
  
  const successful = results.filter(r => r !== null).length;
  
  log('\nBenchmark Results:', colors.bright);
  log(`  Total time: ${duration}ms`, colors.dim);
  log(`  Successful: ${successful}/${messageCount}`, colors.green);
  log(`  Average time per message: ${(duration / messageCount).toFixed(2)}ms`, colors.dim);
  log(`  Throughput: ${((messageCount / duration) * 1000).toFixed(2)} msg/sec`, colors.yellow);
  
  await claudeCliPoolService.shutdown();
}

// Main execution
async function main() {
  log(`
╔════════════════════════════════════════════════════════════╗
║     Claude CLI Pool - Multiple Instances Running Test      ║
╠════════════════════════════════════════════════════════════╣
║  This demonstrates multiple Claude CLI processes running   ║
║  concurrently, each handling different conversations       ║
║  with independent contexts.                                ║
╚════════════════════════════════════════════════════════════╝
`, colors.cyan);

  // Check if Claude CLI is available
  log('Checking Claude CLI availability...', colors.dim);
  try {
    const { execSync } = await import('child_process');
    const version = execSync('claude --version', { encoding: 'utf8' });
    log(`✓ Claude CLI found: ${version.trim()}`, colors.green);
  } catch (error) {
    log('✗ Claude CLI not found or not logged in', colors.red);
    log('Please install and login to Claude CLI first:', colors.yellow);
    log('  1. Install: npm install -g @anthropic-ai/claude-cli', colors.dim);
    log('  2. Login: claude login', colors.dim);
    process.exit(1);
  }

  await testDirectCliPool();
  
  // Ask for benchmark
  console.log('\nRun performance benchmark? (y/n): ');
  process.stdin.once('data', async (data) => {
    if (data.toString().trim().toLowerCase() === 'y') {
      await benchmark();
    }
    process.exit(0);
  });
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}