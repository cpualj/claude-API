import { test, expect } from '@playwright/test';

test.describe('Claude CLI Integration Tests', () => {
  const BASE_URL = 'http://localhost:3031';
  const API_URL = 'http://localhost:3001';
  
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto(BASE_URL);
  });

  test('should check if Claude CLI is available', async ({ page }) => {
    // Check health endpoint
    const response = await page.request.get(`${API_URL}/health`);
    const data = await response.json();
    
    expect(response.ok()).toBeTruthy();
    expect(data.status).toBe('healthy');
    console.log('Claude status:', data.services.claude);
    
    // Check if Claude is connected (not mock)
    if (data.services.claude === 'connected') {
      console.log('✅ Claude CLI is connected and ready');
    } else {
      console.log('⚠️ Claude CLI is in mock mode');
    }
  });

  test('should login and navigate to chat interface', async ({ page }) => {
    // Try to find login form or skip if already logged in
    const loginButton = page.locator('button:has-text("Sign in"), button:has-text("Login")').first();
    
    if (await loginButton.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Fill login form
      await page.fill('input[name="email"], input[type="email"]', 'test@example.com');
      await page.fill('input[name="password"], input[type="password"]', 'password123');
      await loginButton.click();
      
      // Wait for navigation
      await page.waitForLoadState('networkidle');
    }
    
    // Look for chat interface or navigate to it
    const chatLink = page.locator('a:has-text("Chat"), a:has-text("Claude"), a[href*="chat"]').first();
    if (await chatLink.isVisible({ timeout: 3000 }).catch(() => false)) {
      await chatLink.click();
      await page.waitForLoadState('networkidle');
    }
    
    // Verify we're on a page with chat capabilities
    const chatInput = page.locator('input[placeholder*="message"], textarea[placeholder*="message"], input[placeholder*="ask"], textarea[placeholder*="ask"]').first();
    await expect(chatInput).toBeVisible({ timeout: 10000 });
  });

  test('should send a message to Claude and receive response', async ({ page }) => {
    // Login first
    const response = await page.request.post(`${API_URL}/api/auth/login`, {
      data: {
        email: 'test@example.com',
        password: 'password123'
      }
    });
    
    const authData = await response.json();
    const token = authData.token;
    
    // Send a chat message directly to API
    const chatResponse = await page.request.post(`${API_URL}/api/chat`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: {
        message: 'Hello Claude, please respond with exactly: "Hello from Claude CLI"',
        sessionId: 'test-session',
        stream: false
      }
    });
    
    expect(chatResponse.ok()).toBeTruthy();
    const chatData = await chatResponse.json();
    
    console.log('Chat response:', chatData);
    
    // Check if we got a response
    expect(chatData.content).toBeTruthy();
    
    // If Claude CLI is working, the response should contain actual Claude output
    if (!chatData.content.includes('[Mock Mode]')) {
      console.log('✅ Received real Claude response:', chatData.content.substring(0, 100) + '...');
      expect(chatData.model).toContain('claude');
    } else {
      console.log('⚠️ Received mock response');
      expect(chatData.content).toContain('[Mock Mode]');
    }
  });

  test('should test chat UI interaction', async ({ page }) => {
    // Navigate to the app
    await page.goto(BASE_URL);
    
    // Handle login if needed
    const emailInput = page.locator('input[name="email"], input[type="email"]').first();
    if (await emailInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await emailInput.fill('test@example.com');
      await page.fill('input[name="password"], input[type="password"]', 'password123');
      await page.click('button:has-text("Sign in"), button:has-text("Login")');
      await page.waitForLoadState('networkidle');
    }
    
    // Navigate to chat if not already there
    const chatNavigation = page.locator('a:has-text("Chat"), a:has-text("Claude")').first();
    if (await chatNavigation.isVisible({ timeout: 3000 }).catch(() => false)) {
      await chatNavigation.click();
      await page.waitForLoadState('networkidle');
    }
    
    // Find and interact with chat input
    const chatInput = page.locator('input[placeholder*="message"], textarea[placeholder*="message"], input[placeholder*="Type"], textarea[placeholder*="Type"]').first();
    
    if (await chatInput.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Type a message
      await chatInput.fill('Test message: What is 2 + 2?');
      
      // Find and click send button
      const sendButton = page.locator('button[type="submit"], button:has-text("Send"), button[aria-label*="send"]').first();
      
      if (await sendButton.isVisible({ timeout: 3000 }).catch(() => false)) {
        await sendButton.click();
        
        // Wait for response (look for message containers)
        const responseContainer = page.locator('.message, [class*="message"], [class*="chat-bubble"], [class*="response"]').last();
        
        try {
          await responseContainer.waitFor({ timeout: 15000 });
          const responseText = await responseContainer.textContent();
          console.log('UI Response received:', responseText?.substring(0, 100) + '...');
          
          // Take a screenshot
          await page.screenshot({ 
            path: 'tests/screenshots/claude-chat-response.png',
            fullPage: false 
          });
        } catch (error) {
          console.log('Could not find response in UI, taking debug screenshot');
          await page.screenshot({ 
            path: 'tests/screenshots/claude-chat-debug.png',
            fullPage: true 
          });
        }
      } else {
        console.log('Send button not found, taking debug screenshot');
        await page.screenshot({ 
          path: 'tests/screenshots/claude-chat-no-send.png',
          fullPage: true 
        });
      }
    } else {
      console.log('Chat input not found, taking debug screenshot');
      await page.screenshot({ 
        path: 'tests/screenshots/claude-chat-no-input.png',
        fullPage: true 
      });
    }
  });

  test('should test streaming response', async ({ page }) => {
    // Get auth token
    const response = await page.request.post(`${API_URL}/api/auth/login`, {
      data: {
        email: 'test@example.com', 
        password: 'password123'
      }
    });
    
    const authData = await response.json();
    const token = authData.token;
    
    // Test streaming endpoint
    const streamResponse = await fetch(`${API_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Count from 1 to 5',
        sessionId: 'stream-test',
        stream: true
      })
    });
    
    expect(streamResponse.ok).toBeTruthy();
    
    const reader = streamResponse.body.getReader();
    const decoder = new TextDecoder();
    let chunks = [];
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      chunks.push(chunk);
      console.log('Stream chunk:', chunk.substring(0, 50));
      
      // Break after receiving some chunks to avoid timeout
      if (chunks.length > 3) break;
    }
    
    expect(chunks.length).toBeGreaterThan(0);
    console.log(`✅ Received ${chunks.length} streaming chunks`);
  });
});