import { beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { config } from 'dotenv';

// Load test environment variables
config({ path: '.env.test' });

// Set up test environment
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'mock://test-database';
process.env.REDIS_URL = 'mock://test-redis';
process.env.JWT_SECRET = 'test-jwt-secret';

// Global test cleanup
beforeAll(async () => {
  // Set up global mocks
  vi.clearAllMocks();
});

afterAll(async () => {
  // Clean up after all tests
  vi.clearAllMocks();
});

// Clean up between tests
beforeEach(async () => {
  // Reset mocks before each test
  vi.clearAllMocks();
});

afterEach(async () => {
  // Clean up after each test
  vi.clearAllMocks();
});