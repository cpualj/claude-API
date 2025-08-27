import { vi } from 'vitest';

// Mock database functions
export const mockQuery = vi.fn();
export const mockInitDatabase = vi.fn();
export const mockCloseDatabase = vi.fn();
export const mockRunMigrations = vi.fn();

// Mock database module
export const mockDatabase = {
  query: mockQuery,
  initDatabase: mockInitDatabase,
  closeDatabase: mockCloseDatabase,
  runMigrations: mockRunMigrations
};

// Reset all mocks
export const resetDatabaseMocks = () => {
  mockQuery.mockReset();
  mockInitDatabase.mockReset();
  mockCloseDatabase.mockReset();
  mockRunMigrations.mockReset();
  
  // Set up default successful responses
  mockInitDatabase.mockResolvedValue(true);
  mockCloseDatabase.mockResolvedValue(true);
  mockRunMigrations.mockResolvedValue(true);
  mockQuery.mockResolvedValue({ rows: [] });
};

// Initialize mocks with defaults
resetDatabaseMocks();