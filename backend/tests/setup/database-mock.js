import { vi } from 'vitest';

// Mock PostgreSQL client
export const mockPgClient = {
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: vi.fn().mockResolvedValue(),
  end: vi.fn().mockResolvedValue(),
  release: vi.fn()
};

export const mockPgPool = {
  query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  connect: vi.fn().mockResolvedValue(mockPgClient),
  end: vi.fn().mockResolvedValue(),
  on: vi.fn()
};

// Mock Redis client
export const mockRedisClient = {
  connect: vi.fn().mockResolvedValue(),
  disconnect: vi.fn().mockResolvedValue(),
  quit: vi.fn().mockResolvedValue(),
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue('OK'),
  setex: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  exists: vi.fn().mockResolvedValue(0),
  expire: vi.fn().mockResolvedValue(1),
  ttl: vi.fn().mockResolvedValue(-1),
  ping: vi.fn().mockResolvedValue('PONG'),
  on: vi.fn(),
  off: vi.fn()
};

// Mock database initialization
export const mockInitDatabase = vi.fn().mockResolvedValue({
  pool: mockPgPool,
  client: mockPgClient
});

// Mock session manager
export const mockSessionManager = {
  createSession: vi.fn().mockResolvedValue({
    sessionId: 'mock-session-id',
    userId: 'mock-user-id',
    createdAt: new Date()
  }),
  getSession: vi.fn().mockResolvedValue(null),
  updateSession: vi.fn().mockResolvedValue(true),
  deleteSession: vi.fn().mockResolvedValue(true),
  validateSession: vi.fn().mockResolvedValue(false),
  cleanupSessions: vi.fn().mockResolvedValue(0)
};

// Mock user functions
export const mockUserFunctions = {
  createUser: vi.fn().mockResolvedValue({
    id: 'mock-user-id',
    username: 'testuser',
    email: 'test@example.com'
  }),
  getUserById: vi.fn().mockResolvedValue(null),
  getUserByUsername: vi.fn().mockResolvedValue(null),
  updateUser: vi.fn().mockResolvedValue(true),
  deleteUser: vi.fn().mockResolvedValue(true),
  validateCredentials: vi.fn().mockResolvedValue(false)
};

// Setup mocks for database modules
vi.mock('../../db/init.js', () => ({
  initDatabase: mockInitDatabase,
  pool: mockPgPool
}));

vi.mock('pg', () => ({
  Pool: vi.fn().mockImplementation(() => mockPgPool),
  Client: vi.fn().mockImplementation(() => mockPgClient)
}));

vi.mock('redis', () => ({
  createClient: vi.fn().mockReturnValue(mockRedisClient)
}));

vi.mock('../../services/sessionManager.js', () => ({
  default: mockSessionManager,
  SessionManager: vi.fn().mockImplementation(() => mockSessionManager)
}));

// Mock environment variables
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.SESSION_SECRET = 'test-session-secret';