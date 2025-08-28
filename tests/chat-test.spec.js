import { test, expect } from '@playwright/test';

test.describe('Claude Chat Interface Tests', () => {
  const BASE_URL = 'http://localhost:3001';
  
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test('API Health Check', async ({ page }) => {
    const response = await page.request.get(`${BASE_URL}/health`);
    const data = await response.json();
    
    expect(response.ok()).toBeTruthy();
    expect(data.status).toBe('healthy');
    console.log('Server status:', data);
    console.log('Claude status:', data.services.claude);
  });

  test('User Authentication Flow', async ({ page }) => {
    // Register a new user
    const registerResponse = await page.request.post(`${BASE_URL}/api/auth/register`, {
      data: {
        email: 'test@example.com',
        password: 'password123',
        name: 'Test User'
      }
    });
    
    if (registerResponse.ok()) {
      console.log('✅ User registered successfully');
    }
    
    // Login
    const loginResponse = await page.request.post(`${BASE_URL}/api/auth/login`, {
      data: {
        email: 'test@example.com',
        password: 'password123'
      }
    });
    
    expect(loginResponse.ok()).toBeTruthy();
    const authData = await loginResponse.json();
    expect(authData.token).toBeTruthy();
    console.log('✅ User logged in successfully');
    
    return authData.token;
  });

  test('Chat Session Management', async ({ page }) => {
    // Login first
    const loginResponse = await page.request.post(`${BASE_URL}/api/auth/login`, {
      data: {
        email: 'test@example.com',
        password: 'password123'
      }
    });
    const authData = await loginResponse.json();
    const token = authData.token;
    
    // Create a new session
    const sessionResponse = await page.request.post(`${BASE_URL}/api/sessions`, {
      headers: {
        'Authorization': `Bearer ${token}`
      },
      data: {
        title: 'Test Session'
      }
    });
    
    expect(sessionResponse.ok()).toBeTruthy();
    const sessionData = await sessionResponse.json();
    console.log('✅ Session created:', sessionData);
    
    // Get all sessions
    const sessionsResponse = await page.request.get(`${BASE_URL}/api/sessions`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    expect(sessionsResponse.ok()).toBeTruthy();
    const sessions = await sessionsResponse.json();
    expect(sessions.length).toBeGreaterThan(0);
    console.log('✅ Sessions retrieved:', sessions.length);
    
    return sessionData.id;
  });

  test('Send Chat Message to Claude', async ({ page }) => {
    // Login
    const loginResponse = await page.request.post(`${BASE_URL}/api/auth/login`, {
      data: {
        email: 'test@example.com',
        password: 'password123'
      }
    });
    const authData = await loginResponse.json();
    const token = authData.token;
    
    // Send a chat message
    console.log('📤 Sending message to Claude...');
    const chatResponse = await page.request.post(`${BASE_URL}/api/chat`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: {
        message: 'Hello Claude! Please respond with: "Hello from Claude"',
        sessionId: 'test-session-' + Date.now(),
        stream: false
      }
    });
    
    expect(chatResponse.ok()).toBeTruthy();
    const chatData = await chatResponse.json();
    
    console.log('📥 Response from Claude:');
    console.log('  Content:', chatData.content);
    console.log('  Model:', chatData.model);
    console.log('  Timestamp:', chatData.timestamp);
    
    expect(chatData.content).toBeTruthy();
    expect(chatData.role).toBe('assistant');
    
    // Check if it's a real Claude response or mock
    if (chatData.content.includes('[Mock Mode]')) {
      console.log('⚠️ Running in Mock Mode');
    } else {
      console.log('✅ Real Claude response received');
    }
  });

  test('Stream Chat Response', async ({ page }) => {
    // Login
    const loginResponse = await page.request.post(`${BASE_URL}/api/auth/login`, {
      data: {
        email: 'test@example.com',
        password: 'password123'
      }
    });
    const authData = await loginResponse.json();
    const token = authData.token;
    
    console.log('📤 Starting streaming request...');
    
    // Send streaming request
    const response = await fetch(`${BASE_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Count from 1 to 3 slowly',
        sessionId: 'stream-test-' + Date.now(),
        stream: true
      })
    });
    
    expect(response.ok).toBeTruthy();
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let chunks = [];
    let fullContent = '';
    
    console.log('📥 Receiving stream chunks:');
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim());
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              chunks.push(data.content);
              fullContent += data.content;
              console.log(`  Chunk ${chunks.length}: "${data.content}"`);
            }
          } catch (e) {
            // Skip non-JSON data
          }
        }
      }
      
      // Limit chunks for testing
      if (chunks.length >= 5) break;
    }
    
    console.log('✅ Stream complete');
    console.log(`  Total chunks: ${chunks.length}`);
    console.log(`  Full response: ${fullContent}`);
    
    expect(chunks.length).toBeGreaterThan(0);
  });

  test('Chat with Tools/Functions', async ({ page }) => {
    // Login
    const loginResponse = await page.request.post(`${BASE_URL}/api/auth/login`, {
      data: {
        email: 'test@example.com',
        password: 'password123'
      }
    });
    const authData = await loginResponse.json();
    const token = authData.token;
    
    // Get available tools
    const toolsResponse = await page.request.get(`${BASE_URL}/api/tools`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    expect(toolsResponse.ok()).toBeTruthy();
    const tools = await toolsResponse.json();
    console.log('🔧 Available tools:', tools);
    
    // Send a message that might use tools
    const chatResponse = await page.request.post(`${BASE_URL}/api/chat`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      data: {
        message: 'What is the weather like today?',
        sessionId: 'tools-test-' + Date.now(),
        stream: false
      }
    });
    
    expect(chatResponse.ok()).toBeTruthy();
    const chatData = await chatResponse.json();
    console.log('✅ Tool response:', chatData.content.substring(0, 200));
  });

  test('Session History', async ({ page }) => {
    // Login
    const loginResponse = await page.request.post(`${BASE_URL}/api/auth/login`, {
      data: {
        email: 'test@example.com',
        password: 'password123'
      }
    });
    const authData = await loginResponse.json();
    const token = authData.token;
    
    const sessionId = 'history-test-' + Date.now();
    
    // Send multiple messages
    const messages = [
      'Hello Claude!',
      'What is 2 + 2?',
      'Thank you!'
    ];
    
    for (const message of messages) {
      const response = await page.request.post(`${BASE_URL}/api/chat`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        data: {
          message,
          sessionId,
          stream: false
        }
      });
      expect(response.ok()).toBeTruthy();
      console.log(`✅ Sent: "${message}"`);
    }
    
    // Get session history
    const historyResponse = await page.request.get(`${BASE_URL}/api/sessions/${sessionId}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    expect(historyResponse.ok()).toBeTruthy();
    const historyData = await historyResponse.json();
    
    console.log('📜 Session history:');
    console.log(`  Total messages: ${historyData.messages.length}`);
    console.log(`  User messages: ${historyData.messages.filter(m => m.role === 'user').length}`);
    console.log(`  Assistant messages: ${historyData.messages.filter(m => m.role === 'assistant').length}`);
    
    expect(historyData.messages.length).toBeGreaterThanOrEqual(6); // 3 user + 3 assistant
  });

  test('Error Handling', async ({ page }) => {
    // Test unauthorized access
    const unauthorizedResponse = await page.request.post(`${BASE_URL}/api/chat`, {
      data: {
        message: 'Hello'
      }
    });
    
    expect(unauthorizedResponse.status()).toBe(401);
    console.log('✅ Unauthorized access blocked');
    
    // Test invalid login
    const invalidLoginResponse = await page.request.post(`${BASE_URL}/api/auth/login`, {
      data: {
        email: 'invalid@example.com',
        password: 'wrongpassword'
      }
    });
    
    expect(invalidLoginResponse.ok()).toBeFalsy();
    console.log('✅ Invalid login rejected');
  });

  test('Usage Statistics', async ({ page }) => {
    // Login
    const loginResponse = await page.request.post(`${BASE_URL}/api/auth/login`, {
      data: {
        email: 'test@example.com',
        password: 'password123'
      }
    });
    const authData = await loginResponse.json();
    const token = authData.token;
    
    // Get usage statistics
    const usageResponse = await page.request.get(`${BASE_URL}/api/usage`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    expect(usageResponse.ok()).toBeTruthy();
    const usage = await usageResponse.json();
    
    console.log('📊 Usage Statistics:');
    console.log(`  Total messages: ${usage.totalMessages}`);
    console.log(`  Total sessions: ${usage.totalSessions}`);
    console.log(`  Input tokens: ${usage.totalInputTokens}`);
    console.log(`  Output tokens: ${usage.totalOutputTokens}`);
  });
});

// Visual UI Test using Playwright browser automation
test.describe('Visual Chat UI Tests', () => {
  test('Visual Chat Interface Test', async ({ page }) => {
    // Navigate to chat interface
    await page.goto('http://localhost:3001/chat.html');
    
    // Take screenshot of initial state
    await page.screenshot({ 
      path: '.playwright-mcp/claude-chat-interface.png',
      fullPage: true 
    });
    console.log('📸 Screenshot saved: claude-chat-interface.png');
    
    // Check if chat interface elements exist
    const chatContainer = page.locator('#chat-container, .chat-container, [data-testid="chat-container"]').first();
    if (await chatContainer.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('✅ Chat container found');
      
      // Look for input field
      const input = page.locator('input[type="text"], textarea').first();
      if (await input.isVisible().catch(() => false)) {
        await input.fill('Hello Claude, this is a test message!');
        console.log('✅ Message typed in input field');
        
        // Look for send button
        const sendButton = page.locator('button').filter({ hasText: /send|submit/i }).first();
        if (await sendButton.isVisible().catch(() => false)) {
          await sendButton.click();
          console.log('✅ Send button clicked');
          
          // Wait for response
          await page.waitForTimeout(3000);
          
          // Take screenshot after sending
          await page.screenshot({ 
            path: '.playwright-mcp/tests-screenshots-claude-chat-after-send.png',
            fullPage: true 
          });
          console.log('📸 Screenshot saved: claude-chat-after-send.png');
        }
      }
    } else {
      console.log('ℹ️ No visual chat interface found at /chat.html');
    }
  });
});