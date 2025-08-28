# Claude CLI Pool - 多实例并发包装系统

## 🎯 系统概述

这是一个基于 Claude CLI 的进程池管理系统，利用了 **Claude CLI 可以在多个 CMD 窗口中同时运行**的特性，将其包装成支持并发请求的 API 服务。

## 💡 核心原理

```
┌─────────────────────────────────────────────────┐
│                  API 请求入口                     │
└──────────────────┬──────────────────────────────┘
                   │
          ┌────────▼────────┐
          │   负载均衡器     │
          └────────┬────────┘
                   │
    ┌──────────────┼──────────────┐
    │              │              │
┌───▼───┐     ┌───▼───┐     ┌───▼───┐
│ CLI-1 │     │ CLI-2 │     │ CLI-3 │
│       │     │       │     │       │
│ CMD   │     │ CMD   │     │ CMD   │
│ 进程  │     │ 进程  │     │ 进程  │
└───────┘     └───────┘     └───────┘
   独立          独立          独立
  会话          会话          会话
```

## ✨ 关键特性

### 1. **多进程并发**
- 每个 Claude CLI 实例运行在独立的进程中
- 多个实例可以同时处理不同的请求
- 互不干扰，各自维护独立的对话上下文

### 2. **自动负载均衡**
- 智能分配请求到空闲的 CLI 实例
- 当所有实例忙碌时，新请求会排队等待

### 3. **实例生命周期管理**
- 自动创建和回收 CLI 实例
- 定期健康检查，替换异常实例
- 根据负载动态调整实例数量

### 4. **会话隔离**
- 每个 CLI 实例维护独立的对话历史
- 不同用户的请求互不影响
- 支持多个独立的会话同时进行

## 🚀 快速开始

### 1. 确保 Claude CLI 已登录
```bash
claude --version
# 如果未登录，执行：
# claude login
```

### 2. 启动 CLI 池服务器
```bash
cd backend
node server-cli-pool.js
```

### 3. 使用 API

#### 初始化池
```javascript
POST http://localhost:3004/api/cli-pool/initialize
{
  "minInstances": 3,    // 最少保持3个CLI实例
  "maxInstances": 10    // 最多创建10个CLI实例
}
```

#### 发送单条消息
```javascript
POST http://localhost:3004/api/cli-pool/chat
{
  "message": "你好，Claude！",
  "sessionId": "user-123"
}
```

#### 批量并发处理
```javascript
POST http://localhost:3004/api/cli-pool/chat-batch
{
  "messages": [
    { "message": "问题1", "sessionId": "session-1" },
    { "message": "问题2", "sessionId": "session-2" },
    { "message": "问题3", "sessionId": "session-3" }
  ]
}
```

## 📊 性能特点

### 并发处理能力
- **并发数量**：取决于配置的最大实例数
- **响应时间**：多个请求并行处理，总时间约等于最慢的单个请求
- **吞吐量**：随实例数量线性增长

### 资源使用
- 每个 CLI 实例是独立进程
- 内存使用：每个实例约 50-100MB
- CPU使用：处理时占用，空闲时极低

## 🛠️ 配置选项

```javascript
{
  minInstances: 2,           // 最小实例数
  maxInstances: 10,          // 最大实例数
  maxMessagesPerInstance: 100, // 每个实例最多处理消息数
  maxInstanceAge: 3600000,   // 实例最大存活时间（1小时）
  staleTimeout: 600000,      // 空闲超时时间（10分钟）
  healthCheckInterval: 30000 // 健康检查间隔（30秒）
}
```

## 📈 监控与统计

获取池状态：
```javascript
GET http://localhost:3004/api/cli-pool/stats
```

返回信息包括：
- 总请求数、成功/失败数
- 平均响应时间
- 池使用率
- 各实例详细状态

## 🔧 实现细节

### ClaudeCliInstance 类
- 管理单个 Claude CLI 进程
- 处理消息发送和响应接收
- 维护会话历史

### ClaudeCliPoolService 类
- 管理多个 CLI 实例
- 实现负载均衡
- 处理实例回收和健康检查

### API 路由
- `/api/cli-pool/chat` - 单消息处理
- `/api/cli-pool/chat-batch` - 批量处理
- `/api/cli-pool/stats` - 统计信息
- `/api/cli-pool/health` - 健康检查

## 🎭 使用场景

1. **高并发 API 服务**
   - 将 Claude 能力包装成 REST API
   - 支持多用户同时访问

2. **批量数据处理**
   - 同时处理多个文档
   - 并行分析多个问题

3. **多租户应用**
   - 每个用户独立会话
   - 互不影响的对话上下文

4. **负载测试**
   - 测试 Claude 的并发处理能力
   - 评估系统性能

## ⚠️ 注意事项

1. **CLI 登录状态**
   - 确保 Claude CLI 已经登录
   - 所有实例共享同一个登录凭证

2. **资源限制**
   - 注意系统进程数限制
   - 监控内存使用情况

3. **错误处理**
   - 实例崩溃会自动重启
   - 请求失败会自动重试

## 🚧 测试

运行测试脚本：
```bash
# 直接测试（不需要服务器）
node test-cli-direct.js

# API 测试（需要先启动服务器）
node test-cli-pool.js
```

## 📝 总结

这个系统成功地将 Claude CLI 的单实例限制转换为支持高并发的 API 服务，充分利用了 Claude CLI 可以多实例运行的特性，实现了：

- ✅ 多个 CLI 实例并发运行
- ✅ 每个实例独立会话上下文  
- ✅ 自动负载均衡和故障恢复
- ✅ RESTful API 接口
- ✅ 完整的监控和管理功能

这样你就可以利用 Claude Code 的 200 美元套餐，通过 CLI 包装出一个可扩展的 API 服务！