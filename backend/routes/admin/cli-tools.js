import express from 'express';
import { authMiddleware, adminMiddleware } from '../../middleware/auth.js';
import UniversalCLIWrapper from '../../../worker/universal-cli-wrapper.js';

const router = express.Router();

// 初始化 CLI Wrapper
const cliWrapper = new UniversalCLIWrapper({
  configFile: '/app/config/cli-tools.json'
});

/**
 * GET /api/admin/cli-tools
 * 获取所有 CLI 工具配置
 */
router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const tools = cliWrapper.getTools();
    
    // 添加状态信息
    const toolsWithStatus = await Promise.all(tools.map(async (tool) => {
      // 检查认证状态
      let authStatus = 'unknown';
      if (tool.authRequired) {
        const config = cliWrapper.configs.get(tool.id);
        authStatus = await cliWrapper.checkAuthentication(config) ? 'valid' : 'invalid';
      } else {
        authStatus = 'not_required';
      }
      
      return {
        ...tool,
        authStatus,
        activeSessions: Array.from(cliWrapper.sessions.values())
          .filter(s => s.toolId === tool.id).length
      };
    }));
    
    res.json({
      success: true,
      tools: toolsWithStatus
    });
  } catch (error) {
    console.error('Error fetching CLI tools:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/admin/cli-tools/:id
 * 获取单个 CLI 工具配置
 */
router.get('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const config = cliWrapper.configs.get(req.params.id);
    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'CLI tool not found'
      });
    }
    
    res.json({
      success: true,
      tool: config
    });
  } catch (error) {
    console.error('Error fetching CLI tool:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/admin/cli-tools
 * 添加新的 CLI 工具
 */
router.post('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const config = cliWrapper.addCLITool(req.body);
    await cliWrapper.saveConfigurations();
    
    res.json({
      success: true,
      tool: config,
      message: `CLI tool ${config.name} added successfully`
    });
  } catch (error) {
    console.error('Error adding CLI tool:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PUT /api/admin/cli-tools/:id
 * 更新 CLI 工具配置
 */
router.put('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const config = await cliWrapper.updateCLITool(req.params.id, req.body);
    
    res.json({
      success: true,
      tool: config,
      message: `CLI tool ${config.name} updated successfully`
    });
  } catch (error) {
    console.error('Error updating CLI tool:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PATCH /api/admin/cli-tools/:id
 * 部分更新 CLI 工具配置（如启用/禁用）
 */
router.patch('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const config = await cliWrapper.updateCLITool(req.params.id, req.body);
    
    res.json({
      success: true,
      tool: config,
      message: 'CLI tool updated successfully'
    });
  } catch (error) {
    console.error('Error updating CLI tool:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/admin/cli-tools/:id
 * 删除 CLI 工具
 */
router.delete('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await cliWrapper.removeCLITool(req.params.id);
    
    res.json({
      success: true,
      message: `CLI tool ${result.removed} deleted successfully`
    });
  } catch (error) {
    console.error('Error deleting CLI tool:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/admin/cli-tools/:id/test
 * 测试 CLI 工具
 */
router.post('/:id/test', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { input, options = {} } = req.body;
    
    // 执行测试
    const result = await cliWrapper.execute(req.params.id, input, {
      ...options,
      timeout: 10000 // 测试时使用较短的超时时间
    });
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Error testing CLI tool:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/admin/cli-tools/:id/check-auth
 * 检查 CLI 工具认证状态
 */
router.post('/:id/check-auth', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const config = cliWrapper.configs.get(req.params.id);
    if (!config) {
      return res.status(404).json({
        success: false,
        error: 'CLI tool not found'
      });
    }
    
    const authValid = await cliWrapper.checkAuthentication(config);
    
    res.json({
      success: true,
      authenticated: authValid,
      authType: config.auth.type,
      message: authValid 
        ? 'Authentication is valid' 
        : 'Authentication is invalid or not configured'
    });
  } catch (error) {
    console.error('Error checking authentication:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/admin/cli-tools/:id/sessions
 * 获取 CLI 工具的活动会话
 */
router.get('/:id/sessions', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const sessions = Array.from(cliWrapper.sessions.values())
      .filter(s => s.toolId === req.params.id)
      .map(s => ({
        id: s.id,
        createdAt: s.createdAt,
        lastActivity: s.lastActivity,
        contextLength: s.context.length
      }));
    
    res.json({
      success: true,
      sessions
    });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/admin/cli-tools/:id/sessions/:sessionId
 * 结束特定会话
 */
router.delete('/:id/sessions/:sessionId', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await cliWrapper.endSession(req.params.sessionId);
    
    res.json({
      success: true,
      message: 'Session ended successfully'
    });
  } catch (error) {
    console.error('Error ending session:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/admin/cli-tools/import
 * 导入 CLI 工具配置
 */
router.post('/import', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { tools } = req.body;
    
    if (!Array.isArray(tools)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid import data: expected an array of tools'
      });
    }
    
    const imported = [];
    const failed = [];
    
    for (const tool of tools) {
      try {
        const config = cliWrapper.addCLITool(tool);
        imported.push(config.name);
      } catch (error) {
        failed.push({ name: tool.name || 'unknown', error: error.message });
      }
    }
    
    await cliWrapper.saveConfigurations();
    
    res.json({
      success: true,
      imported,
      failed,
      message: `Imported ${imported.length} tools, ${failed.length} failed`
    });
  } catch (error) {
    console.error('Error importing CLI tools:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/admin/cli-tools/export
 * 导出所有 CLI 工具配置
 */
router.get('/export', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const tools = Array.from(cliWrapper.configs.values());
    
    res.json({
      success: true,
      tools,
      exportDate: new Date().toISOString(),
      version: '1.0.0'
    });
  } catch (error) {
    console.error('Error exporting CLI tools:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;