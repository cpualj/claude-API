# 多账号负载均衡架构设计

## 概述

为了最大化利用 Claude Code 资源并提供高可用性，系统支持配置多个 Claude Code 账号，实现智能负载均衡和自动故障转移。

## 架构图

```
┌──────────────────────────────────────────────────────────────┐
│                         API Gateway                           │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│              Claude Account Load Balancer                     │
├──────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  Account    │  │  Health     │  │  Usage      │         │
│  │  Pool       │  │  Monitor    │  │  Tracker    │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└────────────────────────┬─────────────────────────────────────┘
                         │
    ┌────────────────────┼────────────────────┐
    ▼                    ▼                    ▼
┌──────────┐      ┌──────────┐         ┌──────────┐
│ Account 1│      │ Account 2│         │ Account N│
├──────────┤      ├──────────┤         ├──────────┤
│ Status:  │      │ Status:  │         │ Status:  │
│ Active   │      │ Active   │         │ Standby  │
│          │      │          │         │          │
│ Usage:   │      │ Usage:   │         │ Usage:   │
│ 45%      │      │ 67%      │         │ 0%       │
│          │      │          │         │          │
│ Workers: │      │ Workers: │         │ Workers: │
│ [1][2][3]│      │ [4][5][6]│         │ [7][8]   │
└──────────┘      └──────────┘         └──────────┘
```

## 核心组件

### 1. Claude Account Manager

```javascript
// src/server/claude/AccountManager.js
class ClaudeAccountManager {
  constructor(config) {
    this.accounts = new Map();
    this.activeAccounts = [];
    this.config = config;
    this.healthChecker = new HealthChecker();
    this.usageTracker = new UsageTracker();
  }

  async initialize(accountConfigs) {
    for (const config of accountConfigs) {
      const account = new ClaudeAccount({
        id: config.id,
        email: config.email,
        apiKey: config.apiKey,  // 如果使用 API key
        credentials: config.credentials,  // 如果使用账号密码
        maxWorkers: config.maxWorkers || 5,
        priority: config.priority || 1,
        limits: {
          maxRequestsPerHour: config.maxRequestsPerHour || 1000,
          maxTokensPerHour: config.maxTokensPerHour || 1000000,
          maxConcurrent: config.maxConcurrent || 10
        }
      });

      await account.initialize();
      this.accounts.set(account.id, account);
      
      if (account.status === 'active') {
        this.activeAccounts.push(account);
      }
    }

    // 启动健康检查
    this.startHealthMonitoring();
    // 启动使用量追踪
    this.startUsageTracking();
  }

  async getOptimalAccount() {
    // 获取所有健康的账号
    const healthyAccounts = this.activeAccounts.filter(
      account => account.health === 'healthy'
    );

    if (healthyAccounts.length === 0) {
      throw new Error('No healthy Claude accounts available');
    }

    // 根据负载选择最优账号
    return this.selectByLoadBalancingStrategy(healthyAccounts);
  }

  selectByLoadBalancingStrategy(accounts) {
    const strategy = this.config.loadBalancingStrategy || 'least-usage';

    switch (strategy) {
      case 'round-robin':
        return this.roundRobinSelect(accounts);
      
      case 'least-usage':
        return this.leastUsageSelect(accounts);
      
      case 'weighted':
        return this.weightedSelect(accounts);
      
      case 'least-connections':
        return this.leastConnectionsSelect(accounts);
      
      default:
        return accounts[0];
    }
  }

  leastUsageSelect(accounts) {
    // 选择使用率最低的账号
    return accounts.reduce((optimal, account) => {
      const currentUsage = this.calculateUsageScore(account);
      const optimalUsage = this.calculateUsageScore(optimal);
      return currentUsage < optimalUsage ? account : optimal;
    });
  }

  calculateUsageScore(account) {
    const usage = this.usageTracker.getUsage(account.id);
    
    // 综合评分：请求使用率 * 0.3 + token使用率 * 0.5 + 并发使用率 * 0.2
    const requestUsage = usage.requests / account.limits.maxRequestsPerHour;
    const tokenUsage = usage.tokens / account.limits.maxTokensPerHour;
    const concurrentUsage = usage.concurrent / account.limits.maxConcurrent;
    
    return requestUsage * 0.3 + tokenUsage * 0.5 + concurrentUsage * 0.2;
  }

  async switchAccount(fromAccountId, reason) {
    const fromAccount = this.accounts.get(fromAccountId);
    
    // 记录切换原因
    this.logger.info(`Switching from account ${fromAccountId}`, { reason });
    
    // 将当前账号标记为冷却
    fromAccount.status = 'cooling';
    fromAccount.cooldownUntil = Date.now() + (this.config.cooldownPeriod || 300000); // 5分钟
    
    // 获取新账号
    const newAccount = await this.getOptimalAccount();
    
    // 迁移活跃会话（如果需要）
    if (this.config.migrateActiveSessions) {
      await this.migrateActiveSessions(fromAccount, newAccount);
    }
    
    return newAccount;
  }

  async startHealthMonitoring() {
    setInterval(async () => {
      for (const account of this.accounts.values()) {
        const health = await this.healthChecker.check(account);
        account.health = health.status;
        account.healthDetails = health.details;

        // 自动恢复冷却账号
        if (account.status === 'cooling' && Date.now() > account.cooldownUntil) {
          account.status = 'active';
          this.logger.info(`Account ${account.id} recovered from cooldown`);
        }

        // 处理不健康的账号
        if (health.status === 'unhealthy' && account.status === 'active') {
          await this.handleUnhealthyAccount(account);
        }
      }
    }, this.config.healthCheckInterval || 30000); // 30秒
  }
}
```

### 2. Claude Account 实体

```javascript
// src/server/claude/ClaudeAccount.js
class ClaudeAccount {
  constructor(config) {
    this.id = config.id;
    this.email = config.email;
    this.credentials = config.credentials;
    this.maxWorkers = config.maxWorkers;
    this.priority = config.priority;
    this.limits = config.limits;
    
    this.workers = [];
    this.availableWorkers = [];
    this.busyWorkers = new Set();
    this.status = 'initializing'; // initializing, active, cooling, suspended, error
    this.health = 'unknown'; // healthy, degraded, unhealthy
    
    this.metrics = {
      totalRequests: 0,
      totalTokens: 0,
      errors: 0,
      avgResponseTime: 0,
      lastRequestAt: null,
      hourlyRequests: [],
      hourlyTokens: []
    };
  }

  async initialize() {
    try {
      // 创建工作进程
      for (let i = 0; i < this.maxWorkers; i++) {
        const worker = await this.createWorker(i);
        this.workers.push(worker);
        this.availableWorkers.push(worker);
      }

      // 验证账号
      await this.authenticate();
      
      this.status = 'active';
      this.health = 'healthy';
    } catch (error) {
      this.status = 'error';
      this.health = 'unhealthy';
      throw error;
    }
  }

  async createWorker(index) {
    const worker = new ClaudeWorker({
      id: `${this.id}-worker-${index}`,
      accountId: this.id,
      credentials: this.credentials,
      onError: (error) => this.handleWorkerError(worker, error),
      onMetrics: (metrics) => this.updateMetrics(metrics)
    });

    await worker.initialize();
    return worker;
  }

  async executeCommand(command, options = {}) {
    // 检查限制
    if (!this.checkLimits()) {
      throw new Error(`Account ${this.id} has reached its limits`);
    }

    // 获取可用 worker
    const worker = await this.getAvailableWorker();
    
    try {
      this.busyWorkers.add(worker);
      
      const startTime = Date.now();
      const result = await worker.execute(command, options);
      
      // 更新指标
      this.updateMetrics({
        responseTime: Date.now() - startTime,
        tokens: result.tokens,
        success: true
      });
      
      return result;
    } catch (error) {
      this.updateMetrics({ success: false, error });
      throw error;
    } finally {
      this.busyWorkers.delete(worker);
      this.availableWorkers.push(worker);
    }
  }

  checkLimits() {
    const now = Date.now();
    const hourAgo = now - 3600000;
    
    // 清理过期的统计数据
    this.metrics.hourlyRequests = this.metrics.hourlyRequests.filter(
      time => time > hourAgo
    );
    this.metrics.hourlyTokens = this.metrics.hourlyTokens.filter(
      item => item.time > hourAgo
    );

    // 检查请求限制
    if (this.metrics.hourlyRequests.length >= this.limits.maxRequestsPerHour) {
      return false;
    }

    // 检查 token 限制
    const hourlyTokenTotal = this.metrics.hourlyTokens.reduce(
      (sum, item) => sum + item.tokens, 0
    );
    if (hourlyTokenTotal >= this.limits.maxTokensPerHour) {
      return false;
    }

    // 检查并发限制
    if (this.busyWorkers.size >= this.limits.maxConcurrent) {
      return false;
    }

    return true;
  }

  updateMetrics(data) {
    const now = Date.now();
    
    if (data.success) {
      this.metrics.totalRequests++;
      this.metrics.hourlyRequests.push(now);
      
      if (data.tokens) {
        this.metrics.totalTokens += data.tokens;
        this.metrics.hourlyTokens.push({ time: now, tokens: data.tokens });
      }
      
      // 更新平均响应时间
      if (data.responseTime) {
        this.metrics.avgResponseTime = 
          (this.metrics.avgResponseTime * (this.metrics.totalRequests - 1) + 
           data.responseTime) / this.metrics.totalRequests;
      }
      
      this.metrics.lastRequestAt = now;
    } else {
      this.metrics.errors++;
    }
  }

  getStatus() {
    return {
      id: this.id,
      email: this.email,
      status: this.status,
      health: this.health,
      usage: {
        requests: this.metrics.hourlyRequests.length,
        tokens: this.metrics.hourlyTokens.reduce((sum, item) => sum + item.tokens, 0),
        concurrent: this.busyWorkers.size
      },
      limits: this.limits,
      workers: {
        total: this.workers.length,
        available: this.availableWorkers.length,
        busy: this.busyWorkers.size
      },
      metrics: this.metrics
    };
  }
}
```

### 3. 健康检查器

```javascript
// src/server/claude/HealthChecker.js
class HealthChecker {
  async check(account) {
    const checks = await Promise.all([
      this.checkAuthentication(account),
      this.checkWorkers(account),
      this.checkResponseTime(account),
      this.checkErrorRate(account)
    ]);

    const failedChecks = checks.filter(c => !c.passed);
    
    let status = 'healthy';
    if (failedChecks.length > 0) {
      status = failedChecks.some(c => c.critical) ? 'unhealthy' : 'degraded';
    }

    return {
      status,
      details: checks,
      timestamp: Date.now()
    };
  }

  async checkAuthentication(account) {
    try {
      // 尝试一个简单的 API 调用来验证认证
      const result = await account.testConnection();
      return {
        name: 'authentication',
        passed: result.success,
        critical: true,
        message: result.message
      };
    } catch (error) {
      return {
        name: 'authentication',
        passed: false,
        critical: true,
        message: error.message
      };
    }
  }

  checkWorkers(account) {
    const healthyWorkers = account.workers.filter(w => w.status === 'ready').length;
    const ratio = healthyWorkers / account.workers.length;
    
    return {
      name: 'workers',
      passed: ratio > 0.5,
      critical: ratio === 0,
      message: `${healthyWorkers}/${account.workers.length} workers healthy`,
      value: ratio
    };
  }

  checkResponseTime(account) {
    const threshold = 5000; // 5秒
    const passed = account.metrics.avgResponseTime < threshold;
    
    return {
      name: 'response_time',
      passed,
      critical: false,
      message: `Average response time: ${account.metrics.avgResponseTime}ms`,
      value: account.metrics.avgResponseTime
    };
  }

  checkErrorRate(account) {
    const totalRequests = account.metrics.totalRequests;
    if (totalRequests === 0) {
      return {
        name: 'error_rate',
        passed: true,
        critical: false,
        message: 'No requests yet',
        value: 0
      };
    }

    const errorRate = account.metrics.errors / totalRequests;
    const threshold = 0.1; // 10% 错误率
    
    return {
      name: 'error_rate',
      passed: errorRate < threshold,
      critical: errorRate > 0.5,
      message: `Error rate: ${(errorRate * 100).toFixed(2)}%`,
      value: errorRate
    };
  }
}
```

### 4. 智能路由器

```javascript
// src/server/claude/SmartRouter.js
class SmartRouter {
  constructor(accountManager) {
    this.accountManager = accountManager;
    this.routingRules = new Map();
    this.cache = new LRUCache({ max: 1000, ttl: 300000 }); // 5分钟缓存
  }

  async route(request) {
    // 1. 检查是否有特定路由规则
    const rule = this.findMatchingRule(request);
    if (rule) {
      return await this.accountManager.getAccount(rule.accountId);
    }

    // 2. 检查缓存的路由决策
    const cacheKey = this.getCacheKey(request);
    const cachedAccount = this.cache.get(cacheKey);
    if (cachedAccount && cachedAccount.isHealthy()) {
      return cachedAccount;
    }

    // 3. 智能选择账号
    const account = await this.selectAccount(request);
    
    // 4. 缓存路由决策
    this.cache.set(cacheKey, account);
    
    return account;
  }

  async selectAccount(request) {
    // 根据请求特征选择最合适的账号
    const accounts = await this.accountManager.getHealthyAccounts();
    
    // 评分机制
    const scores = accounts.map(account => ({
      account,
      score: this.calculateScore(account, request)
    }));

    // 选择得分最高的账号
    scores.sort((a, b) => b.score - a.score);
    return scores[0].account;
  }

  calculateScore(account, request) {
    let score = 100;

    // 1. 使用率评分（使用率越低分数越高）
    const usage = account.getUsagePercentage();
    score -= usage * 0.5;

    // 2. 响应时间评分
    const responseTime = account.metrics.avgResponseTime;
    score -= Math.min(responseTime / 100, 30); // 最多扣30分

    // 3. 错误率评分
    const errorRate = account.getErrorRate();
    score -= errorRate * 100;

    // 4. 优先级加分
    score += account.priority * 10;

    // 5. 模型匹配度（如果请求特定模型）
    if (request.model && account.supportsModel(request.model)) {
      score += 20;
    }

    // 6. 地理位置（如果有）
    if (request.region && account.region === request.region) {
      score += 15;
    }

    return Math.max(0, score);
  }

  addRoutingRule(rule) {
    // 添加特定的路由规则
    // 例如：某些 API Key 总是路由到特定账号
    this.routingRules.set(rule.id, {
      match: rule.match, // 匹配条件
      accountId: rule.accountId, // 目标账号
      priority: rule.priority || 0
    });
  }
}
```

### 5. 配置示例

```javascript
// config/claude-accounts.js
module.exports = {
  loadBalancing: {
    strategy: 'least-usage', // round-robin, least-usage, weighted, least-connections
    healthCheckInterval: 30000, // 30秒
    cooldownPeriod: 300000, // 5分钟
    migrateActiveSessions: true
  },
  
  accounts: [
    {
      id: 'account-1',
      email: 'claude1@example.com',
      credentials: {
        type: 'oauth',
        refreshToken: process.env.CLAUDE_ACCOUNT_1_TOKEN
      },
      maxWorkers: 5,
      priority: 2, // 优先级更高
      limits: {
        maxRequestsPerHour: 1000,
        maxTokensPerHour: 1000000,
        maxConcurrent: 10
      }
    },
    {
      id: 'account-2',
      email: 'claude2@example.com',
      credentials: {
        type: 'api-key',
        apiKey: process.env.CLAUDE_ACCOUNT_2_API_KEY
      },
      maxWorkers: 5,
      priority: 1,
      limits: {
        maxRequestsPerHour: 1000,
        maxTokensPerHour: 1000000,
        maxConcurrent: 10
      }
    },
    {
      id: 'account-3',
      email: 'claude3@example.com',
      credentials: {
        type: 'oauth',
        refreshToken: process.env.CLAUDE_ACCOUNT_3_TOKEN
      },
      maxWorkers: 3,
      priority: 0, // 备用账号
      limits: {
        maxRequestsPerHour: 500,
        maxTokensPerHour: 500000,
        maxConcurrent: 5
      }
    }
  ],
  
  routingRules: [
    {
      id: 'premium-users',
      match: { 
        apiKey: { pattern: /^sk-premium-/ }
      },
      accountId: 'account-1' // 高级用户路由到优先账号
    },
    {
      id: 'heavy-usage',
      match: {
        tokensPerRequest: { min: 10000 }
      },
      accountId: 'account-2' // 大请求路由到特定账号
    }
  ]
};
```

### 6. 监控面板数据

```javascript
// src/server/api/admin/accounts.js
class AccountsAdminAPI {
  async getAccountsStatus(req, res) {
    const accounts = await this.accountManager.getAllAccounts();
    
    const status = accounts.map(account => ({
      id: account.id,
      email: account.email,
      status: account.status,
      health: account.health,
      usage: {
        requestsPerHour: account.metrics.hourlyRequests.length,
        tokensPerHour: account.getHourlyTokens(),
        percentageUsed: account.getUsagePercentage(),
        concurrent: account.busyWorkers.size
      },
      performance: {
        avgResponseTime: account.metrics.avgResponseTime,
        errorRate: account.getErrorRate(),
        uptime: account.getUptime()
      },
      workers: {
        total: account.workers.length,
        available: account.availableWorkers.length,
        busy: account.busyWorkers.size
      },
      lastActivity: account.metrics.lastRequestAt
    }));

    res.json({
      success: true,
      accounts: status,
      summary: {
        totalAccounts: accounts.length,
        healthyAccounts: accounts.filter(a => a.health === 'healthy').length,
        totalCapacity: {
          requestsPerHour: accounts.reduce((sum, a) => sum + a.limits.maxRequestsPerHour, 0),
          tokensPerHour: accounts.reduce((sum, a) => sum + a.limits.maxTokensPerHour, 0),
          concurrent: accounts.reduce((sum, a) => sum + a.limits.maxConcurrent, 0)
        },
        currentUsage: {
          requestsPerHour: accounts.reduce((sum, a) => sum + a.metrics.hourlyRequests.length, 0),
          tokensPerHour: accounts.reduce((sum, a) => sum + a.getHourlyTokens(), 0),
          concurrent: accounts.reduce((sum, a) => sum + a.busyWorkers.size, 0)
        }
      }
    });
  }

  async switchAccount(req, res) {
    const { fromAccountId, toAccountId } = req.body;
    
    try {
      await this.accountManager.manualSwitch(fromAccountId, toAccountId);
      res.json({
        success: true,
        message: `Switched from ${fromAccountId} to ${toAccountId}`
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  async updateAccountLimits(req, res) {
    const { accountId } = req.params;
    const { limits } = req.body;
    
    try {
      await this.accountManager.updateAccountLimits(accountId, limits);
      res.json({
        success: true,
        message: 'Account limits updated'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
}
```

## 优势

1. **高可用性**: 一个账号出问题自动切换到其他账号
2. **负载均衡**: 根据使用情况智能分配请求
3. **成本优化**: 充分利用多个套餐的额度
4. **灵活配置**: 支持不同的负载均衡策略
5. **实时监控**: 可以实时查看每个账号的状态和使用情况
6. **智能路由**: 根据请求特征选择最合适的账号

## 使用场景

1. **多套餐组合**: 组合使用多个 $200 套餐
2. **主备模式**: 主账号用完自动切换到备用账号
3. **分级服务**: 高级用户路由到专用账号
4. **地域优化**: 根据地理位置选择最近的账号
5. **故障隔离**: 某个账号异常不影响整体服务