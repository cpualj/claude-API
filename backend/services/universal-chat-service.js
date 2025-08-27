// Mock Universal Chat Service for testing
export default class UniversalChatService {
  constructor() {
    this.sessions = new Map();
  }

  async chat({ message, toolId, sessionId, userId, apiKeyId }) {
    return {
      success: true,
      response: 'Test response',
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
      },
      toolId,
      sessionId,
    };
  }

  async *streamChat({ message, toolId, sessionId, userId }) {
    yield { type: 'text', content: 'Hello' };
    yield { type: 'text', content: ' world' };
    yield { type: 'done', usage: { totalTokens: 10 } };
  }

  async createSession({ toolId, userId }) {
    const sessionId = Math.random().toString(36).substr(2, 9);
    const session = {
      id: sessionId,
      toolId,
      userId,
      createdAt: new Date(),
      context: [],
    };
    this.sessions.set(sessionId, session);
    return session;
  }

  async getSession(sessionId, userId) {
    return this.sessions.get(sessionId) || null;
  }

  async endSession(sessionId, userId) {
    this.sessions.delete(sessionId);
    return { success: true };
  }

  async listSessions(userId, filters = {}) {
    return Array.from(this.sessions.values()).filter(s => s.userId === userId);
  }

  async getAvailableTools() {
    return [
      {
        id: 'claude',
        name: 'Claude Code',
        enabled: true,
        authStatus: 'authenticated',
      },
    ];
  }

  async validateToolConfig(toolConfig) {
    return {
      valid: true,
      errors: [],
    };
  }
}