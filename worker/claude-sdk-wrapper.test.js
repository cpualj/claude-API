import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import ClaudeSDKWrapper from './claude-sdk-wrapper.js';

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn(),
    },
  })),
}));

// Mock fs/promises
vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
  },
}));

describe('ClaudeSDKWrapper', () => {
  let wrapper;
  let mockAnthropicClient;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Setup environment
    process.env.CLAUDE_API_KEY = 'test-api-key';
    
    // Create wrapper instance
    wrapper = new ClaudeSDKWrapper({
      apiKey: 'test-api-key',
      model: 'claude-3-sonnet',
      maxTokens: 2000,
      sessionDir: '/test/sessions',
    });

    // Get mock client
    mockAnthropicClient = wrapper.client;
  });

  afterEach(() => {
    delete process.env.CLAUDE_API_KEY;
  });

  describe('Initialization', () => {
    it('should initialize with provided config', () => {
      expect(wrapper.apiKey).toBe('test-api-key');
      expect(wrapper.model).toBe('claude-3-sonnet');
      expect(wrapper.maxTokens).toBe(2000);
      expect(wrapper.sessionDir).toBe('/test/sessions');
    });

    it('should use environment variables as fallback', () => {
      process.env.CLAUDE_MODEL = 'claude-3-opus';
      process.env.MAX_TOKENS = '4096';
      
      const envWrapper = new ClaudeSDKWrapper();
      
      expect(envWrapper.apiKey).toBe('test-api-key');
      expect(envWrapper.model).toBe('claude-3-opus');
      expect(envWrapper.maxTokens).toBe(4096);
    });

    it('should throw error if no API key is provided', () => {
      delete process.env.CLAUDE_API_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      
      expect(() => new ClaudeSDKWrapper()).toThrow(
        'No API key found. Please set CLAUDE_API_KEY or ANTHROPIC_API_KEY'
      );
    });
  });

  describe('Session Management', () => {
    it('should create a new session', () => {
      const session = wrapper.createSession();
      
      expect(session.id).toBeDefined();
      expect(session.messages).toEqual([]);
      expect(session.createdAt).toBeInstanceOf(Date);
      expect(session.lastActivity).toBeInstanceOf(Date);
      expect(wrapper.sessions.has(session.id)).toBe(true);
    });

    it('should create session with custom ID', () => {
      const customId = 'custom-session-123';
      const session = wrapper.createSession(customId);
      
      expect(session.id).toBe(customId);
      expect(wrapper.sessions.has(customId)).toBe(true);
    });

    it('should get existing session', () => {
      const session = wrapper.createSession('test-session');
      const retrieved = wrapper.getSession('test-session');
      
      expect(retrieved).toBe(session);
    });

    it('should load session from file if not in memory', async () => {
      const mockSession = {
        id: 'file-session',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there!' },
        ],
        createdAt: new Date(),
        lastActivity: new Date(),
      };

      const fs = await import('fs/promises');
      fs.default.readFile.mockResolvedValueOnce(JSON.stringify(mockSession));

      await wrapper.loadSessionFromFile('file-session');
      const session = wrapper.getSession('file-session');
      
      expect(session).toEqual(mockSession);
      expect(fs.default.readFile).toHaveBeenCalledWith(
        '/test/sessions/file-session.json',
        'utf8'
      );
    });

    it('should cleanup expired sessions', async () => {
      const oldSession = wrapper.createSession('old-session');
      const newSession = wrapper.createSession('new-session');
      
      // Make old session expired
      oldSession.lastActivity = new Date(Date.now() - 7200000); // 2 hours ago
      newSession.lastActivity = new Date();
      
      await wrapper.cleanupSessions(3600000); // 1 hour max age
      
      expect(wrapper.sessions.has('old-session')).toBe(false);
      expect(wrapper.sessions.has('new-session')).toBe(true);
    });
  });

  describe('Message Sending', () => {
    it('should send message successfully', async () => {
      const mockResponse = {
        content: [{ text: 'Hello! How can I help you?' }],
        usage: {
          input_tokens: 10,
          output_tokens: 20,
        },
      };

      mockAnthropicClient.messages.create.mockResolvedValueOnce(mockResponse);

      const result = await wrapper.sendMessage('Hello Claude', null, {
        temperature: 0.5,
      });

      expect(result.success).toBe(true);
      expect(result.response).toBe('Hello! How can I help you?');
      expect(result.usage).toEqual({
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
      });
      
      expect(mockAnthropicClient.messages.create).toHaveBeenCalledWith({
        model: 'claude-3-sonnet',
        max_tokens: 2000,
        messages: [{ role: 'user', content: 'Hello Claude' }],
        temperature: 0.5,
      });
    });

    it('should maintain conversation context in session', async () => {
      const session = wrapper.createSession('test-session');
      
      mockAnthropicClient.messages.create.mockResolvedValueOnce({
        content: [{ text: 'First response' }],
        usage: { input_tokens: 10, output_tokens: 20 },
      });

      await wrapper.sendMessage('First message', 'test-session');

      expect(session.messages).toHaveLength(2);
      expect(session.messages[0]).toEqual({
        role: 'user',
        content: 'First message',
      });
      expect(session.messages[1]).toEqual({
        role: 'assistant',
        content: 'First response',
      });
    });

    it('should limit context to last 10 messages', async () => {
      const session = wrapper.createSession('test-session');
      
      // Add 12 messages to session
      for (let i = 0; i < 12; i++) {
        session.messages.push({
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`,
        });
      }

      mockAnthropicClient.messages.create.mockResolvedValueOnce({
        content: [{ text: 'Response' }],
        usage: { input_tokens: 10, output_tokens: 20 },
      });

      await wrapper.sendMessage('New message', 'test-session');

      // Check that only last 10 messages were sent
      const callArgs = mockAnthropicClient.messages.create.mock.calls[0][0];
      expect(callArgs.messages).toHaveLength(10);
      expect(callArgs.messages[0].content).toBe('Message 3'); // Should start from message 3
    });

    it('should handle API errors gracefully', async () => {
      mockAnthropicClient.messages.create.mockRejectedValueOnce(
        new Error('API Error: Rate limit exceeded')
      );

      const result = await wrapper.sendMessage('Hello');

      expect(result.success).toBe(false);
      expect(result.error).toBe('API Error: Rate limit exceeded');
    });

    it('should use system prompt if provided', async () => {
      mockAnthropicClient.messages.create.mockResolvedValueOnce({
        content: [{ text: 'Response' }],
        usage: { input_tokens: 10, output_tokens: 20 },
      });

      await wrapper.sendMessage('Message', null, {
        systemPrompt: 'You are a helpful assistant',
      });

      const callArgs = mockAnthropicClient.messages.create.mock.calls[0][0];
      expect(callArgs.system).toBe('You are a helpful assistant');
    });
  });

  describe('Streaming Messages', () => {
    it('should stream message chunks', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'content_block_delta',
            delta: { text: 'Hello' },
          };
          yield {
            type: 'content_block_delta',
            delta: { text: ' world' },
          };
          yield {
            type: 'message_stop',
            usage: { total_tokens: 15 },
          };
        },
      };

      mockAnthropicClient.messages.create.mockResolvedValueOnce(mockStream);

      const chunks = [];
      const stream = wrapper.streamMessage('Test message');

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toEqual({
        type: 'text',
        content: 'Hello',
        sessionId: expect.any(String),
      });
      expect(chunks[1]).toEqual({
        type: 'text',
        content: ' world',
        sessionId: expect.any(String),
      });
      expect(chunks[2]).toMatchObject({
        type: 'done',
        usage: { total_tokens: 15 },
      });
    });

    it('should handle stream errors', async () => {
      mockAnthropicClient.messages.create.mockRejectedValueOnce(
        new Error('Stream error')
      );

      const chunks = [];
      const stream = wrapper.streamMessage('Test message');

      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toEqual({
        type: 'error',
        error: 'Stream error',
      });
    });

    it('should save complete response to session after streaming', async () => {
      const session = wrapper.createSession('stream-session');
      
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'content_block_delta',
            delta: { text: 'Complete' },
          };
          yield {
            type: 'content_block_delta',
            delta: { text: ' response' },
          };
          yield {
            type: 'message_stop',
            usage: { total_tokens: 20 },
          };
        },
      };

      mockAnthropicClient.messages.create.mockResolvedValueOnce(mockStream);

      const stream = wrapper.streamMessage('Stream test', 'stream-session');
      const chunks = [];
      
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      expect(session.messages).toHaveLength(2);
      expect(session.messages[1]).toEqual({
        role: 'assistant',
        content: 'Complete response',
      });
    });
  });

  describe('Session Persistence', () => {
    it('should save session to file', async () => {
      const fs = await import('fs/promises');
      fs.default.mkdir.mockResolvedValueOnce();
      fs.default.writeFile.mockResolvedValueOnce();

      const session = {
        id: 'test-session',
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi!' },
        ],
        createdAt: new Date(),
        lastActivity: new Date(),
      };

      await wrapper.saveSessionToFile(session);

      expect(fs.default.mkdir).toHaveBeenCalledWith(
        '/test/sessions',
        { recursive: true }
      );
      const expectedPath = process.platform === 'win32' 
        ? '\\test\\sessions\\test-session.json'
        : '/test/sessions/test-session.json';
      expect(fs.default.writeFile).toHaveBeenCalledWith(
        expectedPath,
        JSON.stringify(session, null, 2)
      );
    });

    it('should handle save errors gracefully', async () => {
      const fs = await import('fs/promises');
      fs.default.writeFile.mockRejectedValueOnce(new Error('Write failed'));

      const session = {
        id: 'error-session',
        messages: [],
      };

      // Should not throw, just log error
      await expect(wrapper.saveSessionToFile(session)).resolves.toBeUndefined();
    });

    it('should load session from file', async () => {
      const fs = await import('fs/promises');
      const mockSession = {
        id: 'loaded-session',
        messages: [
          { role: 'user', content: 'Previous message' },
        ],
        createdAt: '2024-01-01T00:00:00Z',
        lastActivity: '2024-01-01T01:00:00Z',
      };

      fs.default.readFile.mockResolvedValueOnce(JSON.stringify(mockSession));

      const session = await wrapper.loadSessionFromFile('loaded-session');

      expect(session).toEqual(mockSession);
      expect(wrapper.sessions.has('loaded-session')).toBe(true);
    });

    it('should return null if session file not found', async () => {
      const fs = await import('fs/promises');
      fs.default.readFile.mockRejectedValueOnce(new Error('File not found'));

      const session = await wrapper.loadSessionFromFile('missing-session');

      expect(session).toBeNull();
    });
  });

  describe('Token Estimation', () => {
    it('should estimate tokens from text', () => {
      // Mock the internal estimation (since it's simple)
      const input = 'Hello world';
      const output = 'This is a longer response with more words';
      
      const result = wrapper.estimateTokens(input, output);
      
      // Rough estimation: 4 chars = 1 token
      expect(result.inputTokens).toBe(Math.ceil(input.length / 4));
      expect(result.outputTokens).toBe(Math.ceil(output.length / 4));
      expect(result.totalTokens).toBe(
        result.inputTokens + result.outputTokens
      );
    });
  });
});