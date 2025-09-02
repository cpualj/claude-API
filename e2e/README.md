# E2E Testing for Claude API Wrapper

## Overview

This directory contains end-to-end tests for the Claude API wrapper system that uses multiple Claude CLI instances for concurrent processing.

## 📁 Structure

```
e2e/
├── tests/              # Test scripts
│   ├── claude-cli-chat.test.js    # Main chat functionality test
│   ├── test-chat-ui.js           # UI interaction tests with Playwright MCP
│   └── test-concurrent.js        # Concurrent request handling tests
├── config/            # Configuration files
│   └── test-config.js            # Central test configuration
├── fixtures/          # Test data and mock responses
├── reports/           # Test execution reports
├── screenshots/       # Test screenshots (auto-captured)
├── run-e2e-tests.js  # Main test runner
├── package.json      # Dependencies and scripts
└── README.md         # This file
```

## 🚀 Quick Start

### Prerequisites

1. **Claude CLI**: Must be installed and logged in
   ```bash
   claude --version  # Verify installation
   ```

2. **Backend Services**: Start required services
   ```bash
   # Terminal 1: Main backend
   cd backend
   npm run dev
   
   # Terminal 2: CLI Pool Service (if separated)
   cd backend
   node server-cli-pool.js
   ```

3. **Install E2E Dependencies**:
   ```bash
   cd e2e
   npm install
   ```

### Running Tests

#### All Tests
```bash
npm test
```

#### Individual Test Suites
```bash
npm run test:chat        # Test chat UI
npm run test:concurrent  # Test concurrent requests
npm run test:playwright  # Run Playwright MCP tests
```

## 🧪 Test Scenarios

### 1. **Single Message Test**
- Sends a single message to Claude CLI
- Verifies response is received
- Checks response time

### 2. **Conversation Context Test**
- Tests multi-turn conversations
- Verifies context is maintained
- Checks session management

### 3. **Concurrent Requests Test**
- Sends multiple requests simultaneously
- Verifies pool management
- Tests load balancing across instances

### 4. **Error Handling Test**
- Tests invalid requests
- Verifies error responses
- Checks graceful failure

### 5. **Pool Statistics Test**
- Monitors pool health
- Tracks performance metrics
- Verifies resource utilization

## 🎯 Using Playwright MCP

The tests can use Playwright MCP for browser automation:

### Example: Testing Chat Interface
```javascript
// Navigate to chat page
await mcp__playwright__browser_navigate({
  url: 'http://localhost:3030/chat'
});

// Take screenshot
await mcp__playwright__browser_take_screenshot({
  filename: 'chat-interface.png'
});

// Get page snapshot for interaction
const snapshot = await mcp__playwright__browser_snapshot();

// Type in chat input
await mcp__playwright__browser_type({
  element: 'Chat input field',
  ref: 'input-message',
  text: 'Hello Claude!',
  submit: true
});
```

### Example: Testing Multiple Browser Instances
```javascript
// Open multiple tabs
await mcp__playwright__browser_tabs({ action: 'new' });
await mcp__playwright__browser_tabs({ action: 'new' });

// Switch between tabs and send messages
await mcp__playwright__browser_tabs({ action: 'select', index: 0 });
// Send message in tab 1

await mcp__playwright__browser_tabs({ action: 'select', index: 1 });
// Send message in tab 2
```

## 📊 Test Reports

Test results are saved in `reports/` directory:

```json
{
  "timestamp": "2025-01-26T10:00:00Z",
  "summary": {
    "total": 6,
    "passed": 5,
    "failed": 1,
    "successRate": "83.3%"
  },
  "tests": [...]
}
```

## 🔧 Configuration

Edit `config/test-config.js` to customize:

- Service URLs
- Timeouts
- Test data
- Parallel execution settings

## 📝 API Testing Examples

### Initialize CLI Pool
```bash
curl -X POST http://localhost:3004/api/cli-pool/initialize \
  -H "Content-Type: application/json" \
  -d '{"minInstances": 2, "maxInstances": 5}'
```

### Send Chat Message
```bash
curl -X POST http://localhost:3004/api/cli-pool/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello Claude!"}'
```

### Get Statistics
```bash
curl http://localhost:3004/api/cli-pool/stats
```

## 🐛 Troubleshooting

### Common Issues

1. **Port Already in Use**
   ```bash
   # Find process using port
   netstat -ano | findstr :3004
   
   # Kill process
   taskkill /PID <process_id> /F
   ```

2. **Claude CLI Not Found**
   - Ensure Claude CLI is in PATH
   - Verify with `claude --version`

3. **Tests Timeout**
   - Check if services are running
   - Increase timeout in test-config.js
   - Check Claude CLI response time

## 📈 Performance Benchmarks

Expected performance with default settings:

| Metric | Target | Actual |
|--------|--------|--------|
| Single Message Response | < 5s | ~3s |
| Concurrent (3 messages) | < 10s | ~7s |
| Pool Initialization | < 3s | ~2s |
| Context Switch | < 100ms | ~50ms |

## 🔄 CI/CD Integration

### GitHub Actions Example
```yaml
name: E2E Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm run test:all
```

## 📚 Additional Resources

- [Claude CLI Documentation](https://docs.anthropic.com/claude-cli)
- [Playwright MCP Documentation](https://github.com/modelcontextprotocol/playwright-mcp)
- [Project Documentation](../README.md)

## 🤝 Contributing

1. Add new test cases in `tests/` directory
2. Update configuration if needed
3. Run tests locally before committing
4. Include test results in PR

## 📄 License

See main project LICENSE file.