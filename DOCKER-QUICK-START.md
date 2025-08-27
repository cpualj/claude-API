# 🚀 Docker 快速启动指南

## 当前状态

我已经为你准备好了以下文件：
- ✅ `docker-compose-dev.yml` - 开发环境 Docker 配置
- ✅ `.env.docker` - 环境变量配置文件
- ✅ `start-docker-dev.bat` - 一键启动脚本
- ✅ 必要的目录结构

## 🎯 立即行动步骤

### 步骤 1：启动 Docker Desktop

1. **手动启动 Docker Desktop**
   - 在 Windows 开始菜单搜索 "Docker Desktop"
   - 点击启动
   - 等待 Docker 图标变为绿色（通常需要 1-2 分钟）

2. **验证 Docker 运行状态**
   打开新的命令提示符，运行：
   ```cmd
   docker ps
   ```
   如果显示表格（即使为空），说明 Docker 已经运行。

### 步骤 2：启动开发环境

在命令提示符中运行：
```cmd
cd "C:\Users\jiang\claude API"
start-docker-dev.bat
```

这个脚本会：
- 检查 Docker 状态
- 构建必要的镜像
- 启动所有服务
- 显示健康检查结果

### 步骤 3：验证服务

1. **检查 API 健康状态**
   ```cmd
   curl http://localhost:3000/health
   ```

2. **查看运行的容器**
   ```cmd
   docker ps
   ```
   
   你应该看到以下容器：
   - claude-redis-dev
   - claude-postgres-dev
   - claude-test-worker
   - claude-orchestrator-dev

3. **查看日志**
   ```cmd
   docker-compose -f docker-compose-dev.yml logs -f
   ```

### 步骤 4：测试基本功能

1. **测试 Redis 连接**
   ```cmd
   docker exec -it claude-redis-dev redis-cli ping
   ```
   应该返回 "PONG"

2. **测试 PostgreSQL 连接**
   ```cmd
   docker exec -it claude-postgres-dev psql -U claude_user -d claude_api -c "SELECT 1"
   ```

3. **测试 API 端点**
   ```cmd
   curl -X POST http://localhost:3000/api/chat ^
     -H "Content-Type: application/json" ^
     -d "{\"message\": \"Hello\", \"sessionId\": \"test\"}"
   ```

## 🔧 故障排除

### 问题 1：Docker Desktop 未运行
**症状**: 运行 `docker ps` 显示错误
**解决**: 手动启动 Docker Desktop，等待 2 分钟后重试

### 问题 2：端口被占用
**症状**: 启动失败，提示端口已被使用
**解决**: 
```cmd
# 查看端口占用
netstat -an | findstr :3000
netstat -an | findstr :5432
netstat -an | findstr :6379

# 停止占用端口的服务，或修改 docker-compose-dev.yml 中的端口
```

### 问题 3：构建失败
**症状**: Docker 镜像构建失败
**解决**:
```cmd
# 清理 Docker 缓存
docker system prune -a

# 重新构建
docker-compose -f docker-compose-dev.yml build --no-cache
```

## 📊 服务说明

| 服务 | 端口 | 说明 |
|-----|------|------|
| Orchestrator | 3000 | API 网关和负载均衡器 |
| Redis | 6379 | 队列和缓存管理 |
| PostgreSQL | 5432 | 数据持久化 |
| Test Worker | 4001 | 测试工作节点 |

## 🎉 成功标志

当你看到以下内容时，说明系统启动成功：

1. `docker ps` 显示 4 个运行中的容器
2. http://localhost:3000/health 返回 JSON 响应
3. 日志中没有错误信息

## 下一步

一旦基础服务运行成功，我们可以：

1. **添加真实 Claude 账号**
   - 编辑 `.env.docker` 文件
   - 添加你的 Claude Pro 账号信息
   - 重启服务

2. **启动完整的多账号系统**
   ```cmd
   docker-compose -f docker-compose-multi-account.yml up -d
   ```

3. **连接前端界面**
   - 启动 React 前端
   - 连接到 API

---

**需要帮助？** 
- 查看日志: `docker-compose -f docker-compose-dev.yml logs -f`
- 重启服务: `docker-compose -f docker-compose-dev.yml restart`
- 停止服务: `docker-compose -f docker-compose-dev.yml down`