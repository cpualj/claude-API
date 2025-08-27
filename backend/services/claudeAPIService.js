import Anthropic from '@anthropic-ai/sdk';
import EventEmitter from 'events';

class ClaudeAPIService extends EventEmitter {
  constructor() {
    super();
    this.client = null;
  }

  initialize(apiKey) {
    if (!apiKey) {
      throw new Error('API key is required');
    }
    
    this.client = new Anthropic({
      apiKey: apiKey,
    });
    
    return true;
  }

  async chat(message, context = [], options = {}) {
    const {
      model = 'claude-3-sonnet-20240229',
      maxTokens = 4096,
      temperature = 0.7,
      stream = false
    } = options;

    try {
      const messages = [
        ...context.map(msg => ({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: msg.content
        })),
        { role: 'user', content: message }
      ];

      if (stream) {
        const stream = await this.client.messages.stream({
          model,
          max_tokens: maxTokens,
          temperature,
          messages
        });

        let fullResponse = '';
        
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta') {
            const text = chunk.delta.text;
            fullResponse += text;
            this.emit('stream', { chunk: text });
          }
        }

        const finalMessage = await stream.finalMessage();
        
        return {
          content: fullResponse,
          usage: {
            inputTokens: finalMessage.usage.input_tokens,
            outputTokens: finalMessage.usage.output_tokens,
            totalTokens: finalMessage.usage.input_tokens + finalMessage.usage.output_tokens
          },
          model,
          stopReason: finalMessage.stop_reason
        };
      } else {
        const response = await this.client.messages.create({
          model,
          max_tokens: maxTokens,
          temperature,
          messages
        });

        return {
          content: response.content[0].text,
          usage: {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
            totalTokens: response.usage.input_tokens + response.usage.output_tokens
          },
          model: response.model,
          stopReason: response.stop_reason
        };
      }
    } catch (error) {
      console.error('Claude API error:', error);
      throw error;
    }
  }

  async estimateTokens(text) {
    // Rough estimation: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }
}

// Create singleton instance
const claudeAPIService = new ClaudeAPIService();

export default claudeAPIService;