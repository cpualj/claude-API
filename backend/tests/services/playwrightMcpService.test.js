import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import playwrightMcpService from '../../services/playwrightMcpService.js';

describe('PlaywrightMcpService', () => {
  beforeEach(() => {
    // Reset service state before each test
    playwrightMcpService.browsers.clear();
    playwrightMcpService.initialized = false;
  });

  afterEach(() => {
    // Clean up after each test
    playwrightMcpService.browsers.clear();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      const listener = vi.fn();
      playwrightMcpService.on('initialized', listener);
      
      await playwrightMcpService.initialize();
      
      expect(playwrightMcpService.initialized).toBe(true);
      expect(listener).toHaveBeenCalled();
    });

    it('should not reinitialize if already initialized', async () => {
      await playwrightMcpService.initialize();
      const listener = vi.fn();
      playwrightMcpService.on('initialized', listener);
      
      await playwrightMcpService.initialize();
      
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('browser management', () => {
    beforeEach(async () => {
      await playwrightMcpService.initialize();
    });

    it('should create a browser instance', async () => {
      const browserId = 'test-browser-1';
      const browser = await playwrightMcpService.createBrowser(browserId);
      
      expect(browser).toBeDefined();
      expect(browser.id).toBe(browserId);
      expect(browser.createdAt).toBeDefined();
      expect(browser.isReady).toBe(true);
      expect(playwrightMcpService.browsers.has(browserId)).toBe(true);
    });

    it('should navigate browser to Claude', async () => {
      const browserId = 'test-browser-2';
      await playwrightMcpService.createBrowser(browserId);
      
      const browser = await playwrightMcpService.navigateToClaude(browserId);
      
      expect(browser.currentUrl).toBe(playwrightMcpService.claudeUrl);
      expect(browser.isReady).toBe(true);
    });

    it('should throw error for non-existent browser', async () => {
      await expect(playwrightMcpService.navigateToClaude('non-existent'))
        .rejects.toThrow('Browser non-existent not found');
    });

    it('should close a browser', async () => {
      const browserId = 'test-browser-3';
      await playwrightMcpService.createBrowser(browserId);
      
      const listener = vi.fn();
      playwrightMcpService.on('browserClosed', listener);
      
      const result = await playwrightMcpService.closeBrowser(browserId);
      
      expect(result).toBe(true);
      expect(playwrightMcpService.browsers.has(browserId)).toBe(false);
      expect(listener).toHaveBeenCalledWith({ browserId });
    });

    it('should handle closing non-existent browser gracefully', async () => {
      const result = await playwrightMcpService.closeBrowser('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('message handling', () => {
    const browserId = 'test-browser-msg';
    
    beforeEach(async () => {
      await playwrightMcpService.initialize();
      await playwrightMcpService.createBrowser(browserId);
    });

    it('should send a message', async () => {
      const message = 'Hello Claude';
      const listener = vi.fn();
      playwrightMcpService.on('messageSent', listener);
      
      const response = await playwrightMcpService.sendMessage(browserId, message);
      
      expect(response).toBeDefined();
      expect(response.browserId).toBe(browserId);
      expect(response.messageId).toMatch(/^msg-/);
      expect(response.request.message).toBe(message);
      expect(response.status).toBe('pending');
      expect(listener).toHaveBeenCalledWith(response);
      
      const browser = playwrightMcpService.browsers.get(browserId);
      expect(browser.messageCount).toBe(1);
    });

    it('should throw error when browser not ready', async () => {
      const browser = playwrightMcpService.browsers.get(browserId);
      browser.isReady = false;
      
      await expect(playwrightMcpService.sendMessage(browserId, 'Test'))
        .rejects.toThrow(`Browser ${browserId} is not ready`);
    });

    it('should wait for response with timeout', async () => {
      const messageId = 'test-msg-1';
      
      // Start waiting for response
      const waitPromise = playwrightMcpService.waitForResponse(browserId, messageId, 100);
      
      // Should timeout after 100ms
      await expect(waitPromise).rejects.toThrow(`Timeout waiting for response from browser ${browserId}`);
    });

    it('should receive response when emitted', async () => {
      const messageId = 'test-msg-2';
      const responseContent = 'This is the response';
      
      // Start waiting for response
      const waitPromise = playwrightMcpService.waitForResponse(browserId, messageId, 1000);
      
      // Simulate response after 50ms
      setTimeout(() => {
        playwrightMcpService.simulateResponse(messageId, responseContent);
      }, 50);
      
      const response = await waitPromise;
      expect(response.content).toBe(responseContent);
      expect(response.timestamp).toBeDefined();
      expect(response.duration).toBeDefined();
    });
  });

  describe('browser health checks', () => {
    beforeEach(async () => {
      await playwrightMcpService.initialize();
    });

    it('should report healthy browser', async () => {
      const browserId = 'healthy-browser';
      await playwrightMcpService.createBrowser(browserId);
      
      const health = await playwrightMcpService.checkBrowserHealth(browserId);
      
      expect(health.healthy).toBe(true);
      expect(health.browser).toBeDefined();
    });

    it('should report unhealthy for non-existent browser', async () => {
      const health = await playwrightMcpService.checkBrowserHealth('non-existent');
      
      expect(health.healthy).toBe(false);
      expect(health.reason).toBe('Browser not found');
    });

    it('should report unhealthy for inactive browser', async () => {
      const browserId = 'inactive-browser';
      await playwrightMcpService.createBrowser(browserId);
      
      const browser = playwrightMcpService.browsers.get(browserId);
      browser.lastActivity = Date.now() - 700000; // 11+ minutes ago
      
      const health = await playwrightMcpService.checkBrowserHealth(browserId);
      
      expect(health.healthy).toBe(false);
      expect(health.reason).toContain('inactive');
    });

    it('should report unhealthy for overused browser', async () => {
      const browserId = 'overused-browser';
      await playwrightMcpService.createBrowser(browserId);
      
      const browser = playwrightMcpService.browsers.get(browserId);
      browser.messageCount = 101;
      
      const health = await playwrightMcpService.checkBrowserHealth(browserId);
      
      expect(health.healthy).toBe(false);
      expect(health.reason).toContain('too many messages');
    });
  });

  describe('statistics', () => {
    beforeEach(async () => {
      await playwrightMcpService.initialize();
      await playwrightMcpService.createBrowser('browser-1');
      await playwrightMcpService.createBrowser('browser-2');
    });

    it('should get stats for a single browser', () => {
      const stats = playwrightMcpService.getBrowserStats('browser-1');
      
      expect(stats).toBeDefined();
      expect(stats.id).toBe('browser-1');
      expect(stats.createdAt).toBeDefined();
      expect(stats.messageCount).toBe(0);
      expect(stats.isReady).toBe(true);
      expect(stats.uptime).toBeGreaterThanOrEqual(0);
    });

    it('should return null for non-existent browser stats', () => {
      const stats = playwrightMcpService.getBrowserStats('non-existent');
      expect(stats).toBeNull();
    });

    it('should get stats for all browsers', () => {
      const stats = playwrightMcpService.getAllBrowserStats();
      
      expect(stats).toBeInstanceOf(Array);
      expect(stats).toHaveLength(2);
      expect(stats[0].id).toBeDefined();
      expect(stats[1].id).toBeDefined();
    });
  });

  describe('browser recycling', () => {
    beforeEach(async () => {
      await playwrightMcpService.initialize();
    });

    it('should recycle all browsers', async () => {
      await playwrightMcpService.createBrowser('browser-1');
      await playwrightMcpService.createBrowser('browser-2');
      await playwrightMcpService.createBrowser('browser-3');
      
      expect(playwrightMcpService.browsers.size).toBe(3);
      
      await playwrightMcpService.recycleAllBrowsers();
      
      expect(playwrightMcpService.browsers.size).toBe(0);
    });

    it('should handle empty browser list', async () => {
      await playwrightMcpService.recycleAllBrowsers();
      expect(playwrightMcpService.browsers.size).toBe(0);
    });
  });

  describe('response extraction', () => {
    beforeEach(async () => {
      await playwrightMcpService.initialize();
    });

    it('should extract response from browser', async () => {
      const browserId = 'extract-browser';
      await playwrightMcpService.createBrowser(browserId);
      
      const extraction = await playwrightMcpService.extractResponse(browserId);
      
      expect(extraction).toBeDefined();
      expect(extraction.browserId).toBe(browserId);
      expect(extraction.timestamp).toBeDefined();
      // Content will be null in mock, but structure should be there
      expect(extraction).toHaveProperty('content');
    });

    it('should throw error for non-existent browser', async () => {
      await expect(playwrightMcpService.extractResponse('non-existent'))
        .rejects.toThrow('Browser non-existent not found');
    });
  });

  describe('shutdown', () => {
    beforeEach(async () => {
      await playwrightMcpService.initialize();
      await playwrightMcpService.createBrowser('browser-1');
      await playwrightMcpService.createBrowser('browser-2');
    });

    it('should shutdown cleanly', async () => {
      const listener = vi.fn();
      playwrightMcpService.on('shutdown', listener);
      
      await playwrightMcpService.shutdown();
      
      expect(playwrightMcpService.initialized).toBe(false);
      expect(playwrightMcpService.browsers.size).toBe(0);
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('event emissions', () => {
    beforeEach(async () => {
      await playwrightMcpService.initialize();
    });

    it('should emit messageSent event', async () => {
      const browserId = 'event-browser';
      await playwrightMcpService.createBrowser(browserId);
      
      const listener = vi.fn();
      playwrightMcpService.on('messageSent', listener);
      
      await playwrightMcpService.sendMessage(browserId, 'Test message');
      
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          browserId,
          status: 'pending'
        })
      );
    });

    it('should emit browserClosed event', async () => {
      const browserId = 'close-event-browser';
      await playwrightMcpService.createBrowser(browserId);
      
      const listener = vi.fn();
      playwrightMcpService.on('browserClosed', listener);
      
      await playwrightMcpService.closeBrowser(browserId);
      
      expect(listener).toHaveBeenCalledWith({ browserId });
    });
  });
});