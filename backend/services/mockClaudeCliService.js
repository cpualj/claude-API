/**
 * Mock Claude CLI Service
 * 
 * This service simulates Claude CLI responses for demonstration purposes
 * when the real Claude CLI has issues with piped stdin/stdout
 */

class MockClaudeCliService {
  constructor(instanceId) {
    this.instanceId = instanceId;
    this.conversationHistory = [];
    this.messageCount = 0;
  }

  async processMessage(message) {
    // Simulate processing time
    const processingTime = Math.random() * 2000 + 1000; // 1-3 seconds
    await new Promise(resolve => setTimeout(resolve, processingTime));

    this.messageCount++;
    
    // Add to conversation history
    this.conversationHistory.push({
      role: 'user',
      content: message,
      timestamp: new Date()
    });

    // Generate mock response based on message content
    const response = this.generateMockResponse(message);
    
    this.conversationHistory.push({
      role: 'assistant', 
      content: response,
      timestamp: new Date()
    });

    return {
      id: `msg-${Date.now()}-${this.instanceId}`,
      instanceId: this.instanceId,
      content: response,
      timestamp: new Date(),
      duration: processingTime,
      messageCount: this.messageCount
    };
  }

  generateMockResponse(message) {
    const msg = message.toLowerCase();
    
    // Math questions
    if (msg.includes('what is') && msg.includes('+')) {
      const match = msg.match(/(\d+)\s*\+\s*(\d+)/);
      if (match) {
        const result = parseInt(match[1]) + parseInt(match[2]);
        return `${match[1]} + ${match[2]} = ${result}`;
      }
    }
    
    if (msg.includes('what is') && msg.includes('×') || msg.includes('*')) {
      const match = msg.match(/(\d+)\s*[×*]\s*(\d+)/);
      if (match) {
        const result = parseInt(match[1]) * parseInt(match[2]);
        return `${match[1]} × ${match[2]} = ${result}`;
      }
    }

    // Greeting responses
    if (msg.includes('hello') || msg.includes('hi')) {
      return `Hello! I'm Claude, running on instance ${this.instanceId.split('-').pop()}. How can I help you today?`;
    }

    // Name questions
    if (msg.includes('my name is')) {
      const nameMatch = msg.match(/my name is (\w+)/i);
      if (nameMatch) {
        return `Nice to meet you, ${nameMatch[1]}! I'll remember that your name is ${nameMatch[1]}.`;
      }
    }

    if (msg.includes('what is my name') || msg.includes('what\'s my name')) {
      const nameHistory = this.conversationHistory.find(h => 
        h.role === 'user' && h.content.toLowerCase().includes('my name is')
      );
      if (nameHistory) {
        const nameMatch = nameHistory.content.match(/my name is (\w+)/i);
        if (nameMatch) {
          return `Your name is ${nameMatch[1]}.`;
        }
      }
      return "I don't recall you telling me your name yet. What would you like me to call you?";
    }

    // Programming questions
    if (msg.includes('javascript') || msg.includes('function')) {
      return `Here's a simple JavaScript function example:

\`\`\`javascript
function addTwoNumbers(a, b) {
    return a + b;
}

// Usage example:
const result = addTwoNumbers(2, 3);
console.log(result); // Output: 5
\`\`\`

This function takes two parameters and returns their sum.`;
    }

    // Joke requests
    if (msg.includes('joke') && msg.includes('programming')) {
      const jokes = [
        "Why do programmers prefer dark mode? Because light attracts bugs! 🐛",
        "How many programmers does it take to change a light bulb? None, that's a hardware problem! 💡",
        "Why do Java developers wear glasses? Because they don't C#! 👓",
        "A programmer is told to \"go to hell\". They find the worst part of that statement is the \"go to\"! 😈"
      ];
      return jokes[Math.floor(Math.random() * jokes.length)];
    }

    // Default responses
    const defaultResponses = [
      `I understand you're asking about "${message.substring(0, 50)}${message.length > 50 ? '...' : ''}". Could you provide more specific details about what you'd like to know?`,
      
      `That's an interesting question about "${message.substring(0, 30)}...". Let me help you with that. What specific aspect would you like me to focus on?`,
      
      `I'm processing your request: "${message.substring(0, 40)}...". Could you clarify what kind of response you're looking for?`,
      
      `Thanks for your message. I'm Claude, and I'm here to help with various tasks including coding, analysis, writing, and answering questions. How can I assist you further?`
    ];

    return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
  }

  getConversationHistory() {
    return this.conversationHistory;
  }

  getStats() {
    return {
      instanceId: this.instanceId,
      messageCount: this.messageCount,
      conversationLength: this.conversationHistory.length
    };
  }
}

export default MockClaudeCliService;