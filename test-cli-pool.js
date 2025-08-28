/**
 * Claude CLI Pool Test
 * Demonstrates multiple Claude CLI instances running concurrently
 * 
 * Run this test:
 * 1. Start server: node backend/server-cli-pool.js
 * 2. Run test: node test-cli-pool.js
 */

const API_URL = 'http://localhost:3004';

// Test messages for concurrent processing
const TEST_MESSAGES = [
  "What is 2 + 2?",
  "What's the capital of France?",
  "Tell me a very short joke",
  "How do you say hello in Spanish?",
  "What is the speed of light?",
  "Name three primary colors",
  "What year did World War II end?",
  "What is the largest planet in our solar system?"
];

// ANSI color codes for terminal output
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

async function testCliPool() {
  log('\n🚀 Claude CLI Pool Test Starting', colors.bright);
  log('=' .repeat(60), colors.dim);

  try {
    // Step 1: Initialize the CLI pool
    log('\n📦 Step 1: Initializing CLI pool...', colors.cyan);
    const initResponse = await fetch(`${API_URL}/api/cli-pool/initialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        minInstances: 3,
        maxInstances: 5,
        maxMessagesPerInstance: 50
      })
    });
    
    const initData = await initResponse.json();
    if (initData.success) {
      log(`✓ Pool initialized with ${initData.stats.poolSize} instances`, colors.green);
    } else {
      throw new Error(`Failed to initialize: ${initData.error}`);
    }

    // Step 2: Test single message
    log('\n📝 Step 2: Testing single message...', colors.cyan);
    const singleResponse = await fetch(`${API_URL}/api/cli-pool/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: "Hello Claude! Please respond with 'Hi there!'",
        sessionId: 'test-1'
      })
    });
    
    const singleData = await singleResponse.json();
    if (singleData.success) {
      log(`✓ Response from instance ${singleData.response.instanceId}:`, colors.green);
      log(`  "${singleData.response.content.substring(0, 100)}..."`, colors.dim);
    }

    // Step 3: Test concurrent messages
    log('\n⚡ Step 3: Testing concurrent messages...', colors.cyan);
    log(`  Sending ${TEST_MESSAGES.length} messages simultaneously`, colors.dim);
    
    const startTime = Date.now();
    const promises = TEST_MESSAGES.map((message, index) => 
      fetch(`${API_URL}/api/cli-pool/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          sessionId: `concurrent-${index}`
        })
      }).then(res => res.json())
    );

    const responses = await Promise.all(promises);
    const duration = Date.now() - startTime;
    
    log(`\n✓ All ${responses.length} messages processed in ${duration}ms`, colors.green);
    
    // Display results
    responses.forEach((resp, index) => {
      if (resp.success) {
        log(`  ${index + 1}. [${resp.response.instanceId}] Q: "${TEST_MESSAGES[index]}"`, colors.yellow);
        log(`     A: "${resp.response.content.substring(0, 60)}..."`, colors.dim);
      } else {
        log(`  ${index + 1}. ✗ Error: ${resp.error}`, colors.red);
      }
    });

    // Step 4: Test batch processing
    log('\n📦 Step 4: Testing batch message processing...', colors.cyan);
    const batchResponse = await fetch(`${API_URL}/api/cli-pool/chat-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { message: "Count from 1 to 3", sessionId: "batch-1" },
          { message: "Name three fruits", sessionId: "batch-2" },
          { message: "What color is the sky?", sessionId: "batch-3" }
        ]
      })
    });
    
    const batchData = await batchResponse.json();
    if (batchData.success) {
      log(`✓ Batch processed: ${batchData.stats.successful}/${batchData.stats.total} successful`, colors.green);
    }

    // Step 5: Get pool statistics
    log('\n📊 Step 5: Getting pool statistics...', colors.cyan);
    const statsResponse = await fetch(`${API_URL}/api/cli-pool/stats`);
    const statsData = await statsResponse.json();
    
    if (statsData.success) {
      log('\nPool Statistics:', colors.bright);
      log(`  Total requests: ${statsData.stats.totalRequests}`, colors.dim);
      log(`  Successful: ${statsData.stats.successfulRequests}`, colors.green);
      log(`  Failed: ${statsData.stats.failedRequests}`, colors.red);
      log(`  Average response time: ${statsData.stats.averageResponseTime.toFixed(2)}ms`, colors.dim);
      log(`  Pool utilization: ${statsData.health.utilization}`, colors.dim);
      log('\nInstance Details:', colors.bright);
      statsData.stats.instances.forEach(instance => {
        const status = instance.ready ? '🟢' : '🔴';
        const busy = instance.busy ? '(busy)' : '(idle)';
        log(`  ${status} ${instance.id} ${busy} - ${instance.messageCount} messages`, colors.dim);
      });
    }

    // Step 6: Test streaming
    log('\n🌊 Step 6: Testing streaming response...', colors.cyan);
    const streamResponse = await fetch(`${API_URL}/api/cli-pool/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: "Count from 1 to 5 slowly",
        sessionId: 'stream-test',
        stream: true
      })
    });
    
    if (streamResponse.ok) {
      const reader = streamResponse.body.getReader();
      const decoder = new TextDecoder();
      let chunks = 0;
      
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n').filter(line => line.startsWith('data:'));
        
        for (const line of lines) {
          try {
            const data = JSON.parse(line.substring(5));
            if (data.type === 'chunk') {
              chunks++;
              process.stdout.write('.');
            }
          } catch (e) {}
        }
      }
      
      log(`\n✓ Received ${chunks} streaming chunks`, colors.green);
    }

    log('\n✅ All tests completed successfully!', colors.green + colors.bright);
    
  } catch (error) {
    log(`\n❌ Test failed: ${error.message}`, colors.red + colors.bright);
    console.error(error);
  }

  // Display final stats
  try {
    const finalStats = await fetch(`${API_URL}/api/cli-pool/stats`);
    const finalData = await finalStats.json();
    
    log('\n📈 Final Statistics:', colors.cyan + colors.bright);
    log('=' .repeat(60), colors.dim);
    log(`Total messages processed: ${finalData.stats.totalRequests}`, colors.dim);
    log(`Success rate: ${((finalData.stats.successfulRequests / finalData.stats.totalRequests) * 100).toFixed(2)}%`, colors.dim);
    log(`Active CLI instances: ${finalData.stats.poolSize}`, colors.dim);
  } catch (error) {
    console.error('Could not fetch final stats');
  }
}

// Performance test
async function performanceTest() {
  log('\n🏃 Performance Test', colors.magenta + colors.bright);
  log('=' .repeat(60), colors.dim);
  
  const messageCount = 20;
  log(`Sending ${messageCount} messages concurrently...`, colors.dim);
  
  const messages = Array(messageCount).fill(0).map((_, i) => 
    `Calculate ${i + 1} * ${i + 1}`
  );
  
  const startTime = Date.now();
  
  const promises = messages.map((msg, i) => 
    fetch(`${API_URL}/api/cli-pool/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: msg,
        sessionId: `perf-${i}`
      })
    }).then(res => res.json())
  );
  
  const results = await Promise.all(promises);
  const duration = Date.now() - startTime;
  
  const successful = results.filter(r => r.success).length;
  const avgTime = duration / messageCount;
  
  log(`\nPerformance Results:`, colors.bright);
  log(`  Total time: ${duration}ms`, colors.dim);
  log(`  Messages: ${messageCount}`, colors.dim);
  log(`  Successful: ${successful}/${messageCount}`, colors.green);
  log(`  Average time per message: ${avgTime.toFixed(2)}ms`, colors.dim);
  log(`  Throughput: ${((messageCount / duration) * 1000).toFixed(2)} messages/second`, colors.yellow);
}

// Main execution
async function main() {
  log(`
╔════════════════════════════════════════════════════════════╗
║          Claude CLI Pool - Concurrent Processing Test      ║
╠════════════════════════════════════════════════════════════╣
║  This test demonstrates multiple Claude CLI instances      ║
║  running concurrently, each handling different requests    ║
║  with independent conversation contexts.                   ║
╚════════════════════════════════════════════════════════════╝
`, colors.cyan);

  log('Instructions:', colors.yellow);
  log('1. Make sure Claude CLI is logged in: claude login', colors.dim);
  log('2. Start the server: node backend/server-cli-pool.js', colors.dim);
  log('3. Run this test: node test-cli-pool.js', colors.dim);
  
  // Check if server is running
  try {
    const response = await fetch(`${API_URL}/`);
    if (!response.ok) throw new Error('Server not responding');
    
    const data = await response.json();
    log(`\n✓ Server is running: ${data.name}`, colors.green);
    
    // Run tests
    await testCliPool();
    
    // Run performance test
    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    await new Promise(resolve => {
      rl.question('\nRun performance test? (y/n): ', async (answer) => {
        if (answer.toLowerCase() === 'y') {
          await performanceTest();
        }
        rl.close();
        resolve();
      });
    });
    
  } catch (error) {
    log(`\n❌ Error: Server is not running at ${API_URL}`, colors.red);
    log('Please start the server first: node backend/server-cli-pool.js', colors.yellow);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}