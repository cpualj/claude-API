#!/usr/bin/env node

/**
 * Concurrent Claude CLI Test
 * Tests multiple concurrent requests to verify pool management
 */

import fetch from 'node-fetch';

const API_URL = 'http://localhost:3004/api/cli-pool';

class ConcurrentTester {
  constructor() {
    this.results = [];
    this.startTime = null;
  }

  async initialize() {
    console.log('🔧 Initializing CLI Pool...');
    
    const response = await fetch(`${API_URL}/initialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        minInstances: 3,
        maxInstances: 5,
        maxMessagesPerInstance: 100
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to initialize: ${error}`);
    }

    const data = await response.json();
    console.log(`✅ Pool initialized with ${data.poolSize} instances\n`);
    return data;
  }

  async testConcurrentMessages(count = 5) {
    console.log(`📤 Sending ${count} concurrent messages...`);
    
    const messages = Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      message: `Message ${i + 1}: What is ${i + 1} × ${i + 1}?`,
      expectedAnswer: String((i + 1) * (i + 1))
    }));

    this.startTime = Date.now();

    // Send all messages concurrently
    const promises = messages.map(async (msg) => {
      const startTime = Date.now();
      
      try {
        const response = await fetch(`${API_URL}/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg.message })
        });

        if (!response.ok) {
          throw new Error(`Request failed: ${response.statusText}`);
        }

        const data = await response.json();
        const duration = Date.now() - startTime;

        return {
          ...msg,
          success: true,
          response: data.response,
          instanceId: data.instanceId,
          duration,
          containsAnswer: data.response.includes(msg.expectedAnswer)
        };
      } catch (error) {
        return {
          ...msg,
          success: false,
          error: error.message,
          duration: Date.now() - startTime
        };
      }
    });

    // Wait for all responses
    this.results = await Promise.all(promises);
    const totalTime = Date.now() - this.startTime;

    // Analyze results
    this.analyzeResults(totalTime);
    
    return this.results;
  }

  analyzeResults(totalTime) {
    console.log('\n📊 Results Analysis:');
    console.log('─'.repeat(50));
    
    const successful = this.results.filter(r => r.success);
    const failed = this.results.filter(r => !r.success);
    const correct = successful.filter(r => r.containsAnswer);
    
    // Instance usage
    const instanceIds = new Set(successful.map(r => r.instanceId));
    
    // Timing statistics
    const times = successful.map(r => r.duration);
    const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
    const maxTime = Math.max(...times);
    const minTime = Math.min(...times);
    
    console.log(`Total Time: ${totalTime}ms`);
    console.log(`Success Rate: ${(successful.length / this.results.length * 100).toFixed(1)}%`);
    console.log(`Correct Answers: ${correct.length}/${successful.length}`);
    console.log(`Instances Used: ${instanceIds.size}`);
    console.log(`\nTiming:`);
    console.log(`  Average: ${avgTime.toFixed(0)}ms`);
    console.log(`  Min: ${minTime}ms`);
    console.log(`  Max: ${maxTime}ms`);
    
    // Show individual results
    console.log('\nIndividual Results:');
    this.results.forEach(r => {
      const status = r.success ? '✅' : '❌';
      const answer = r.containsAnswer ? '✓' : '✗';
      console.log(`  ${status} Message ${r.id}: ${r.duration}ms ${r.success ? `[${answer}]` : `[${r.error}]`}`);
    });
  }

  async testLoadBalancing() {
    console.log('\n🔄 Testing Load Balancing...');
    
    // Send messages in rapid succession
    const rapidMessages = Array.from({ length: 10 }, (_, i) => 
      `Quick message ${i + 1}`
    );

    const instanceUsage = {};
    
    for (const msg of rapidMessages) {
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg })
      });
      
      if (response.ok) {
        const data = await response.json();
        instanceUsage[data.instanceId] = (instanceUsage[data.instanceId] || 0) + 1;
      }
    }
    
    console.log('Instance Usage Distribution:');
    Object.entries(instanceUsage).forEach(([id, count]) => {
      console.log(`  Instance ${id.split('-').pop()}: ${count} messages`);
    });
    
    // Check if load is balanced
    const counts = Object.values(instanceUsage);
    const maxDiff = Math.max(...counts) - Math.min(...counts);
    const isBalanced = maxDiff <= 2;
    
    console.log(`\nLoad Balancing: ${isBalanced ? '✅ Good' : '⚠️ Uneven'} (max diff: ${maxDiff})`);
  }

  async testPoolStatistics() {
    console.log('\n📈 Pool Statistics:');
    
    const response = await fetch(`${API_URL}/stats`);
    if (!response.ok) {
      console.error('Failed to get statistics');
      return;
    }
    
    const stats = await response.json();
    
    console.log(`  Total Requests: ${stats.totalRequests}`);
    console.log(`  Successful: ${stats.successfulRequests}`);
    console.log(`  Failed: ${stats.failedRequests}`);
    console.log(`  Success Rate: ${((stats.successfulRequests / stats.totalRequests) * 100).toFixed(1)}%`);
    console.log(`  Avg Response Time: ${stats.averageResponseTime?.toFixed(0)}ms`);
    console.log(`  Pool Size: ${stats.poolSize}`);
    console.log(`  Active Instances: ${stats.busyInstances}`);
    console.log(`  Pool Utilization: ${stats.poolUtilization?.toFixed(1)}%`);
  }

  async run() {
    console.log('🚀 Starting Concurrent Claude CLI Test\n');
    console.log('═'.repeat(50));
    
    try {
      // Initialize pool
      await this.initialize();
      
      // Test concurrent messages
      await this.testConcurrentMessages(5);
      
      // Test load balancing
      await this.testLoadBalancing();
      
      // Get final statistics
      await this.testPoolStatistics();
      
      console.log('\n' + '═'.repeat(50));
      console.log('✅ All tests completed successfully!');
      
    } catch (error) {
      console.error('\n❌ Test failed:', error.message);
      process.exit(1);
    }
  }
}

// Run tests
const tester = new ConcurrentTester();
tester.run();