# Claude API 自动启动配置

## 文件说明

- `ClaudeAPI.vbs` - 静默启动脚本（用于开机自启）
- `start-services.bat` - 启动前端和后端服务
- `stop-services.bat` - 停止所有服务
- `setup-startup.bat` - 配置开机自启动

## 使用方法

### 设置开机自启动
1. 右键点击 `setup-startup.bat`
2. 选择"以管理员身份运行"
3. 等待配置完成

### 手动启动服务
- 双击 `ClaudeAPI.vbs` （静默启动）
- 或双击 `start-services.bat` （显示窗口）

### 停止服务
- 双击 `stop-services.bat`

## 服务端口
- 前端: http://localhost:3030
- 后端: http://localhost:3006

## 注意事项
- 需要安装Node.js和Yarn
- Claude CLI需要已配置认证
- 防火墙可能需要允许端口访问