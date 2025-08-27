import Bull from 'bull';
import { spawn } from 'child_process';

// 创建队列（需要 Redis）
const claudeQueue = new Bull('claude-requests', {
  redis: {
    port: 6379,
    host: 'localhost'
  },
  defaultJobOptions: {
    removeOnComplete: 100, // 保留最近100个完成的任务
    removeOnFail: 50,      // 保留最近50个失败的任务
    attempts: 3,           // 重试3次
    backoff: {
      type: 'exponential',
      delay: 2000
    }
  }
});

// 处理队列中的任务（单个 worker）
claudeQueue.process(1, async (job) => {
  const { message, sessionId, userId } = job.data;
  
  // 更新进度
  job.progress(10);
  
  try {
    // 调用 Claude CLI
    const result = await callClaudeCLI(message);
    
    job.progress(100);
    return {
      content: result,
      timestamp: new Date(),
      sessionId,
      userId
    };
  } catch (error) {
    throw new Error(`Failed to process: ${error.message}`);
  }
});

async function callClaudeCLI(message) {
  return new Promise((resolve, reject) => {
    const claudeProcess = spawn('claude', ['--print', message], {
      shell: true
    });

    let output = '';
    let error = '';

    claudeProcess.stdout.on('data', (data) => {
      output += data.toString();
    });

    claudeProcess.stderr.on('data', (data) => {
      error += data.toString();
    });

    claudeProcess.on('close', (code) => {
      if (code === 0) {
        resolve(output.trim());
      } else {
        reject(new Error(error));
      }
    });
  });
}

// 监听队列事件
claudeQueue.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed:`, result.content.substring(0, 50));
});

claudeQueue.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed:`, err.message);
});

claudeQueue.on('progress', (job, progress) => {
  console.log(`Job ${job.id} progress: ${progress}%`);
});

// 导出队列操作函数
export const addToQueue = async (message, sessionId, userId, priority = 0) => {
  const job = await claudeQueue.add(
    { message, sessionId, userId },
    { 
      priority,  // 优先级：数字越大优先级越高
      delay: 0   // 延迟执行（毫秒）
    }
  );
  
  return job.id;
};

export const getQueueStatus = async () => {
  const [waiting, active, completed, failed] = await Promise.all([
    claudeQueue.getWaitingCount(),
    claudeQueue.getActiveCount(),
    claudeQueue.getCompletedCount(),
    claudeQueue.getFailedCount()
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    total: waiting + active
  };
};

export const getJobStatus = async (jobId) => {
  const job = await claudeQueue.getJob(jobId);
  if (!job) {
    return null;
  }
  
  return {
    id: job.id,
    progress: job.progress(),
    status: await job.getState(),
    data: job.data,
    result: job.returnvalue,
    failedReason: job.failedReason
  };
};

export default claudeQueue;