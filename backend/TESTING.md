# Claude API Backend - Testing Suite

完整的 Vitest 测试套件，覆盖后端所有核心功能。

## 🧪 测试概览

### 测试统计
- **测试文件**: 10个主要测试文件
- **测试覆盖**: 数据库、服务层、API路由
- **测试类型**: 单元测试、集成测试、端到端测试
- **预期覆盖率**: >90%

### 测试结构
```
tests/
├── setup.js                    # 测试环境配置
├── db/
│   └── init.test.js            # 数据库初始化和操作
├── services/
│   ├── redis.test.js           # Redis 缓存和队列服务
│   ├── workerManager.test.js   # Worker 进程管理
│   ├── apiKeyManager.test.js   # API 密钥管理
│   └── sessionManager.test.js  # 会话管理
└── routes/
    ├── auth.test.js            # 用户认证路由
    ├── api.test.js             # 主要 API 端点
    ├── admin.test.js           # 管理员功能
    └── health.test.js          # 健康检查和监控
```

## 🚀 快速开始

### 1. 环境检查
```bash
npm run test:setup
```

### 2. 安装依赖
```bash
npm install
```

### 3. 运行测试
```bash
npm test              # 监视模式
npm run test:run      # 运行一次
npm run test:ui       # 可视化界面
npm run test:coverage # 生成覆盖率报告
```

## 📋 测试详情

### 数据库测试 (tests/db/init.test.js)
- ✅ 数据库连接和初始化
- ✅ 数据库架构验证
- ✅ CRUD 操作测试
- ✅ 事务处理
- ✅ 错误处理

### Redis 服务测试 (tests/services/redis.test.js)
- ✅ Redis 连接管理
- ✅ 会话缓存 (SessionCache)
- ✅ Worker 状态管理 (WorkerStatusManager)  
- ✅ 请求队列 (RequestQueue)
- ✅ 速率限制 (RateLimiter)
- ✅ TTL 和过期处理

### Worker 管理测试 (tests/services/workerManager.test.js)
- ✅ Worker 注册和管理
- ✅ 请求处理和负载均衡
- ✅ 队列管理
- ✅ 进程生命周期
- ✅ 错误恢复和重启
- ✅ 优雅关闭

### API 密钥管理测试 (tests/services/apiKeyManager.test.js)
- ✅ API 密钥生成和验证
- ✅ 速率限制检查
- ✅ 使用情况记录
- ✅ 统计信息生成
- ✅ 缓存管理
- ✅ 密钥生命周期管理

### 会话管理测试 (tests/services/sessionManager.test.js)
- ✅ 会话创建和检索
- ✅ 会话更新和删除
- ✅ 上下文管理
- ✅ 会话列表和过滤
- ✅ 自动清理
- ✅ 缓存策略

### 认证路由测试 (tests/routes/auth.test.js)
- ✅ 用户注册和验证
- ✅ 登录和 JWT 生成
- ✅ 登出和令牌黑名单
- ✅ 用户资料管理
- ✅ 密码重置流程
- ✅ 权限验证

### API 路由测试 (tests/routes/api.test.js)
- ✅ 聊天 API (流式和非流式)
- ✅ 会话 CRUD 操作
- ✅ 工具列表获取
- ✅ 使用统计查询
- ✅ 配额检查
- ✅ API 密钥认证

### 管理员路由测试 (tests/routes/admin.test.js)
- ✅ 用户管理 (CRUD)
- ✅ API 密钥管理
- ✅ 系统统计信息
- ✅ 管理员权限验证
- ✅ 审计日志
- ✅ 安全控制

### 健康检查测试 (tests/routes/health.test.js)
- ✅ 基础健康检查
- ✅ 详细服务状态
- ✅ 存活和就绪探针
- ✅ Prometheus 指标
- ✅ 系统监控
- ✅ 性能指标

## 🔧 测试配置

### 环境变量 (.env.test)
```env
NODE_ENV=test
DATABASE_URL=postgresql://postgres:password@localhost:5432/claude_api_test
REDIS_URL=redis://localhost:6380
JWT_SECRET=test-secret-key
MAX_WORKERS=2
DEFAULT_RATE_LIMIT_PER_HOUR=100
```

### Vitest 配置 (vitest.config.js)
- 测试环境: Node.js
- 超时设置: 30秒
- 覆盖率提供商: V8
- 并行执行: 单线程模式
- 设置文件: tests/setup.js

## 📊 覆盖率目标

| 指标 | 目标 | 当前状态 |
|------|------|----------|
| 语句覆盖率 | >90% | 🎯 待测试 |
| 分支覆盖率 | >85% | 🎯 待测试 |
| 函数覆盖率 | >90% | 🎯 待测试 |
| 行覆盖率 | >90% | 🎯 待测试 |

## 🛠️ 测试工具

### 核心依赖
- **Vitest**: 现代测试框架
- **Supertest**: HTTP 断言库  
- **Redis Memory Server**: 内存 Redis 实例
- **bcryptjs**: 密码哈希测试

### Mock 策略
- **Socket.IO**: 完全模拟实时功能
- **Child Process**: 模拟 Worker 进程
- **文件系统**: 临时文件处理
- **时间控制**: 超时和 TTL 测试

## 🏃‍♂️ 运行特定测试

```bash
# 数据库测试
npx vitest run tests/db/

# 服务层测试  
npx vitest run tests/services/

# 路由测试
npx vitest run tests/routes/

# 单个文件
npx vitest run tests/services/redis.test.js

# 监视模式
npx vitest tests/services/redis.test.js
```

## 🐛 调试测试

### 详细输出
```bash
npx vitest run --reporter=verbose
LOG_LEVEL=debug npm test
```

### 隔离问题
```bash
# 顺序执行
npx vitest run --no-threads

# 单文件调试
npx vitest run tests/problematic.test.js --reporter=verbose
```

## 🔍 测试模式

### 开发模式
```bash
npm test                    # 监视文件变化
npm run test:ui            # 可视化测试界面
```

### CI/CD 模式
```bash
npm run test:run           # 一次性运行
npm run test:coverage      # 生成覆盖率
```

## 📈 性能测试

### 负载测试
- 速率限制有效性
- Worker 扩展行为  
- 数据库连接池
- 缓存性能表现

### 内存测试
- 内存泄漏检测
- 缓存大小限制
- 垃圾回收效率
- 资源清理验证

## 🚨 故障排除

### 常见问题

#### 数据库连接失败
```bash
# 检查 PostgreSQL 状态
pg_ctl status

# 创建测试数据库
createdb claude_api_test

# 重置测试数据库
dropdb claude_api_test && createdb claude_api_test
```

#### Redis 连接失败
```bash
# 检查 Redis 内存服务器安装
npm install --save-dev redis-memory-server

# 检查端口占用
lsof -i :6380
```

#### 端口冲突
```bash
# 检查端口使用情况
netstat -tulpn | grep :3002

# 终止占用进程
kill -9 $(lsof -t -i:3002)
```

#### 内存不足
```bash
# 增加 Node.js 内存限制
NODE_OPTIONS="--max-old-space-size=4096" npm test
```

## 📝 最佳实践

### 编写测试
1. **描述性命名**: 清晰的测试描述
2. **单一断言**: 每个测试一个概念
3. **AAA 模式**: 安排-执行-断言
4. **错误测试**: 测试成功和失败路径
5. **边界情况**: 边界条件和限制

### 测试组织
1. **逻辑分组**: 相关测试放在一起
2. **设置/清理**: 适当的资源管理
3. **隔离性**: 测试间不相互依赖
4. **性能**: 快速反馈循环

### 维护
1. **定期更新**: 保持测试与代码同步
2. **不稳定测试**: 修复或删除不可靠测试
3. **覆盖率监控**: 维持高覆盖率
4. **文档更新**: 保持测试文档最新

## 🎯 下一步计划

### 短期目标
- [ ] 达到 90% 代码覆盖率
- [ ] 集成 GitHub Actions CI
- [ ] 添加性能基准测试
- [ ] 完善错误场景测试

### 长期目标
- [ ] 添加端到端测试套件
- [ ] 实现测试数据工厂
- [ ] 添加视觉回归测试
- [ ] 集成安全测试工具

## 📚 相关文档

- [Vitest 官方文档](https://vitest.dev/)
- [Supertest 使用指南](https://github.com/visionmedia/supertest)
- [Node.js 测试最佳实践](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Claude API 后端架构](./README.md)