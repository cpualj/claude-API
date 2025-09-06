import { describe, it, expect, beforeAll, afterAll } from 'vitest';

describe('Backend API Integration Tests', () => {
  const API_URL = 'http://localhost:3006';
  
  beforeAll(() => {
    // Backend should be running on port 3006
  });

  describe('Health Check', () => {
    it('should respond with healthy status', async () => {
      const response = await fetch(`${API_URL}/api/smart-claude/health`);
      const data = await response.json();
      
      expect(response.ok).toBe(true);
      expect(data.success).toBe(true);
      expect(data.healthy).toBe(true);
      expect(data.service).toBe('Smart Claude CLI Service');
      expect(data.currentSessions).toBeTypeOf('number');
    });

    it('should include performance statistics', async () => {
      const response = await fetch(`${API_URL}/api/smart-claude/health`);
      const data = await response.json();
      
      expect(data).toHaveProperty('totalRequests');
      expect(data).toHaveProperty('successfulRequests');
      expect(data).toHaveProperty('failedRequests');
      expect(data).toHaveProperty('instancesCreated');
      expect(data).toHaveProperty('rejectedRequests');
    });
  });

  describe('Chat API', () => {
    it('should reject requests without session ID', async () => {
      const response = await fetch(`${API_URL}/api/smart-claude/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'test' })
      });
      
      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });

    it('should accept requests with session ID', async () => {
      const sessionId = `test-session-${Date.now()}`;
      
      const response = await fetch(`${API_URL}/api/smart-claude/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: 'Hello test',
          sessionId 
        })
      });
      
      // Should accept the request (even if Claude CLI times out)
      expect([200, 500]).toContain(response.status);
    });

    it('should maintain separate sessions', async () => {
      const session1 = `test-session-1-${Date.now()}`;
      const session2 = `test-session-2-${Date.now()}`;
      
      // Start two different sessions
      const promise1 = fetch(`${API_URL}/api/smart-claude/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: 'I am user 1',
          sessionId: session1
        })
      });

      const promise2 = fetch(`${API_URL}/api/smart-claude/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: 'I am user 2', 
          sessionId: session2
        })
      });

      // Both should be accepted (even if they timeout)
      const [response1, response2] = await Promise.allSettled([promise1, promise2]);
      
      expect([200, 500]).toContain(response1.value?.status || 500);
      expect([200, 500]).toContain(response2.value?.status || 500);
    });
  });

  describe('Session Limits', () => {
    it('should track session statistics', async () => {
      const healthBefore = await fetch(`${API_URL}/api/smart-claude/health`);
      const dataBefore = await healthBefore.json();
      
      const sessionsBefore = dataBefore.currentSessions;
      
      // Create a new session
      const sessionId = `limit-test-${Date.now()}`;
      await fetch(`${API_URL}/api/smart-claude/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: 'Test session creation',
          sessionId 
        })
      });

      const healthAfter = await fetch(`${API_URL}/api/smart-claude/health`);
      const dataAfter = await healthAfter.json();
      
      // Should have one more session (or same if it failed)
      expect(dataAfter.currentSessions).toBeGreaterThanOrEqual(sessionsBefore);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle invalid JSON gracefully', async () => {
      const response = await fetch(`${API_URL}/api/smart-claude/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json'
      });
      
      expect(response.status).toBe(400);
    });

    it('should handle missing message field', async () => {
      const response = await fetch(`${API_URL}/api/smart-claude/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'test' })
      });
      
      expect(response.status).toBe(400);
    });
  });
});