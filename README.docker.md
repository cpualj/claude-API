# Claude API Wrapper - Docker 一键部署

## 🚀 快速开始

### 1. 前置要求
- Docker Desktop (Windows/Mac) 或 Docker Engine (Linux)
- Docker Compose
- 至少一个 Claude 账号或 API Key

### 2. 一键部署

#### Windows 用户：
```bash
# 双击运行
start.bat
```

#### Mac/Linux 用户：
```bash
# 添加执行权限
chmod +x start.sh

# 运行启动脚本
./start.sh
```

### 3. 配置文件

首次运行会自动创建 `.env` 文件，需要编辑以下关键配置：

```env
# Claude API Key (必填)
CLAUDE_API_KEY=sk-ant-api03-xxx

# 或使用多账号 (可选)
CLAUDE_ACCOUNTS='[{"email":"account1@example.com","apiKey":"sk-ant-xxx"}]'

# 安全密钥 (必须修改)
JWT_SECRET=your-super-secret-key-change-this

# 管理员密码 (必须修改)
ADMIN_PASSWORD=your-secure-password
```

## 📦 包含的服务

| 服务 | 端口 | 说明 |
|------|------|------|
| Frontend | 3030 | React 管理界面 |
| Backend | 3001 | Express API 服务器 |
| Worker | 3002-3003 | Claude CLI 工作节点 |
| PostgreSQL | 5432 | 数据库 |
| Redis | 6379 | 缓存和会话 |
| Nginx | 80 | 反向代理 |

## 🎯 功能特性

### 核心功能
- ✅ **API 封装**: 将 Claude CLI 封装成 RESTful API
- ✅ **多账号支持**: 自动负载均衡和故障转移
- ✅ **API Key 管理**: 创建、管理、限流
- ✅ **使用追踪**: 详细的使用统计和日志
- ✅ **流式响应**: 支持 SSE 实时输出
- ✅ **会话管理**: 保持上下文对话

### 管理功能
- 📊 实时监控面板
- 🔑 API Key 增删改查
- 📈 使用量统计图表
- 👥 多用户权限管理
- 🔄 自动健康检查
- 📝 详细操作日志

## 🖥️ 使用方法

### 1. 访问管理界面
打开浏览器访问: http://localhost

使用管理员账号登录：
- 邮箱: admin@example.com
- 密码: (查看 .env 文件中的 ADMIN_PASSWORD)

### 2. 创建 API Key
1. 登录管理界面
2. 进入 "API Keys" 页面
3. 点击 "Create New Key"
4. 设置名称和限制
5. 复制生成的 API Key

### 3. 调用 API

#### 简单对话
```bash
curl -X POST http://localhost/api/chat \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "message": "Hello, Claude!",
    "stream": false
  }'
```

#### 流式响应
```javascript
const eventSource = new EventSource(
  'http://localhost/api/chat/stream?message=Hello&apiKey=your-api-key'
);

eventSource.onmessage = (event) => {
  console.log('Received:', event.data);
};
```

#### Python 示例
```python
import requests

response = requests.post(
    'http://localhost/api/chat',
    headers={'X-API-Key': 'your-api-key'},
    json={'message': 'Hello, Claude!'}
)

print(response.json())
```

## 🔧 运维管理

### 查看日志
```bash
# 查看所有服务日志
docker-compose logs -f

# 查看特定服务日志
docker-compose logs -f backend
docker-compose logs -f worker1
```

### 服务管理
```bash
# 停止所有服务
docker-compose down

# 重启服务
docker-compose restart

# 查看服务状态
docker-compose ps
```

### 数据备份
```bash
# 备份数据库
docker-compose exec postgres pg_dump -U claude_user claude_api > backup.sql

# 恢复数据库
docker-compose exec -T postgres psql -U claude_user claude_api < backup.sql
```

## 🚨 故障排查

### 1. Docker 未启动
- Windows: 启动 Docker Desktop
- Linux: `sudo systemctl start docker`

### 2. 端口被占用
编辑 `docker-compose.yml` 修改端口映射：
```yaml
ports:
  - "8080:80"  # 改为其他端口
```

### 3. Claude CLI 连接失败
检查 `.env` 中的 `CLAUDE_API_KEY` 是否正确

### 4. 数据库连接失败
```bash
# 重置数据库
docker-compose down -v
docker-compose up -d
```

## 📊 性能优化

### 1. 增加 Worker 节点
编辑 `docker-compose.yml`，复制 worker2 配置创建 worker3, worker4...

### 2. 调整并发限制
编辑 `.env`:
```env
MAX_CONCURRENT=10  # 增加并发数
```

### 3. 使用外部数据库
修改 `DATABASE_URL` 指向外部 PostgreSQL 实例

## 🔐 安全建议

1. **修改默认密码**: 必须修改 `.env` 中的所有默认密码
2. **使用 HTTPS**: 生产环境配置 SSL 证书
3. **限制 IP**: 配置防火墙只允许特定 IP 访问
4. **定期备份**: 设置自动备份策略
5. **监控告警**: 配置异常监控和告警

## 📝 API 文档

### Endpoints

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | /api/auth/login | 用户登录 |
| POST | /api/auth/register | 用户注册 |
| GET | /api/keys | 获取 API Keys |
| POST | /api/keys | 创建 API Key |
| DELETE | /api/keys/:id | 删除 API Key |
| POST | /api/chat | 发送消息 |
| GET | /api/chat/stream | 流式对话 |
| GET | /api/stats | 获取统计数据 |
| GET | /health | 健康检查 |

### 请求示例

#### 创建 API Key
```json
POST /api/keys
Authorization: Bearer <jwt-token>

{
  "name": "My App",
  "limits": {
    "requests_per_minute": 10,
    "tokens_per_day": 100000
  }
}
```

#### 聊天请求
```json
POST /api/chat
X-API-Key: <your-api-key>

{
  "message": "Explain quantum computing",
  "model": "claude-3-sonnet",
  "max_tokens": 2000,
  "stream": false
}
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🙏 致谢

- Claude by Anthropic
- React + Material-UI
- Docker & Docker Compose
- PostgreSQL & Redis