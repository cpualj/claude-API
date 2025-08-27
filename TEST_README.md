# Testing Guide for Claude API Wrapper

This project uses **Vitest** as the testing framework with comprehensive unit tests for all major components.

## Installation

First, install the testing dependencies:

```bash
npm install
# or
yarn install
```

## Running Tests

### Run All Tests
```bash
npm test
# or
yarn test
```

### Run Tests with UI
```bash
npm run test:ui
# or
yarn test:ui
```

### Run Tests Once (CI Mode)
```bash
npm run test:run
# or
yarn test:run
```

### Run Tests with Coverage
```bash
npm run test:coverage
# or
yarn test:coverage
```

### Watch Mode (Development)
```bash
npm run test:watch
# or
yarn test:watch
```

## Running Specific Test Suites

### Backend Tests Only
```bash
npm run test:backend
# or
yarn test:backend
```

### Worker Tests Only
```bash
npm run test:worker
# or
yarn test:worker
```

### Frontend Tests Only
```bash
npm run test:frontend
# or
yarn test:frontend
```

## Test Structure

```
claude-api/
├── test/
│   └── setup.js                    # Global test setup
├── vitest.config.js                # Vitest configuration
├── worker/
│   ├── universal-cli-wrapper.test.js
│   └── claude-sdk-wrapper.test.js
├── backend/
│   └── routes/
│       ├── admin/
│       │   └── cli-tools.test.js
│       └── api/
│           └── universal-chat.test.js
└── src/
    └── sections/
        └── cli-config/
            ├── cli-config-list.test.jsx
            └── cli-tool-card.test.jsx
```

## Coverage Reports

After running tests with coverage, reports are generated in:
- **HTML Report**: `coverage/index.html` (open in browser)
- **JSON Report**: `coverage/coverage-final.json`
- **Text Report**: Displayed in terminal

### Coverage Thresholds

The project aims for:
- **Statements**: 80%+
- **Branches**: 75%+
- **Functions**: 80%+
- **Lines**: 80%+

## Test Categories

### 1. Universal CLI Wrapper Tests
- Configuration management
- Command execution (spawn/exec)
- Authentication handling
- Session management
- Argument building
- Error handling

### 2. Claude SDK Wrapper Tests
- Message sending
- Streaming responses
- Session persistence
- Token estimation
- Error recovery

### 3. API Route Tests
- Admin CLI tool endpoints
- Universal chat endpoints
- Authentication middleware
- Rate limiting
- WebSocket events

### 4. React Component Tests
- CLI configuration list
- CLI tool cards
- Form validation
- User interactions
- Loading states
- Error handling

## Writing New Tests

### Test File Naming
- Unit tests: `*.test.js` or `*.test.jsx`
- Integration tests: `*.integration.test.js`
- End-to-end tests: `*.e2e.test.js`

### Test Structure Example

```javascript
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('ComponentName', () => {
  beforeEach(() => {
    // Setup before each test
    vi.clearAllMocks();
  });

  describe('Feature/Method', () => {
    it('should do something specific', () => {
      // Arrange
      const input = 'test';
      
      // Act
      const result = functionUnderTest(input);
      
      // Assert
      expect(result).toBe('expected');
    });
  });
});
```

## Mocking

### Mock External Dependencies
```javascript
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn(),
    },
  })),
}));
```

### Mock File System
```javascript
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
  },
}));
```

## Debugging Tests

### Run Single Test File
```bash
npx vitest run worker/universal-cli-wrapper.test.js
```

### Run Tests Matching Pattern
```bash
npx vitest run -t "should execute spawn command"
```

### Debug in VS Code
1. Set breakpoints in test files
2. Use "JavaScript Debug Terminal"
3. Run `npm test` in debug terminal

## CI/CD Integration

### GitHub Actions Example
```yaml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm run test:coverage
      - uses: codecov/codecov-action@v3
        with:
          file: ./coverage/coverage-final.json
```

## Common Issues

### 1. Tests Hanging
- Check for unresolved promises
- Ensure all timers are mocked/cleared
- Verify async operations complete

### 2. Import Errors
- Check path aliases in `vitest.config.js`
- Ensure all dependencies are installed
- Verify module type consistency

### 3. React Component Tests Failing
- Check if testing library is properly setup
- Ensure DOM cleanup between tests
- Verify mock implementations

## Performance Tips

1. **Use concurrent tests**: Tests run in parallel by default
2. **Mock heavy operations**: Database, network calls
3. **Use `test.skip`**: For slow tests during development
4. **Optimize imports**: Only import what's needed

## Best Practices

1. **Isolated Tests**: Each test should be independent
2. **Clear Names**: Describe what the test verifies
3. **AAA Pattern**: Arrange, Act, Assert
4. **Mock External Services**: Don't make real API calls
5. **Test Edge Cases**: Errors, nulls, empty arrays
6. **Keep Tests Simple**: One assertion per test when possible
7. **Use beforeEach/afterEach**: For setup and cleanup

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library](https://testing-library.com/)
- [MSW (Mock Service Worker)](https://mswjs.io/)
- [Supertest](https://github.com/ladjs/supertest)