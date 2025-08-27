import express from 'express';
import { spawn } from 'child_process';
import { EventEmitter } from 'events';

class ClaudeWorker extends EventEmitter {
  constructor(accountConfig) {
    super();
    this.accountId = accountConfig.id;
    this.accountEmail = accountConfig.email;
    this.isAuthenticated = false;
    this.busy = false;
    this.stats = {
      requestsProcessed: 0,
      totalTokensUsed: 0,
      averageResponseTime: 0,
      lastUsed: null
    };
  }

  async authenticate(apiKey) {
    return new Promise((resolve, reject) => {
      // 使用提供的 API key 登录 Claude CLI
      const authProcess = spawn('claude', ['auth', 'login', '--api-key', apiKey], {
        env: {
          ...process.env,
          CLAUDE_API_KEY: apiKey
        }
      });

      authProcess.on('close', (code) => {
        if (code === 0) {
          this.isAuthenticated = true;
          console.log(`✅ Worker ${this.accountId} authenticated`);
          resolve(true);
        } else {
          reject(new Error(`Authentication failed for ${this.accountId}`));
        }
      });
    });
  }

  async processRequest(message, options = {}) {
    if (!this.isAuthenticated) {
      throw new Error('Worker not authenticated');
    }

    if (this.busy) {
      throw new Error('Worker is busy');
    }

    this.busy = true;
    const startTime = Date.now();

    try {
      const result = await this.callClaude(message, options);
      
      // Update statistics
      const responseTime = Date.now() - startTime;
      this.updateStats(responseTime, result);
      
      return result;
    } finally {
      this.busy = false;
      this.stats.lastUsed = new Date();
    }
  }

  async callClaude(message, options) {
    return new Promise((resolve, reject) => {
      const args = ['--print'];
      
      if (options.model) {
        args.push('--model', options.model);
      }
      
      args.push(message);

      const claudeProcess = spawn('claude', args, {
        env: { ...process.env }
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
          resolve({
            content: output.trim(),
            accountId: this.accountId,
            timestamp: new Date()
          });
        } else {
          reject(new Error(`Claude error: ${error}`));
        }
      });
    });
  }

  updateStats(responseTime, result) {
    this.stats.requestsProcessed++;
    this.stats.totalTokensUsed += this.estimateTokens(result.content);
    
    // Calculate running average
    const n = this.stats.requestsProcessed;
    this.stats.averageResponseTime = 
      (this.stats.averageResponseTime * (n - 1) + responseTime) / n;
  }

  estimateTokens(text) {
    return Math.ceil(text.length / 4);
  }

  getStatus() {
    return {
      accountId: this.accountId,
      accountEmail: this.accountEmail,
      authenticated: this.isAuthenticated,
      busy: this.busy,
      stats: this.stats
    };
  }
}

// Express server for worker
const app = express();
app.use(express.json());

const PORT = process.env.WORKER_PORT || 4000;
const ACCOUNT_CONFIG = {
  id: process.env.ACCOUNT_ID || 'worker-1',
  email: process.env.ACCOUNT_EMAIL || 'worker@example.com'
};

const worker = new ClaudeWorker(ACCOUNT_CONFIG);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    worker: worker.getStatus()
  });
});

// Authenticate
app.post('/auth', async (req, res) => {
  const { apiKey } = req.body;
  
  try {
    await worker.authenticate(apiKey);
    res.json({ success: true });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
});

// Process request
app.post('/process', async (req, res) => {
  const { message, options } = req.body;
  
  if (worker.busy) {
    return res.status(503).json({ error: 'Worker busy' });
  }
  
  try {
    const result = await worker.processRequest(message, options);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get status
app.get('/status', (req, res) => {
  res.json(worker.getStatus());
});

app.listen(PORT, () => {
  console.log(`
🤖 Claude Worker Started
━━━━━━━━━━━━━━━━━━━━━━━━
Account: ${ACCOUNT_CONFIG.email}
ID: ${ACCOUNT_CONFIG.id}
Port: ${PORT}
━━━━━━━━━━━━━━━━━━━━━━━━
  `);
});