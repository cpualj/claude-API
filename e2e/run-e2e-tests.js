#!/usr/bin/env node

import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// E2E Test Runner for Claude CLI Chat
class E2ETestRunner {
  constructor() {
    this.config = {
      baseUrl: 'http://localhost:3030',
      apiUrl: 'http://localhost:3004',
      screenshotDir: path.join(__dirname, 'screenshots'),
      reportDir: path.join(__dirname, 'reports')
    };
    
    this.testResults = [];
    this.startTime = null;
  }

  async initialize() {
    console.log('🔧 Initializing E2E Test Runner...');
    
    // Create directories if they don't exist
    await fs.mkdir(this.config.screenshotDir, { recursive: true });
    await fs.mkdir(this.config.reportDir, { recursive: true });
    
    // Check if services are running
    await this.checkServices();
    
    this.startTime = Date.now();
    console.log('✅ E2E Test Runner initialized\n');
  }

  async checkServices() {
    console.log('🔍 Checking services...');
    
    // Check CLI Pool Service
    try {
      const response = await fetch(`${this.config.apiUrl}/api/cli-pool/health`);
      if (!response.ok) {
        throw new Error('CLI Pool service is not healthy');
      }
      console.log('  ✓ CLI Pool Service: Running');
    } catch (error) {
      console.error('  ✗ CLI Pool Service: Not available');
      console.log('  Please start the CLI Pool service with: npm run dev:cli-pool');
      throw error;
    }

    // Check Frontend (optional)
    try {
      const response = await fetch(this.config.baseUrl);
      console.log('  ✓ Frontend: Running');
    } catch (error) {
      console.log('  ⚠️  Frontend: Not available (tests will use API directly)');
    }
  }

  async runTest(testName, testFunction) {
    console.log(`\n📋 Running: ${testName}`);
    console.log('─'.repeat(50));
    
    const testStart = Date.now();
    let result;
    
    try {
      result = await testFunction();
      const duration = Date.now() - testStart;
      
      this.testResults.push({
        name: testName,
        status: 'PASSED',
        duration,
        details: result
      });
      
      console.log(`✅ ${testName} PASSED (${duration}ms)`);
    } catch (error) {
      const duration = Date.now() - testStart;
      
      this.testResults.push({
        name: testName,
        status: 'FAILED',
        duration,
        error: error.message,
        stack: error.stack
      });
      
      console.error(`❌ ${testName} FAILED (${duration}ms)`);
      console.error(`   Error: ${error.message}`);
    }
    
    return result;
  }

  async testCLIPoolInitialization() {
    const response = await fetch(`${this.config.apiUrl}/api/cli-pool/initialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        minInstances: 2,
        maxInstances: 5,
        maxMessagesPerInstance: 100
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to initialize pool: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`  Pool initialized with ${data.poolSize} instances`);
    return data;
  }

  async testSingleMessage() {
    const message = 'Hello, Claude! What is 2 + 2?';
    console.log(`  Sending: "${message}"`);
    
    const response = await fetch(`${this.config.apiUrl}/api/cli-pool/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message })
    });

    if (!response.ok) {
      throw new Error(`Chat request failed: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`  Response received in ${data.duration}ms`);
    console.log(`  Claude says: "${data.response.substring(0, 50)}..."`);
    
    // Verify response contains expected content
    if (!data.response.includes('4')) {
      console.warn('  ⚠️  Response may not contain expected answer');
    }
    
    return data;
  }

  async testConversationContext() {
    const messages = [
      'My name is Alice.',
      'What is my name?'
    ];
    
    let sessionId = null;
    const results = [];
    
    for (const message of messages) {
      console.log(`  Sending: "${message}"`);
      
      const body = { message };
      if (sessionId) {
        body.sessionId = sessionId;
      }
      
      const response = await fetch(`${this.config.apiUrl}/api/cli-pool/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`Message failed: ${response.statusText}`);
      }

      const data = await response.json();
      sessionId = data.sessionId || sessionId;
      
      console.log(`  Response: "${data.response.substring(0, 60)}..."`);
      results.push(data);
    }
    
    // Verify context was maintained
    const lastResponse = results[results.length - 1].response.toLowerCase();
    if (!lastResponse.includes('alice')) {
      console.warn('  ⚠️  Context may not be maintained properly');
    }
    
    return results;
  }

  async testConcurrentRequests() {
    const messages = [
      'What is 1 + 1?',
      'What is 2 + 2?',
      'What is 3 + 3?'
    ];
    
    console.log(`  Sending ${messages.length} concurrent requests...`);
    
    const startTime = Date.now();
    const promises = messages.map(message =>
      fetch(`${this.config.apiUrl}/api/cli-pool/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      }).then(r => r.json())
    );
    
    const results = await Promise.all(promises);
    const totalTime = Date.now() - startTime;
    
    console.log(`  All responses received in ${totalTime}ms`);
    
    // Check if different instances were used
    const instanceIds = new Set(results.map(r => r.instanceId));
    console.log(`  Used ${instanceIds.size} different CLI instances`);
    
    // Verify all responses are correct
    const expectedAnswers = ['2', '4', '6'];
    results.forEach((result, i) => {
      if (!result.response.includes(expectedAnswers[i])) {
        console.warn(`  ⚠️  Response ${i + 1} may be incorrect`);
      }
    });
    
    return {
      totalTime,
      avgTime: totalTime / messages.length,
      instancesUsed: instanceIds.size,
      results
    };
  }

  async testPoolStatistics() {
    const response = await fetch(`${this.config.apiUrl}/api/cli-pool/stats`);
    
    if (!response.ok) {
      throw new Error('Failed to get statistics');
    }
    
    const stats = await response.json();
    
    console.log('  Pool Statistics:');
    console.log(`    Total Requests: ${stats.totalRequests}`);
    console.log(`    Success Rate: ${((stats.successfulRequests / stats.totalRequests) * 100).toFixed(1)}%`);
    console.log(`    Avg Response Time: ${Math.round(stats.averageResponseTime)}ms`);
    console.log(`    Pool Size: ${stats.poolSize}`);
    console.log(`    Utilization: ${stats.poolUtilization?.toFixed(1)}%`);
    
    return stats;
  }

  async testErrorHandling() {
    console.log('  Testing with invalid request...');
    
    const response = await fetch(`${this.config.apiUrl}/api/cli-pool/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}) // Missing message
    });
    
    if (response.ok) {
      throw new Error('Should have failed with missing message');
    }
    
    console.log(`  ✓ Correctly rejected invalid request (${response.status})`);
    
    return { status: response.status };
  }

  async generateReport() {
    const duration = Date.now() - this.startTime;
    const passed = this.testResults.filter(r => r.status === 'PASSED').length;
    const failed = this.testResults.filter(r => r.status === 'FAILED').length;
    
    const report = {
      timestamp: new Date().toISOString(),
      duration,
      summary: {
        total: this.testResults.length,
        passed,
        failed,
        successRate: ((passed / this.testResults.length) * 100).toFixed(1)
      },
      tests: this.testResults
    };
    
    // Save report to file
    const reportPath = path.join(this.config.reportDir, `report-${Date.now()}.json`);
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    
    // Print summary
    console.log('\n' + '═'.repeat(60));
    console.log('📊 E2E TEST SUMMARY');
    console.log('═'.repeat(60));
    console.log(`Total Tests: ${report.summary.total}`);
    console.log(`✅ Passed: ${report.summary.passed}`);
    console.log(`❌ Failed: ${report.summary.failed}`);
    console.log(`Success Rate: ${report.summary.successRate}%`);
    console.log(`Total Duration: ${(duration / 1000).toFixed(1)}s`);
    console.log(`\nReport saved to: ${reportPath}`);
    
    return report;
  }

  async run() {
    try {
      await this.initialize();
      
      // Run all tests
      await this.runTest('CLI Pool Initialization', () => this.testCLIPoolInitialization());
      await this.runTest('Single Message', () => this.testSingleMessage());
      await this.runTest('Conversation Context', () => this.testConversationContext());
      await this.runTest('Concurrent Requests', () => this.testConcurrentRequests());
      await this.runTest('Error Handling', () => this.testErrorHandling());
      await this.runTest('Pool Statistics', () => this.testPoolStatistics());
      
      // Generate report
      const report = await this.generateReport();
      
      // Exit with appropriate code
      process.exit(report.summary.failed > 0 ? 1 : 0);
      
    } catch (error) {
      console.error('\n💥 Fatal error:', error.message);
      process.exit(1);
    }
  }
}

// Run tests
const runner = new E2ETestRunner();
runner.run();