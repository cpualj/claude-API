import { spawn } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';

class MultiAccountClaudeService extends EventEmitter {
  constructor() {
    super();
    
    // 配置账号列表
    this.accounts = [
      { 
        id: 'account1', 
        configDir: 'C:\\Users\\jiang\\claude-configs\\account1',
        busy: false,
        requestCount: 0,
        lastUsed: null
      },
      { 
        id: 'account2', 
        configDir: 'C:\\Users\\jiang\\claude-configs\\account2',
        busy: false,
        requestCount: 0,
        lastUsed: null
      },
      { 
        id: 'account3', 
        configDir: 'C:\\Users\\jiang\\claude-configs\\account3',
        busy: false,
        requestCount: 0,
        lastUsed: null
      }
    ];
    
    this.queue = [];
    this.processing = false;
    
    // 检查哪些账号已配置
    this.checkAccountsStatus();
  }

  checkAccountsStatus() {
    this.accounts.forEach(account => {
      const configPath = path.join(account.configDir, 'claude', 'config.json');
      account.configured = fs.existsSync(configPath);
      
      if (account.configured) {
        try {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
          account.email = config.email || 'Unknown';
          console.log(`✅ ${account.id} configured: ${account.email}`);
        } catch (error) {
          account.configured = false;
          console.log(`❌ ${account.id} config error:`, error.message);
        }
      } else {
        console.log(`❌ ${account.id} not configured`);
      }
    });
  }

  async sendMessage(message, options = {}) {
    return new Promise((resolve, reject) => {
      // 添加到队列
      this.queue.push({
        message,
        options,
        resolve,
        reject,
        timestamp: new Date()
      });
      
      // 触发队列处理
      this.processQueue();
    });
  }

  async processQueue() {
    // 如果正在处理或队列为空，返回
    if (this.processing || this.queue.length === 0) return;
    
    // 找一个可用的账号（已配置且不忙）
    const availableAccount = this.accounts.find(a => 
      a.configured && !a.busy
    );
    
    if (!availableAccount) {
      // 没有可用账号，等待后重试
      setTimeout(() => this.processQueue(), 1000);
      return;
    }
    
    // 取出队列中的第一个请求
    const request = this.queue.shift();
    this.processing = true;
    availableAccount.busy = true;
    
    try {
      console.log(`Processing with ${availableAccount.id}...`);
      
      const result = await this.callClaudeWithAccount(
        request.message,
        availableAccount,
        request.options
      );
      
      // 更新账号统计
      availableAccount.requestCount++;
      availableAccount.lastUsed = new Date();
      
      // 返回结果
      request.resolve({
        ...result,
        accountUsed: availableAccount.id,
        queueLength: this.queue.length
      });
      
      // 发送事件
      this.emit('request-completed', {
        accountId: availableAccount.id,
        success: true
      });
      
    } catch (error) {
      console.error(`Error with ${availableAccount.id}:`, error);
      
      request.reject(error);
      
      this.emit('request-failed', {
        accountId: availableAccount.id,
        error: error.message
      });
    } finally {
      // 释放账号
      availableAccount.busy = false;
      this.processing = false;
      
      // 继续处理队列
      setImmediate(() => this.processQueue());
    }
  }

  async callClaudeWithAccount(message, account, options = {}) {
    return new Promise((resolve, reject) => {
      // 构建命令参数
      const args = ['--print'];
      
      // 添加可选参数
      if (options.model) {
        args.push('--model', options.model);
      }
      
      // 添加消息
      args.push(message);
      
      console.log(`Calling Claude with args:`, args);
      console.log(`Using config dir:`, account.configDir);
      
      // 启动 Claude 进程
      const claudeProcess = spawn('claude', args, {
        env: {
          ...process.env,
          CLAUDE_CONFIG_DIR: account.configDir
        },
        shell: true
      });
      
      let output = '';
      let error = '';
      let timeout;
      
      // 设置超时（2分钟）
      timeout = setTimeout(() => {
        claudeProcess.kill();
        reject(new Error('Claude request timeout after 2 minutes'));
      }, 120000);
      
      claudeProcess.stdout.on('data', (data) => {
        output += data.toString();
      });
      
      claudeProcess.stderr.on('data', (data) => {
        error += data.toString();
      });
      
      claudeProcess.on('close', (code) => {
        clearTimeout(timeout);
        
        if (code === 0) {
          resolve({
            content: output.trim(),
            timestamp: new Date()
          });
        } else {
          reject(new Error(`Claude process exited with code ${code}: ${error}`));
        }
      });
      
      claudeProcess.on('error', (err) => {
        clearTimeout(timeout);
        reject(new Error(`Failed to start Claude: ${err.message}`));
      });
    });
  }

  // 获取服务状态
  getStatus() {
    return {
      accounts: this.accounts.map(a => ({
        id: a.id,
        configured: a.configured,
        email: a.email,
        busy: a.busy,
        requestCount: a.requestCount,
        lastUsed: a.lastUsed
      })),
      queueLength: this.queue.length,
      processing: this.processing
    };
  }

  // 获取可用账号数
  getAvailableAccountsCount() {
    return this.accounts.filter(a => a.configured && !a.busy).length;
  }

  // 重新检查账号配置
  refreshAccountsStatus() {
    this.checkAccountsStatus();
    return this.getStatus();
  }

  // 清空队列
  clearQueue() {
    const clearedCount = this.queue.length;
    this.queue.forEach(request => {
      request.reject(new Error('Queue cleared'));
    });
    this.queue = [];
    return clearedCount;
  }

  // 获取队列信息
  getQueueInfo() {
    return {
      length: this.queue.length,
      items: this.queue.map((item, index) => ({
        position: index + 1,
        message: item.message.substring(0, 50) + '...',
        timestamp: item.timestamp
      }))
    };
  }
}

export default MultiAccountClaudeService;