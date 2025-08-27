import express from 'express';
import claudeQueueService from '../services/claudeQueueService.js';

const router = express.Router();

// 聊天接口 - 加入队列
router.post('/chat', async (req, res) => {
  const { message, sessionId, context = [] } = req.body;
  const userId = req.user?.id || 'anonymous';

  try {
    // 获取当前队列状态
    const queueStatus = claudeQueueService.getQueueStatus();
    
    // 如果队列太长，可以拒绝新请求
    if (queueStatus.queueLength > 10) {
      return res.status(503).json({
        error: 'Service busy',
        message: 'Too many requests in queue, please try again later',
        queueLength: queueStatus.queueLength
      });
    }

    // 添加到队列
    const requestId = `${userId}-${sessionId}-${Date.now()}`;
    
    // 立即返回队列信息
    res.json({
      requestId,
      status: 'queued',
      position: queueStatus.queueLength + 1,
      estimatedWaitTime: (queueStatus.queueLength + 1) * 5, // 假设每个请求5秒
      message: 'Your request has been queued'
    });

    // 异步处理请求
    claudeQueueService.addToQueue(message, context, {
      sessionId,
      userId,
      requestId
    }).then(result => {
      // 通过 WebSocket 发送结果
      io.to(sessionId).emit('chat-response', {
        requestId,
        ...result
      });
    }).catch(error => {
      io.to(sessionId).emit('chat-error', {
        requestId,
        error: error.message
      });
    });

  } catch (error) {
    res.status(500).json({
      error: 'Failed to process request',
      details: error.message
    });
  }
});

// 获取队列状态
router.get('/queue/status', (req, res) => {
  const status = claudeQueueService.getQueueStatus();
  res.json(status);
});

// 取消请求
router.delete('/queue/:requestId', (req, res) => {
  const { requestId } = req.params;
  const cancelled = claudeQueueService.cancelRequest(requestId);
  
  if (cancelled) {
    res.json({ success: true, message: 'Request cancelled' });
  } else {
    res.status(404).json({ error: 'Request not found in queue' });
  }
});

// WebSocket 连接处理
export const setupQueueWebSocket = (io) => {
  // 监听队列事件
  claudeQueueService.on('queued', (data) => {
    io.emit('queue-update', { type: 'queued', ...data });
  });

  claudeQueueService.on('processing', (data) => {
    io.emit('queue-update', { type: 'processing', ...data });
  });

  claudeQueueService.on('completed', (data) => {
    io.emit('queue-update', { type: 'completed', ...data });
  });

  claudeQueueService.on('stream', (data) => {
    // 流式输出
    io.emit('stream-chunk', data);
  });

  // 定期广播队列状态
  setInterval(() => {
    const status = claudeQueueService.getQueueStatus();
    io.emit('queue-status', status);
  }, 5000); // 每5秒更新一次
};

export default router;