## Prerequisites

- Node.js >=20 (Recommended)
- Docker & Docker Compose (推荐用于后端服务)

## Installation

**前端开发服务 (Frontend Development Server)**

**Using Yarn (Recommended)**

```sh
yarn install
yarn dev
```

**Using Npm**

```sh
npm i
npm run dev
```

## 后端服务启动 (Backend Services)

### 🚀 快速启动 (一键启动脚本)

```bash
# 使用一键启动脚本 (推荐)
chmod +x start.sh
./start.sh
```

**启动模式选择:**
- **基础模式**: 单个 Worker (轻量级)
- **高级模式**: 多个 Worker，负载均衡 (生产环境推荐)
- **开发模式**: 前台运行，显示实时日志

### 🔧 手动启动后端服务

**🌟 推荐: Smart Claude CLI 服务 (端口 3006) - 新架构**
```bash
# 智能动态Claude实例管理 (推荐)
node backend/server-smart-claude.js

# 特性：
# ✨ 零预分配 - 完全按需创建实例
# 🧠 智能回收 - 5分钟无活动自动销毁
# 🔄 会话管理 - 对话连续性保持
# 📊 动态扩展 - 根据实际需求自动伸缩
# 💾 内存高效 - 比池化模式更节省资源
```

**传统 Claude CLI Pool 服务 (端口 3004)**
```bash
# 方式1: 直接运行
node backend/server-cli-pool.js

# 方式2: 使用 Docker
docker-compose up -d backend worker1

# 方式3: 开发模式运行
npm run dev:backend
```

**其他后端服务**
```bash
# Claude API 服务 (端口 3001)
node backend/server-claude.js

# 多账户服务 (端口 3002) 
node backend/server-multi-account.js

# Pool 服务 (端口 3003)
node backend/server-pool.js

# 浏览器 Pool 服务 (端口 3005)
node backend/server-browser-pool.js
```

### 📊 服务状态检查

```bash
# 检查 Smart Claude CLI 服务 (新架构，推荐)
curl http://localhost:3006/health
curl http://localhost:3006/api/smart-claude/stats

# 检查传统 Claude CLI Pool 服务 (n8n工作流需要)
curl http://localhost:3004/health

# 检查所有Docker服务状态
docker-compose ps

# 查看服务日志
docker-compose logs -f backend
```

### 🔗 n8n 工作流集成

本项目的后端服务专为 n8n 工作流设计，提供 Claude API 集成功能。

**重要**: n8n 工作流依赖 `localhost:3004` 上的 Claude CLI Pool 服务

**启动服务以支持 n8n 工作流:**
```bash
# 启动必需的服务
./start.sh
# 选择选项 1 (基础模式) 或 2 (高级模式)

# 或者手动启动
node backend/server-cli-pool.js
```

**验证工作流可以连接:**
```bash
curl -X POST http://localhost:3004/api/cli-pool/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "test", "conversationId": "test"}'
```

**工作流 URL**: http://b2127901.duckdns.org:8091/workflow/H5HvdQ0dXaA7872L

## Build

```sh
yarn build
# or
npm run build
```

## Mock server

By default we provide demo data from : `https://api-dev-minimal-[version].vercel.app`

To set up your local server:

- **Guide:** [https://docs.minimals.cc/mock-server](https://docs.minimals.cc/mock-server).

- **Resource:** [Download](https://www.dropbox.com/sh/6ojn099upi105tf/AACpmlqrNUacwbBfVdtt2t6va?dl=0).

## Full version

- Create React App ([migrate to CRA](https://docs.minimals.cc/migrate-to-cra/)).
- Next.js
- Vite.js

## Starter version

- To remove unnecessary components. This is a simplified version ([https://starter.minimals.cc/](https://starter.minimals.cc/))
- Good to start a new project. You can copy components from the full version.
- Make sure to install the dependencies exactly as compared to the full version.

---

## 🆚 Claude CLI 服务架构对比

### Smart Claude CLI Service (新架构 - 推荐)
- **端口**: 3006
- **特点**: 零预分配，完全按需创建
- **内存使用**: 低 (仅在使用时创建实例)
- **启动时间**: 快速 (无需初始化)
- **扩展性**: 优秀 (根据实际需求动态伸缩)
- **回收机制**: 智能 (5分钟无活动或50条消息后自动回收)

### Traditional Pool Service (传统架构)  
- **端口**: 3004
- **特点**: 预分配实例池
- **内存使用**: 高 (始终保持最小实例数)
- **启动时间**: 慢 (需要预初始化实例)
- **扩展性**: 良好 (池大小固定范围内)
- **回收机制**: 定时 (定期健康检查和回收)

### 🧪 API 测试示例

**测试 Smart Claude CLI 服务:**

```bash
# 1. 健康检查
curl http://localhost:3006/health

# 2. 发送单条消息
curl -X POST http://localhost:3006/api/smart-claude/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello, explain quantum computing in simple terms", "sessionId": "test-session"}'

# 3. 查看统计信息
curl http://localhost:3006/api/smart-claude/stats

# 4. 批量处理
curl -X POST http://localhost:3006/api/smart-claude/chat-batch \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"message": "What is AI?", "sessionId": "batch-1"},
      {"message": "What is ML?", "sessionId": "batch-2"},
      {"message": "What is deep learning?", "sessionId": "batch-3"}
    ]
  }'

# 5. 手动清理空闲实例
curl -X POST http://localhost:3006/api/smart-claude/cleanup
```

**对比测试传统服务:**

```bash
# 传统Pool服务测试
curl -X POST http://localhost:3004/api/cli-pool/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Hello", "conversationId": "test"}'
```

---

**NOTE:**
_When copying folders remember to also copy hidden files like .env. This is important because .env files often contain environment variables that are crucial for the application to run correctly._
