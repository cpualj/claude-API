import express from 'express';
import { z } from 'zod';
import { authenticateAPIKey } from '../middleware/auth.js';
import { rateLimiter } from '../middleware/rate-limit.js';

const router = express.Router();

// 验证 schemas
const chatMessageSchema = z.object({
  message: z.string().min(1, 'Message is required'),
  toolId: z.string().optional().default('claude'),
  sessionId: z.string().optional(),
  stream: z.boolean().optional().default(false),
  options: z.object({
    temperature: z.number().min(0).max(2).optional(),
    maxTokens: z.number().min(1).max(4000).optional(),
    topP: z.number().min(0).max(1).optional(),
    frequencyPenalty: z.number().min(-2).max(2).optional(),
    presencePenalty: z.number().min(-2).max(2).optional()
  }).optional().default({})
});

const createSessionSchema = z.object({
  toolId: z.string().optional().default('claude'),
  initialContext: z.array(z.any()).optional().default([]),
  metadata: z.object({}).optional().default({}),
  ttlSeconds: z.number().min(300).max(86400).optional().default(3600) // 5分钟到24小时
});

// 发送聊天消息
router.post('/chat', authenticateAPIKey, rateLimiter, async (req, res) => {
  const startTime = Date.now();
  let usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

  try {
    // 验证输入
    const validationResult = chatMessageSchema.safeParse(req.body);
    if (!validationResult.success) {
      await req.services.apiKeyManager.logUsage(req.apiKey.id, {
        endpoint: '/api/chat',
        method: 'POST',
        statusCode: 400,
        responseTimeMs: Date.now() - startTime,
        errorMessage: 'Validation failed',
        metadata: { errors: validationResult.error.errors },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validationResult.error.errors
      });
    }

    const { message, toolId, sessionId, stream, options } = validationResult.data;

    // 检查会话（如果提供）
    let session = null;
    if (sessionId) {
      session = await req.services.sessionManager.getSession(sessionId, req.apiKey.id);
      if (!session) {
        await req.services.apiKeyManager.logUsage(req.apiKey.id, {
          endpoint: '/api/chat',
          method: 'POST',
          statusCode: 404,
          responseTimeMs: Date.now() - startTime,
          errorMessage: 'Session not found',
          metadata: { sessionId },
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });

        return res.status(404).json({
          success: false,
          error: 'Session not found'
        });
      }
    }

    // 准备请求数据
    const requestData = {
      message,
      toolId,
      sessionId: session?.id,
      options,
      userId: req.apiKey.userId,
      apiKeyId: req.apiKey.id
    };

    if (stream) {
      // 流式响应
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

      try {
        // 提交到 Worker Manager 进行流式处理
        const result = await req.services.workerManager.submitRequest({
          ...requestData,
          stream: true
        });

        if (result.status === 'queued') {
          // 如果请求被排队，发送排队状态
          res.write(`data: ${JSON.stringify({
            type: 'queued',
            requestId: result.requestId,
            message: result.message
          })}\n\n`);

          // 这里应该实现轮询或 WebSocket 来获取结果
          // 现在使用简化的实现
          res.write(`data: ${JSON.stringify({
            type: 'text',
            content: 'Your request is being processed...'
          })}\n\n`);

          res.write(`data: ${JSON.stringify({
            type: 'done',
            usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }
          })}\n\n`);
        } else if (result.status === 'completed') {
          // 直接处理完成
          res.write(`data: ${JSON.stringify({
            type: 'text',
            content: result.result.response
          })}\n\n`);

          res.write(`data: ${JSON.stringify({
            type: 'done',
            usage: result.result.usage || { inputTokens: 10, outputTokens: 20, totalTokens: 30 }
          })}\n\n`);

          usage = result.result.usage || usage;
        } else {
          throw new Error(result.error || 'Request processing failed');
        }

        res.end();

        // 更新会话上下文
        if (session && result.status === 'completed') {
          await req.services.sessionManager.addMessage(sessionId, req.apiKey.id, {
            role: 'user',
            content: message
          });
          await req.services.sessionManager.addMessage(sessionId, req.apiKey.id, {
            role: 'assistant',
            content: result.result.response
          });
        }

      } catch (error) {
        console.error('Stream processing error:', error);
        
        res.write(`data: ${JSON.stringify({
          type: 'error',
          error: error.message
        })}\n\n`);
        res.end();

        await req.services.apiKeyManager.logUsage(req.apiKey.id, {
          endpoint: '/api/chat',
          method: 'POST',
          statusCode: 500,
          responseTimeMs: Date.now() - startTime,
          errorMessage: error.message,
          metadata: requestData,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });

        return;
      }

    } else {
      // 非流式响应
      try {
        const result = await req.services.workerManager.submitRequest(requestData);

        if (result.status === 'queued') {
          // 请求已排队，返回请求 ID 供轮询
          await req.services.apiKeyManager.logUsage(req.apiKey.id, {
            endpoint: '/api/chat',
            method: 'POST',
            statusCode: 202,
            responseTimeMs: Date.now() - startTime,
            metadata: { requestId: result.requestId },
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
          });

          return res.status(202).json({
            success: true,
            status: 'queued',
            requestId: result.requestId,
            message: 'Request queued for processing',
            pollUrl: `/api/status/${result.requestId}`
          });

        } else if (result.status === 'completed') {
          usage = result.result.usage || usage;

          // 更新会话上下文
          if (session) {
            await req.services.sessionManager.addMessage(sessionId, req.apiKey.id, {
              role: 'user',
              content: message
            });
            await req.services.sessionManager.addMessage(sessionId, req.apiKey.id, {
              role: 'assistant',
              content: result.result.response
            });
          }

          await req.services.apiKeyManager.logUsage(req.apiKey.id, {
            endpoint: '/api/chat',
            method: 'POST',
            statusCode: 200,
            inputTokens: usage.inputTokens,
            outputTokens: usage.outputTokens,
            responseTimeMs: Date.now() - startTime,
            metadata: { toolId, sessionId },
            ipAddress: req.ip,
            userAgent: req.get('User-Agent')
          });

          return res.json({
            success: true,
            response: result.result.response,
            usage,
            toolId: result.result.toolId,
            sessionId: result.result.sessionId,
            responseTime: result.responseTime
          });

        } else {
          throw new Error(result.error || 'Request processing failed');
        }

      } catch (error) {
        console.error('Chat processing error:', error);

        await req.services.apiKeyManager.logUsage(req.apiKey.id, {
          endpoint: '/api/chat',
          method: 'POST',
          statusCode: 500,
          responseTimeMs: Date.now() - startTime,
          errorMessage: error.message,
          metadata: requestData,
          ipAddress: req.ip,
          userAgent: req.get('User-Agent')
        });

        return res.status(500).json({
          success: false,
          error: 'Chat request failed',
          message: error.message
        });
      }
    }

    // 最终记录日志（对于流式请求）
    if (stream) {
      await req.services.apiKeyManager.logUsage(req.apiKey.id, {
        endpoint: '/api/chat',
        method: 'POST',
        statusCode: 200,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        responseTimeMs: Date.now() - startTime,
        metadata: { toolId, sessionId, stream: true },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
    }

  } catch (error) {
    console.error('Unexpected chat error:', error);
    
    await req.services.apiKeyManager.logUsage(req.apiKey.id, {
      endpoint: '/api/chat',
      method: 'POST',
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
      errorMessage: error.message,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
});

// 创建会话
router.post('/sessions', authenticateAPIKey, rateLimiter, async (req, res) => {
  const startTime = Date.now();

  try {
    const validationResult = createSessionSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: validationResult.error.errors
      });
    }

    const { toolId, initialContext, metadata, ttlSeconds } = validationResult.data;

    const session = await req.services.sessionManager.createSession(
      req.apiKey.id,
      toolId,
      { initialContext, metadata, ttlSeconds }
    );

    await req.services.apiKeyManager.logUsage(req.apiKey.id, {
      endpoint: '/api/sessions',
      method: 'POST',
      statusCode: 201,
      responseTimeMs: Date.now() - startTime,
      metadata: { toolId, sessionId: session.id },
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(201).json({
      success: true,
      session
    });

  } catch (error) {
    console.error('Session creation error:', error);

    await req.services.apiKeyManager.logUsage(req.apiKey.id, {
      endpoint: '/api/sessions',
      method: 'POST',
      statusCode: 500,
      responseTimeMs: Date.now() - startTime,
      errorMessage: error.message,
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(500).json({
      success: false,
      error: 'Failed to create session'
    });
  }
});

// 获取会话详情
router.get('/sessions/:sessionId', authenticateAPIKey, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = await req.services.sessionManager.getSession(sessionId, req.apiKey.id);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      session
    });

  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve session'
    });
  }
});

// 更新会话
router.put('/sessions/:sessionId', authenticateAPIKey, rateLimiter, async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { metadata, extendTtlSeconds } = req.body;

    const session = await req.services.sessionManager.updateSession(
      sessionId,
      req.apiKey.id,
      { metadata, extendTtlSeconds }
    );

    res.json({
      success: true,
      session
    });

  } catch (error) {
    console.error('Update session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update session'
    });
  }
});

// 删除会话
router.delete('/sessions/:sessionId', authenticateAPIKey, async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const deleted = await req.services.sessionManager.deleteSession(sessionId, req.apiKey.id);
    
    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    res.json({
      success: true,
      message: 'Session deleted successfully'
    });

  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete session'
    });
  }
});

// 获取用户的所有会话
router.get('/sessions', authenticateAPIKey, async (req, res) => {
  try {
    const { toolId, isActive, limit, offset } = req.query;
    
    const filters = {
      toolId,
      isActive: isActive !== undefined ? isActive === 'true' : undefined,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined
    };

    const result = await req.services.sessionManager.getUserSessions(req.apiKey.id, filters);

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('List sessions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list sessions'
    });
  }
});

// 轮询请求状态
router.get('/status/:requestId', authenticateAPIKey, async (req, res) => {
  try {
    const { requestId } = req.params;
    
    const result = await req.services.workerManager.requestQueue.getResult(requestId);
    
    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Request not found or expired'
      });
    }

    res.json({
      success: true,
      requestId,
      status: result.status,
      result: result.result || null,
      error: result.error || null,
      completedAt: result.completedAt || null,
      failedAt: result.failedAt || null
    });

  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check request status'
    });
  }
});

// 获取可用工具列表
router.get('/tools', authenticateAPIKey, async (req, res) => {
  try {
    // 这里应该从 CLI tools 配置中获取可用工具
    // 现在使用硬编码的示例
    const tools = [
      {
        id: 'claude',
        name: 'Claude',
        description: 'Anthropic Claude AI assistant',
        sessionSupported: true,
        streamingSupported: true,
        enabled: true
      },
      {
        id: 'openai',
        name: 'OpenAI GPT',
        description: 'OpenAI GPT models',
        sessionSupported: true,
        streamingSupported: true,
        enabled: false
      }
    ];

    res.json({
      success: true,
      tools: tools.filter(tool => tool.enabled)
    });

  } catch (error) {
    console.error('Get tools error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve available tools'
    });
  }
});

// 获取使用统计
router.get('/usage', authenticateAPIKey, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    
    const stats = await req.services.apiKeyManager.getApiKeyStats(
      req.apiKey.id,
      req.apiKey.userId,
      parseInt(days)
    );

    res.json({
      success: true,
      ...stats
    });

  } catch (error) {
    console.error('Usage stats error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve usage statistics'
    });
  }
});

// 获取配额信息
router.get('/quota', authenticateAPIKey, async (req, res) => {
  try {
    const remaining = await req.services.apiKeyManager.rateLimiter.getRemainingRequests(
      `api_key:${req.apiKey.id}`,
      req.apiKey.rateLimitPerHour
    );

    res.json({
      success: true,
      quota: {
        limit: req.apiKey.rateLimitPerHour,
        remaining,
        resetTime: Math.floor(Date.now() / 1000) + 3600, // 1小时后重置
        windowSeconds: 3600
      }
    });

  } catch (error) {
    console.error('Quota check error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check quota'
    });
  }
});

export default router;