// E2E Test Configuration
export const config = {
  // Backend services URLs
  services: {
    cliPool: 'http://localhost:3004',          // Traditional CLI Pool (legacy)
    smartClaude: 'http://localhost:3006',      // New Smart Claude Service
    browserPool: 'http://localhost:3005',
    mainBackend: 'http://localhost:3001'
  },

  // Frontend URL
  frontend: {
    url: 'http://localhost:3030',
    chatPath: '/chat'
  },

  // Test timeouts
  timeouts: {
    navigation: 30000,
    action: 10000,
    assertion: 5000,
    message: 60000  // Longer timeout for Claude responses
  },

  // Test data
  testData: {
    messages: [
      'Hello, Claude! Can you help me with a simple math problem?',
      'What is 2 + 2?',
      'Can you write a simple JavaScript function that adds two numbers?',
      'Tell me a short joke about programming'
    ],
    
    expectedResponses: {
      greeting: ['Hello', 'Hi', 'Greetings'],
      math: ['4', 'four'],
      code: ['function', 'const', '=>', 'return']
    }
  },

  // Screenshot settings
  screenshots: {
    enabled: true,
    onFailure: true,
    path: './e2e/screenshots'
  },

  // Retry settings
  retry: {
    times: 2,
    delay: 1000
  },

  // Parallel test settings
  parallel: {
    workers: 3,  // Number of concurrent browser instances
    maxInstances: 5
  }
};

export default config;