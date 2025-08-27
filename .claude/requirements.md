# Claude CLI API Wrapper 需求文档

## 项目概述

### 背景
为了充分利用 $200 Claude Code 套餐，需要开发一个 API 服务，将本地 Claude 命令行工具封装成可通过 HTTP 调用的 API 服务。该系统需要支持多租户访问、API Key 管理、并发请求处理等功能。

### 目标
1. 将 Claude CLI 封装成 RESTful API 和 WebSocket 服务
2. 实现安全的身份认证和 API Key 管理
3. 支持多个 API 同时调用而不冲突
4. 提供管理员界面进行 API Key 维护
5. 实现使用量追踪和配额管理

## 功能需求

### 1. API 服务端

#### 1.1 核心 API 接口
- **POST /api/chat** - 发送消息到 Claude
  - 支持流式响应 (SSE/WebSocket)
  - 支持非流式响应
  - 参数：message, model, temperature, max_tokens, system_prompt
  
- **POST /api/conversations** - 创建新会话
  - 返回 conversation_id
  
- **GET /api/conversations/:id** - 获取会话历史
  
- **DELETE /api/conversations/:id** - 删除会话
  
- **POST /api/conversations/:id/continue** - 继续现有会话
  
- **GET /api/models** - 获取可用模型列表

#### 1.2 会话管理
- 使用独立的 Claude CLI 进程池
- 每个 API Key 对应独立的会话上下文
- 实现会话隔离，防止串话
- 支持会话持久化和恢复
- 实现会话超时自动清理

#### 1.3 并发处理
- 使用进程池管理多个 Claude CLI 实例
- 实现请求队列和负载均衡
- 支持最大并发数配置
- 实现请求超时控制

### 2. 身份认证与授权

#### 2.1 管理员认证
- 集成现有 JWT 认证系统
- 管理员角色权限控制
- 支持多种认证方式（JWT、Firebase、Auth0 等）

#### 2.2 API Key 管理
- **POST /admin/api-keys** - 创建 API Key
- **GET /admin/api-keys** - 列出所有 API Key
- **PUT /admin/api-keys/:id** - 更新 API Key 配置
- **DELETE /admin/api-keys/:id** - 删除 API Key
- **POST /admin/api-keys/:id/rotate** - 轮换 API Key

#### 2.3 API Key 属性
```json
{
  "id": "uuid",
  "key": "sk-xxx",
  "name": "用户/项目名称",
  "status": "active|suspended|expired",
  "created_at": "timestamp",
  "expires_at": "timestamp",
  "last_used_at": "timestamp",
  "usage_limit": {
    "requests_per_minute": 10,
    "requests_per_day": 1000,
    "tokens_per_day": 100000
  },
  "permissions": {
    "models": ["claude-3-opus", "claude-3-sonnet"],
    "max_tokens": 4096,
    "allow_streaming": true
  },
  "metadata": {
    "user_id": "xxx",
    "project": "xxx",
    "description": "xxx"
  }
}
```

### 3. 管理界面

#### 3.1 Dashboard
- API Key 列表管理
- 使用统计图表
- 实时请求监控
- 系统状态显示

#### 3.2 API Key 管理页面
- 创建新 API Key
- 编辑 API Key 配置
- 查看使用历史
- 设置配额限制
- 暂停/激活 API Key

#### 3.3 监控页面
- 实时请求日志
- 错误日志查看
- 性能指标监控
- Claude CLI 进程状态

### 4. 使用量追踪

#### 4.1 指标收集
- 请求次数
- Token 使用量
- 响应时间
- 错误率
- 并发数

#### 4.2 数据存储
```json
{
  "api_key_id": "xxx",
  "timestamp": "xxx",
  "endpoint": "/api/chat",
  "method": "POST",
  "request_tokens": 100,
  "response_tokens": 500,
  "total_tokens": 600,
  "response_time_ms": 2500,
  "status_code": 200,
  "model": "claude-3-opus",
  "error": null
}
```

### 5. 安全需求

#### 5.1 API 安全
- HTTPS 强制
- Rate limiting
- IP 白名单（可选）
- 请求签名验证（可选）
- CORS 配置

#### 5.2 数据安全
- API Key 加密存储
- 敏感信息脱敏
- 审计日志
- 自动清理过期数据

## 技术架构

### 1. 后端技术栈
- **Node.js + Express/Fastify** - API 服务器
- **Socket.io** - WebSocket 支持
- **Bull/BullMQ** - 任务队列
- **Redis** - 缓存和会话存储
- **PostgreSQL/MongoDB** - 数据持久化
- **PM2** - 进程管理

### 2. Claude CLI 集成
- 使用 child_process 或 execa 管理 CLI 进程
- 实现进程池管理
- 处理 stdout/stderr 流
- 实现优雅的错误处理

### 3. 前端集成
- 基于现有 React + Material-UI 架构
- 新增管理页面路由
- 集成现有认证系统
- 复用现有组件库

## 非功能需求

### 1. 性能要求
- API 响应时间 < 500ms（不含 Claude 处理时间）
- 支持至少 100 个并发连接
- 支持至少 10 个并发 Claude CLI 进程
- 内存使用 < 2GB

### 2. 可用性要求
- 服务可用性 > 99%
- 自动故障恢复
- 健康检查端点
- 优雅关闭

### 3. 可扩展性
- 支持水平扩展
- 模块化设计
- 插件化架构
- 配置外部化

## 实施计划

### Phase 1: MVP (第1-2周)
1. 基础 API 服务搭建
2. Claude CLI 进程管理
3. 简单的 API Key 认证
4. 基础 chat 接口

### Phase 2: 核心功能 (第3-4周)
1. 完整的 API Key 管理
2. 会话管理和隔离
3. 管理界面开发
4. 使用量追踪

### Phase 3: 优化和增强 (第5-6周)
1. 性能优化
2. 监控和日志
3. 安全加固
4. 文档编写

## 参考实现

基于调研，以下开源项目可作为参考：

1. **claude-code-openai-wrapper** - OpenAI 兼容 API 实现
2. **claude-code-router** - 请求路由和模型切换
3. **claudia** - GUI 和会话管理
4. **claude-ai-toolkit** - Python API 封装

## 风险和挑战

1. **并发冲突**: 需要确保多个 CLI 进程之间的隔离
2. **资源限制**: Claude CLI 可能有并发限制
3. **成本控制**: 需要监控和控制使用量
4. **安全风险**: API Key 泄露风险
5. **性能瓶颈**: CLI 进程启动开销

## 成功指标

1. 支持至少 10 个用户同时使用
2. API 响应成功率 > 99%
3. 平均响应时间 < 3秒
4. 零安全事件
5. 用户满意度 > 90%