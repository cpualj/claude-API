#!/usr/bin/env node

/**
 * Simple test runner script
 * Runs tests directly without complex build tools
 */

console.log('🧪 Running Claude API Tests...\n');

// Test results summary
const results = {
  passed: 0,
  failed: 0,
  total: 0
};

// Simple test runner
function test(name, fn) {
  results.total++;
  try {
    fn();
    console.log(`✅ ${name}`);
    results.passed++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error.message}`);
    results.failed++;
  }
}

// Simple assertion
function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${expected}, got ${actual}`);
      }
    },
    toEqual(expected) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected truthy value, got ${actual}`);
      }
    },
    toBeFalsy() {
      if (actual) {
        throw new Error(`Expected falsy value, got ${actual}`);
      }
    }
  };
}

console.log('=== Basic Functionality Tests ===\n');

// Test 1: Universal CLI Wrapper exists
test('Universal CLI Wrapper should be importable', () => {
  const UniversalCLIWrapper = require('./worker/universal-cli-wrapper');
  expect(typeof UniversalCLIWrapper).toBe('function');
});

// Test 2: Claude SDK Wrapper exists
test('Claude SDK Wrapper should be importable', () => {
  const ClaudeSDKWrapper = require('./worker/claude-sdk-wrapper');
  expect(typeof ClaudeSDKWrapper).toBe('function');
});

// Test 3: API routes exist
test('Admin CLI tools route should be importable', () => {
  const router = require('./backend/routes/admin/cli-tools');
  expect(typeof router).toBe('function');
});

// Test 4: Middleware exists
test('Auth middleware should be importable', () => {
  const auth = require('./backend/middleware/auth');
  expect(typeof auth.authMiddleware).toBe('function');
  expect(typeof auth.authenticateAPIKey).toBe('function');
});

// Test 5: Services exist
test('CLI Tool Service should be importable', () => {
  const CLIToolService = require('./backend/services/cli-tool-service');
  expect(typeof CLIToolService).toBe('function');
});

// Test 6: Universal CLI Wrapper basic functionality
test('Universal CLI Wrapper should initialize', () => {
  const UniversalCLIWrapper = require('./worker/universal-cli-wrapper');
  const wrapper = new UniversalCLIWrapper({ configFile: './test-config.json' });
  expect(wrapper.configs).toBeTruthy();
  expect(wrapper.sessions).toBeTruthy();
});

// Test 7: Claude SDK Wrapper basic functionality  
test('Claude SDK Wrapper should initialize with API key', () => {
  process.env.CLAUDE_API_KEY = 'test-key';
  const ClaudeSDKWrapper = require('./worker/claude-sdk-wrapper');
  const wrapper = new ClaudeSDKWrapper({ apiKey: 'test-key' });
  expect(wrapper.apiKey).toBe('test-key');
});

// Test 8: CLI Tool Service basic functionality
test('CLI Tool Service should create and retrieve tools', async () => {
  const CLIToolService = require('./backend/services/cli-tool-service');
  const service = new CLIToolService();
  
  const tool = await service.createTool({
    name: 'Test Tool',
    command: 'test',
  });
  
  expect(tool.name).toBe('Test Tool');
  expect(tool.command).toBe('test');
  
  const retrieved = await service.getToolById(tool.id);
  expect(retrieved.name).toBe('Test Tool');
});

// Test 9: Universal Chat Service basic functionality
test('Universal Chat Service should handle chat', async () => {
  const UniversalChatService = require('./backend/services/universal-chat-service');
  const service = new UniversalChatService();
  
  const result = await service.chat({
    message: 'Hello',
    toolId: 'test',
    sessionId: 'session-1',
    userId: 'user-1',
  });
  
  expect(result.success).toBe(true);
  expect(result.response).toBeTruthy();
});

// Test 10: Session management
test('Universal CLI Wrapper should manage sessions', async () => {
  const UniversalCLIWrapper = require('./worker/universal-cli-wrapper');
  const wrapper = new UniversalCLIWrapper({ configFile: './test-config.json' });
  
  // Add a test tool
  wrapper.addCLITool({
    name: 'Session Test',
    command: 'echo',
    session: { supported: true },
  });
  
  const session = await wrapper.createSession('session-test');
  expect(session.id).toBeTruthy();
  expect(session.toolId).toBe('session-test');
});

// Print results
console.log('\n=== Test Results ===');
console.log(`✅ Passed: ${results.passed}/${results.total}`);
console.log(`❌ Failed: ${results.failed}/${results.total}`);

if (results.failed > 0) {
  console.log('\n⚠️  Some tests failed. Please check the errors above.');
  process.exit(1);
} else {
  console.log('\n🎉 All tests passed!');
  process.exit(0);
}