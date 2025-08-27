import { vi } from 'vitest';

const UniversalChatService = vi.fn();

UniversalChatService.mockImplementation(() => ({
  chat: vi.fn(),
  streamChat: vi.fn(),
  createSession: vi.fn(),
  getSession: vi.fn(),
  endSession: vi.fn(),
  listSessions: vi.fn(),
  getAvailableTools: vi.fn(),
  validateToolConfig: vi.fn(),
}));

export default UniversalChatService;