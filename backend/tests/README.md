# Claude API Backend Tests

Comprehensive test suite for the Claude API Backend using Vitest.

## Test Structure

```
tests/
├── setup.js                    # Test environment setup
├── db/
│   └── init.test.js            # Database initialization tests
├── services/
│   ├── redis.test.js           # Redis services tests
│   ├── workerManager.test.js   # Worker management tests
│   ├── apiKeyManager.test.js   # API key management tests
│   └── sessionManager.test.js  # Session management tests
└── routes/
    ├── auth.test.js            # Authentication route tests
    ├── api.test.js             # Main API route tests
    ├── admin.test.js           # Admin route tests
    └── health.test.js          # Health check route tests
```

## Running Tests

### All Tests
```bash
npm test                # Run all tests in watch mode
npm run test:run        # Run all tests once
```

### Test UI
```bash
npm run test:ui         # Open Vitest UI in browser
```

### Coverage Report
```bash
npm run test:coverage   # Generate coverage report
```

### Specific Test Files
```bash
npx vitest run tests/db/init.test.js
npx vitest run tests/services/redis.test.js
npx vitest run tests/routes/auth.test.js
```

## Test Environment

### Prerequisites
Before running tests, ensure you have:
- PostgreSQL running (for database tests)
- Redis Memory Server (automatically handled)
- Node.js 18+ with npm

### Environment Configuration
Tests use a separate test environment with:
- Test database: `claude_api_test`
- In-memory Redis server
- Mock services where appropriate
- Isolated test data

### Test Database Setup
```bash
# Create test database
createdb claude_api_test

# Run tests (will auto-migrate)
npm test
```

## Test Categories

### Unit Tests
- **Database Layer**: Connection, queries, migrations, error handling
- **Redis Services**: Caching, queuing, rate limiting, pub/sub
- **Service Layer**: Worker management, API keys, sessions
- **Business Logic**: Authentication, authorization, validation

### Integration Tests
- **API Routes**: Full request/response cycle testing
- **Service Integration**: Multiple services working together
- **Database Integration**: Real database operations
- **Error Scenarios**: Failure handling and recovery

### End-to-End Tests
- **Authentication Flow**: Registration → Login → API usage
- **Session Management**: Create → Use → Update → Delete
- **Admin Operations**: User management, API key lifecycle
- **Health Monitoring**: Service status and metrics

## Test Patterns

### Service Testing
```javascript
describe('ServiceName', () => {
  let service;
  let mockDependencies;

  beforeAll(async () => {
    // Setup service with dependencies
  });

  beforeEach(async () => {
    // Clean state between tests
  });

  describe('method name', () => {
    it('should handle success case', async () => {
      // Test successful operation
    });

    it('should handle error case', async () => {
      // Test error handling
    });
  });
});
```

### Route Testing
```javascript
describe('Route', () => {
  let app;
  let testUser;
  let authToken;

  beforeAll(async () => {
    // Setup Express app with routes
  });

  beforeEach(async () => {
    // Create test data
  });

  it('should handle valid requests', async () => {
    const response = await request(app)
      .post('/api/endpoint')
      .set('Authorization', `Bearer ${authToken}`)
      .send(validData)
      .expect(200);

    expect(response.body.success).toBe(true);
  });
});
```

## Mock Strategy

### External Services
- **Socket.IO**: Mocked for real-time features
- **Child Process**: Mocked for worker spawning
- **File System**: Using temporary directories
- **Time**: Controllable for timeout testing

### Database
- **Real Database**: Uses actual PostgreSQL for integration
- **Transaction Rollback**: Each test in isolated transaction
- **Test Data**: Factories for consistent test objects

### Redis
- **Redis Memory Server**: In-memory Redis instance
- **Isolation**: Flushed between test suites
- **Real Operations**: Full Redis functionality

## Performance Testing

### Load Testing
Tests verify system behavior under load:
- Rate limiting effectiveness
- Worker scaling behavior
- Database connection pooling
- Cache performance

### Memory Testing
Monitor memory usage during tests:
- Memory leak detection
- Cache size limits
- Garbage collection efficiency

## Test Data Management

### Factories
Consistent test data creation:
```javascript
const createTestUser = async (overrides = {}) => {
  const userData = {
    email: 'test@example.com',
    password: 'securePassword123',
    role: 'user',
    ...overrides
  };
  
  return await User.create(userData);
};
```

### Cleanup
Automatic cleanup between tests:
- Database truncation
- Redis flush
- Mock reset
- Memory cleanup

## Coverage Goals

- **Statements**: > 90%
- **Branches**: > 85%
- **Functions**: > 90%
- **Lines**: > 90%

### Coverage Reports
```bash
npm run test:coverage
open coverage/index.html  # View detailed report
```

## Debugging Tests

### Debug Mode
```bash
npx vitest run --reporter=verbose
npx vitest run tests/specific.test.js --reporter=verbose
```

### Log Output
```bash
LOG_LEVEL=debug npm test
```

### Test Isolation Issues
```bash
# Run tests sequentially
npx vitest run --no-threads

# Run single test file
npx vitest run tests/problematic.test.js
```

## Continuous Integration

### GitHub Actions
Tests run automatically on:
- Pull requests
- Main branch pushes
- Scheduled runs (daily)

### Test Matrix
- Node.js versions: 18, 20
- Database versions: PostgreSQL 14, 15
- Operating systems: Ubuntu, macOS

## Best Practices

### Writing Tests
1. **Descriptive Names**: Clear test descriptions
2. **Single Assertion**: One concept per test
3. **Arrange-Act-Assert**: Clear test structure
4. **Error Testing**: Test both success and failure paths
5. **Edge Cases**: Boundary conditions and limits

### Test Organization
1. **Logical Grouping**: Related tests together
2. **Setup/Teardown**: Proper resource management
3. **Isolation**: Tests don't depend on each other
4. **Performance**: Fast feedback loops

### Maintenance
1. **Regular Updates**: Keep tests current with code
2. **Flaky Tests**: Fix or remove unreliable tests
3. **Coverage Monitoring**: Maintain high coverage
4. **Documentation**: Keep test docs updated

## Troubleshooting

### Common Issues

#### Database Connection Errors
```bash
# Check database is running
pg_ctl status

# Verify test database exists
psql -l | grep claude_api_test

# Reset test database
dropdb claude_api_test && createdb claude_api_test
```

#### Redis Connection Errors
```bash
# Redis Memory Server issues
npm install --save-dev redis-memory-server

# Check Redis availability
redis-cli ping
```

#### Port Conflicts
```bash
# Check port usage
netstat -tulpn | grep :3002
lsof -i :3002

# Kill processes using test ports
kill -9 $(lsof -t -i:3002)
```

#### Memory Issues
```bash
# Increase Node.js memory limit
NODE_OPTIONS="--max-old-space-size=4096" npm test
```

### Getting Help
1. Check test logs for specific error messages
2. Ensure all dependencies are installed
3. Verify environment configuration
4. Run tests in isolation to identify issues
5. Check GitHub Issues for known problems