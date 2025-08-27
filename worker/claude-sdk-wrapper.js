/**
 * Claude SDK Wrapper for Node.js
 * 使用 Anthropic 官方 SDK 而不是 CLI
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs/promises';
import path from 'path';

class ClaudeSDKWrapper {
  constructor(config = {}) {
    // 初始化 Anthropic 客户端
    this.apiKey = config.apiKey || process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    
    if (!this.apiKey) {
      throw new Error('No API key found. Please set CLAUDE_API_KEY or ANTHROPIC_API_KEY');
    }

    this.client = new Anthropic({
      apiKey: this.apiKey,
      maxRetries: 3,
    });

    // 配置
    this.model = config.model || process.env.CLAUDE_MODEL || 'claude-3-sonnet-20240229';
    this.maxTokens = parseInt(config.maxTokens || process.env.MAX_TOKENS || '4096');
    
    // 会话管理
    this.sessions = new Map();
    this.sessionDir = config.sessionDir || process.env.CLAUDE_SESSION_DIR || '/app/sessions';
  }

  /**
   * 创建新会话
   */
  createSession(sessionId = null) {
    const id = sessionId || `session-${Date.now()}`;
    const session = {
      id,
      messages: [],
      createdAt: new Date(),
      lastActivity: new Date()
    };
    
    this.sessions.set(id, session);
    return session;
  }

  /**
   * 获取会话
   */
  getSession(sessionId) {
    if (!this.sessions.has(sessionId)) {
      // 尝试从文件加载
      this.loadSessionFromFile(sessionId);
    }
    return this.sessions.get(sessionId);
  }

  /**
   * 发送消息（普通模式）
   */
  async sendMessage(message, sessionId = null, options = {}) {
    try {
      // 获取或创建会话
      let session;
      if (sessionId) {
        session = this.getSession(sessionId) || this.createSession(sessionId);
      } else {
        session = this.createSession();
      }

      // 添加用户消息
      session.messages.push({
        role: 'user',
        content: message
      });

      // 准备 API 调用参数
      const params = {
        model: options.model || this.model,
        max_tokens: options.maxTokens || this.maxTokens,
        messages: session.messages.slice(-10), // 保留最近10条消息
        temperature: options.temperature || 0.7,
      };

      // 如果有系统提示
      if (options.systemPrompt) {
        params.system = options.systemPrompt;
      }

      // 调用 API
      const response = await this.client.messages.create(params);

      // 提取响应文本
      const responseText = response.content[0].text;

      // 添加助手响应到会话
      session.messages.push({
        role: 'assistant',
        content: responseText
      });

      // 更新会话活动时间
      session.lastActivity = new Date();

      // 保存会话
      await this.saveSessionToFile(session);

      return {
        success: true,
        sessionId: session.id,
        response: responseText,
        usage: {
          inputTokens: response.usage?.input_tokens || 0,
          outputTokens: response.usage?.output_tokens || 0,
          totalTokens: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0)
        }
      };
    } catch (error) {
      console.error('Error sending message:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 发送流式消息
   */
  async *streamMessage(message, sessionId = null, options = {}) {
    try {
      // 获取或创建会话
      let session;
      if (sessionId) {
        session = this.getSession(sessionId) || this.createSession(sessionId);
      } else {
        session = this.createSession();
      }

      // 添加用户消息
      session.messages.push({
        role: 'user',
        content: message
      });

      // 准备 API 调用参数
      const params = {
        model: options.model || this.model,
        max_tokens: options.maxTokens || this.maxTokens,
        messages: session.messages.slice(-10),
        temperature: options.temperature || 0.7,
        stream: true
      };

      if (options.systemPrompt) {
        params.system = options.systemPrompt;
      }

      // 创建流
      const stream = await this.client.messages.create(params);

      let fullResponse = '';
      
      // 处理流式响应
      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
          fullResponse += chunk.delta.text;
          yield {
            type: 'text',
            content: chunk.delta.text,
            sessionId: session.id
          };
        } else if (chunk.type === 'message_stop') {
          // 消息结束
          yield {
            type: 'done',
            sessionId: session.id,
            usage: chunk.usage
          };
        }
      }

      // 添加完整响应到会话
      session.messages.push({
        role: 'assistant',
        content: fullResponse
      });

      // 更新会话活动时间
      session.lastActivity = new Date();

      // 保存会话
      await this.saveSessionToFile(session);

    } catch (error) {
      console.error('Error in stream:', error);
      yield {
        type: 'error',
        error: error.message
      };
    }
  }

  /**
   * 保存会话到文件
   */
  async saveSessionToFile(session) {
    try {
      await fs.mkdir(this.sessionDir, { recursive: true });
      const filePath = path.join(this.sessionDir, `${session.id}.json`);
      await fs.writeFile(filePath, JSON.stringify(session, null, 2));
    } catch (error) {
      console.error('Error saving session:', error);
    }
  }

  /**
   * 从文件加载会话
   */
  async loadSessionFromFile(sessionId) {
    try {
      const filePath = path.join(this.sessionDir, `${sessionId}.json`);
      const data = await fs.readFile(filePath, 'utf8');
      const session = JSON.parse(data);
      this.sessions.set(sessionId, session);
      return session;
    } catch (error) {
      console.error('Error loading session:', error);
      return null;
    }
  }

  /**
   * 清理过期会话
   */
  async cleanupSessions(maxAge = 3600000) { // 默认1小时
    const now = Date.now();
    for (const [id, session] of this.sessions) {
      if (now - new Date(session.lastActivity).getTime() > maxAge) {
        this.sessions.delete(id);
      }
    }
  }

  /**
   * 估算 token 数量
   */
  estimateTokens(input = '', output = '') {
    // 简单的估算：大约 4 个字符 = 1 个 token
    const inputTokens = Math.ceil(input.length / 4);
    const outputTokens = Math.ceil(output.length / 4);
    
    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens
    };
  }
}

export default ClaudeSDKWrapper;