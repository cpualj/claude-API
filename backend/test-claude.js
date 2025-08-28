import claudeService from './services/claudeService.js';

async function testClaude() {
  console.log('Testing Claude CLI integration...');
  
  try {
    // Test availability
    const isAvailable = await claudeService.checkAvailability();
    console.log('Claude CLI available:', isAvailable);
    
    if (isAvailable) {
      // Get version
      const version = await claudeService.getVersion();
      console.log('Claude CLI version:', version);
      
      // Send a test message
      console.log('\nSending test message to Claude...');
      const response = await claudeService.sendMessageViaFile('Say hello in one short sentence', {
        sessionId: 'test-direct'
      });
      
      console.log('\nClaude response:');
      console.log('Content:', response.content);
      console.log('Model:', response.model);
      console.log('Duration:', response.duration + 'ms');
    } else {
      console.log('Claude CLI is not available');
    }
  } catch (error) {
    console.error('Test failed:', error.message);
  }
}

testClaude();