# Claude API Wrapper Backend

A production-ready backend service that wraps Claude CLI tools as HTTP APIs with authentication, rate limiting, session management, and real-time capabilities.

## Features

- **API Authentication**: JWT-based authentication with API key management
- **Session Management**: Persistent conversation contexts with Redis caching
- **Worker Management**: Load-balanced Claude CLI process handling
- **Rate Limiting**: Configurable per-user and per-API-key rate limits
- **Real-time Updates**: WebSocket support for live status updates
- **Health Monitoring**: Comprehensive health checks and Prometheus metrics
- **Admin Dashboard**: Complete user and API key management interface

## Quick Start

### Prerequisites

- Node.js >= 18
- PostgreSQL
- Redis
- Claude CLI installed and configured

### Installation

1. Clone and setup:
```bash
cd backend
npm install
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your configurations
```

3. Initialize database:
```bash
npm run migrate
```

4. Start the server:
```bash
npm run dev    # Development mode
npm start      # Production mode
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/profile` - Get user profile
- `PUT /api/auth/profile` - Update user profile

### Chat API
- `POST /api/chat` - Send chat message (supports streaming)
- `GET /api/tools` - Get available tools
- `GET /api/usage` - Get usage statistics
- `GET /api/quota` - Check rate limit quota

### Session Management
- `POST /api/sessions` - Create new session
- `GET /api/sessions` - List user sessions
- `GET /api/sessions/:id` - Get session details
- `PUT /api/sessions/:id` - Update session
- `DELETE /api/sessions/:id` - Delete session

### Admin Interface
- `GET /api/admin/users` - List users
- `POST /api/admin/users/:id/api-keys` - Create API key
- `GET /api/admin/users/:id/api-keys` - List user API keys
- `DELETE /api/admin/api-keys/:id` - Delete API key
- `GET /api/admin/stats` - Get system statistics

### Health Monitoring
- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed system status
- `GET /health/ready` - Readiness probe
- `GET /health/alive` - Liveness probe
- `GET /health/metrics` - Prometheus metrics

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:password@localhost:5432/claude_api` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `PORT` | Server port | `3001` |
| `JWT_SECRET` | JWT signing secret | Required |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:3030` |
| `MAX_WORKERS` | Maximum Claude workers | `5` |
| `DEFAULT_RATE_LIMIT_PER_HOUR` | Default API rate limit | `1000` |

### Database Schema

The system uses PostgreSQL with the following main tables:
- `users` - User accounts and profiles
- `api_keys` - API authentication keys
- `sessions` - Conversation sessions
- `usage_logs` - API usage tracking
- `workers` - Claude worker processes
- `cli_tools` - Available Claude tools

### Redis Usage

Redis is used for:
- Session caching and management
- Worker status tracking
- Request queue management
- Rate limiting counters
- Real-time pub/sub messaging

## Architecture

### Service Layer
- **WorkerManager**: Manages Claude CLI processes and load balancing
- **ApiKeyManager**: Handles authentication and usage tracking
- **SessionManager**: Manages conversation contexts
- **Redis Services**: Caching, queuing, and real-time features

### Security Features
- JWT authentication with refresh tokens
- API key-based authentication for external clients
- Rate limiting with Redis-backed counters
- Input validation with Zod schemas
- Helmet.js security headers
- CORS configuration

### Error Handling
- Comprehensive error catching and logging
- Graceful degradation for service failures
- Structured error responses
- Health check integration

## Development

### Scripts
- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm run migrate` - Run database migrations

### Testing Health
```bash
# Basic health check
curl http://localhost:3001/health

# Detailed system status
curl http://localhost:3001/health/detailed

# Check if services are ready
curl http://localhost:3001/health/ready
```

### Creating Admin User
```bash
# Register first admin user through API or set ADMIN_EMAIL/ADMIN_PASSWORD in .env
curl -X POST http://localhost:3001/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"yourpassword","role":"admin"}'
```

## Deployment

### Production Checklist
- [ ] Set strong JWT_SECRET
- [ ] Configure production database
- [ ] Set up Redis cluster/persistence
- [ ] Configure reverse proxy (nginx)
- [ ] Set up SSL certificates
- [ ] Configure monitoring and logging
- [ ] Set appropriate rate limits
- [ ] Review CORS settings

### Docker Support
The service is designed to be containerizable. Ensure Claude CLI is available in the container environment.

## Monitoring

The service provides comprehensive monitoring through:
- Health check endpoints
- Prometheus metrics
- Winston logging
- Real-time status via WebSocket
- Admin dashboard statistics

## Troubleshooting

### Common Issues
1. **Database connection failed**: Check DATABASE_URL and PostgreSQL service
2. **Redis connection failed**: Verify Redis server and REDIS_URL
3. **Claude CLI not found**: Ensure Claude CLI is installed and in PATH
4. **Worker timeout**: Adjust WORKER_TIMEOUT for slow responses
5. **Rate limit errors**: Check and adjust rate limit settings

### Logs
Check server logs for detailed error information. Set LOG_LEVEL=debug for verbose logging.