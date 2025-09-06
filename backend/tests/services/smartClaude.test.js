import { describe, it, expect } from 'vitest';
import smartClaudeCliService from '../../services/smartClaudeCliService.js';

describe('SmartClaudeCliService', () => {
  describe('Service Health', () => {
    it('should be properly initialized', () => {
      expect(smartClaudeCliService).toBeDefined();
      expect(typeof smartClaudeCliService.healthCheck).toBe('function');
      expect(typeof smartClaudeCliService.sendMessage).toBe('function');
    });

    it('should return health status', async () => {
      const health = await smartClaudeCliService.healthCheck();
      
      expect(health.healthy).toBe(true);
      expect(health.service).toBe('Smart Claude CLI Service');
      expect(typeof health.currentSessions).toBe('number');
      expect(typeof health.instancesCreated).toBe('number');
    });
  });

  describe('Session Management', () => {
    it('should require sessionId for sendMessage', async () => {
      await expect(
        smartClaudeCliService.sendMessage('test message')
      ).rejects.toThrow('Session ID is required');
    });

    it('should handle session statistics', async () => {
      const statsBefore = await smartClaudeCliService.healthCheck();
      const sessionsBefore = statsBefore.currentSessions;
      
      expect(typeof sessionsBefore).toBe('number');
      expect(sessionsBefore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Instance Limits', () => {
    it('should have maximum instance limit', () => {
      expect(smartClaudeCliService.maxInstances).toBeDefined();
      expect(typeof smartClaudeCliService.maxInstances).toBe('number');
      expect(smartClaudeCliService.maxInstances).toBeGreaterThan(0);
    });

    it('should track statistics properly', async () => {
      const stats = smartClaudeCliService.getStats();
      
      expect(stats).toHaveProperty('totalRequests');
      expect(stats).toHaveProperty('successfulRequests');
      expect(stats).toHaveProperty('failedRequests');
      expect(stats).toHaveProperty('instancesCreated');
      expect(stats).toHaveProperty('rejectedRequests');
      expect(stats).toHaveProperty('currentSessions');
    });
  });
});