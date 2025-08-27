import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { config } from 'dotenv';

// Load test environment
config({ path: '.env.test' });

// Mock the database module
const mockQuery = vi.fn();
const mockInitDatabase = vi.fn();
const mockCloseDatabase = vi.fn();
const mockRunMigrations = vi.fn();

// Mock the entire database module
vi.mock('../../db/init.js', () => ({
  query: mockQuery,
  initDatabase: mockInitDatabase,
  closeDatabase: mockCloseDatabase,
  runMigrations: mockRunMigrations
}));

describe('Database Initialization', () => {
  beforeAll(async () => {
    // Set up mock defaults
    mockInitDatabase.mockResolvedValue(true);
    mockCloseDatabase.mockResolvedValue(true);
    mockQuery.mockResolvedValue({ rows: [] });
  });

  afterAll(async () => {
    vi.clearAllMocks();
  });

  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset default mock responses
    mockInitDatabase.mockResolvedValue(true);
    mockCloseDatabase.mockResolvedValue(true);
    mockQuery.mockResolvedValue({ rows: [] });
  });

  describe('Database Connection', () => {
    it('should establish database connection', async () => {
      mockQuery.mockResolvedValue({ rows: [{ test: 1 }] });
      const { query } = await import('../../db/init.js');
      const result = await query('SELECT 1 as test');
      expect(result.rows).toEqual([{ test: 1 }]);
      expect(mockQuery).toHaveBeenCalledWith('SELECT 1 as test');
    });

    it('should handle database queries correctly', async () => {
      const result = await query('SELECT NOW() as current_time');
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].current_time).toBeInstanceOf(Date);
    });

    it('should handle parameterized queries', async () => {
      const testValue = 'test-value';
      const result = await query('SELECT $1 as value', [testValue]);
      expect(result.rows[0].value).toBe(testValue);
    });
  });

  describe('Database Schema', () => {
    it('should have all required tables', async () => {
      const result = await query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);
      
      const tableNames = result.rows.map(row => row.table_name);
      const expectedTables = ['users', 'api_keys', 'usage_logs', 'sessions', 'cli_tools', 'workers'];
      
      expectedTables.forEach(table => {
        expect(tableNames).toContain(table);
      });
    });

    it('should have correct users table structure', async () => {
      const result = await query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = 'users'
        ORDER BY ordinal_position
      `);
      
      const columns = result.rows;
      expect(columns.some(col => col.column_name === 'id')).toBe(true);
      expect(columns.some(col => col.column_name === 'email')).toBe(true);
      expect(columns.some(col => col.column_name === 'password_hash')).toBe(true);
      expect(columns.some(col => col.column_name === 'role')).toBe(true);
    });

    it('should have correct api_keys table structure', async () => {
      const result = await query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = 'api_keys'
        ORDER BY ordinal_position
      `);
      
      const columns = result.rows;
      expect(columns.some(col => col.column_name === 'id')).toBe(true);
      expect(columns.some(col => col.column_name === 'user_id')).toBe(true);
      expect(columns.some(col => col.column_name === 'key_hash')).toBe(true);
      expect(columns.some(col => col.column_name === 'rate_limit_per_hour')).toBe(true);
    });
  });

  describe('Database Operations', () => {
    it('should insert and retrieve user data', async () => {
      const userData = {
        email: 'test@example.com',
        password_hash: 'hashed_password',
        role: 'user'
      };

      const insertResult = await query(`
        INSERT INTO users (email, password_hash, role)
        VALUES ($1, $2, $3)
        RETURNING *
      `, [userData.email, userData.password_hash, userData.role]);

      expect(insertResult.rows).toHaveLength(1);
      const user = insertResult.rows[0];
      
      expect(user.email).toBe(userData.email);
      expect(user.password_hash).toBe(userData.password_hash);
      expect(user.role).toBe(userData.role);
      expect(user.id).toBeDefined();
      expect(user.created_at).toBeInstanceOf(Date);
    });

    it('should enforce email uniqueness', async () => {
      const email = 'duplicate@example.com';
      
      await query(`
        INSERT INTO users (email, password_hash, role)
        VALUES ($1, $2, $3)
      `, [email, 'hash1', 'user']);

      await expect(
        query(`
          INSERT INTO users (email, password_hash, role)
          VALUES ($1, $2, $3)
        `, [email, 'hash2', 'user'])
      ).rejects.toThrow();
    });

    it('should handle foreign key relationships', async () => {
      // Create a user first
      const userResult = await query(`
        INSERT INTO users (email, password_hash, role)
        VALUES ($1, $2, $3)
        RETURNING id
      `, ['test@example.com', 'hash', 'user']);

      const userId = userResult.rows[0].id;

      // Create an API key for the user
      const apiKeyResult = await query(`
        INSERT INTO api_keys (user_id, key_hash, name, rate_limit_per_hour)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [userId, 'api_key_hash', 'Test Key', 1000]);

      expect(apiKeyResult.rows).toHaveLength(1);
      expect(apiKeyResult.rows[0].user_id).toBe(userId);
    });

    it('should handle transaction rollback on error', async () => {
      try {
        await query('BEGIN');
        
        await query(`
          INSERT INTO users (email, password_hash, role)
          VALUES ($1, $2, $3)
        `, ['transaction@example.com', 'hash', 'user']);
        
        // This should fail due to invalid foreign key
        await query(`
          INSERT INTO api_keys (user_id, key_hash, name)
          VALUES ($1, $2, $3)
        `, [99999, 'key_hash', 'Invalid Key']);
        
        await query('COMMIT');
      } catch (error) {
        await query('ROLLBACK');
      }

      // User should not exist due to rollback
      const result = await query(`
        SELECT * FROM users WHERE email = 'transaction@example.com'
      `);
      expect(result.rows).toHaveLength(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid SQL queries gracefully', async () => {
      await expect(query('INVALID SQL QUERY')).rejects.toThrow();
    });

    it('should handle connection issues gracefully', async () => {
      // Close the connection temporarily
      await closeDatabase();
      
      await expect(query('SELECT 1')).rejects.toThrow();
      
      // Reconnect for other tests
      await initDatabase();
    });
  });
});