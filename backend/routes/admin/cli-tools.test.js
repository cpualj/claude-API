import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import router from './cli-tools.js';
import CLIToolService from '../../services/cli-tool-service.js';
import { authenticateToken } from '../../middleware/auth.js';

// Mock dependencies
vi.mock('../../services/cli-tool-service');
vi.mock('../../middleware/auth');

describe('CLI Tools Admin Routes', () => {
  let app;
  let mockService;

  beforeEach(() => {
    // Setup Express app
    app = express();
    app.use(express.json());
    
    // Mock authentication middleware to always pass
    authenticateToken.mockImplementation((req, res, next) => {
      req.user = { id: 'test-user', role: 'admin' };
      next();
    });

    // Setup router
    app.use('/api/admin/cli-tools', router);

    // Setup mock service
    mockService = {
      getAllTools: vi.fn(),
      getToolById: vi.fn(),
      createTool: vi.fn(),
      updateTool: vi.fn(),
      deleteTool: vi.fn(),
      validateTool: vi.fn(),
    };
    CLIToolService.mockImplementation(() => mockService);

    vi.clearAllMocks();
  });

  describe('GET /api/admin/cli-tools', () => {
    it('should return all CLI tools', async () => {
      const mockTools = [
        {
          id: 'claude',
          name: 'Claude Code',
          command: 'claude',
          enabled: true,
        },
        {
          id: 'openai',
          name: 'OpenAI CLI',
          command: 'openai',
          enabled: false,
        },
      ];

      mockService.getAllTools.mockResolvedValueOnce(mockTools);

      const response = await request(app)
        .get('/api/admin/cli-tools')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        tools: mockTools,
      });
      expect(mockService.getAllTools).toHaveBeenCalled();
    });

    it('should handle service errors', async () => {
      mockService.getAllTools.mockRejectedValueOnce(
        new Error('Database error')
      );

      const response = await request(app)
        .get('/api/admin/cli-tools')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to fetch CLI tools',
      });
    });

    it('should require authentication', async () => {
      authenticateToken.mockImplementationOnce((req, res, next) => {
        res.status(401).json({ error: 'Unauthorized' });
      });

      await request(app)
        .get('/api/admin/cli-tools')
        .expect(401);
    });
  });

  describe('GET /api/admin/cli-tools/:id', () => {
    it('should return a specific CLI tool', async () => {
      const mockTool = {
        id: 'claude',
        name: 'Claude Code',
        command: 'claude',
        description: 'Claude AI CLI',
        enabled: true,
        auth: {
          type: 'file',
          authFile: '~/.claude/auth.json',
        },
      };

      mockService.getToolById.mockResolvedValueOnce(mockTool);

      const response = await request(app)
        .get('/api/admin/cli-tools/claude')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        tool: mockTool,
      });
      expect(mockService.getToolById).toHaveBeenCalledWith('claude');
    });

    it('should handle not found', async () => {
      mockService.getToolById.mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/api/admin/cli-tools/non-existent')
        .expect(404);

      expect(response.body).toEqual({
        success: false,
        error: 'CLI tool not found',
      });
    });
  });

  describe('POST /api/admin/cli-tools', () => {
    it('should create a new CLI tool', async () => {
      const newTool = {
        name: 'New Tool',
        command: 'newtool',
        description: 'A new CLI tool',
        enabled: true,
      };

      const createdTool = {
        id: 'new-tool',
        ...newTool,
      };

      mockService.createTool.mockResolvedValueOnce(createdTool);

      const response = await request(app)
        .post('/api/admin/cli-tools')
        .send(newTool)
        .expect(201);

      expect(response.body).toEqual({
        success: true,
        tool: createdTool,
      });
      expect(mockService.createTool).toHaveBeenCalledWith(newTool);
    });

    it('should validate required fields', async () => {
      const invalidTool = {
        description: 'Missing required fields',
      };

      const response = await request(app)
        .post('/api/admin/cli-tools')
        .send(invalidTool)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('required'),
      });
    });

    it('should handle creation errors', async () => {
      const newTool = {
        name: 'Tool',
        command: 'tool',
      };

      mockService.createTool.mockRejectedValueOnce(
        new Error('Database constraint violation')
      );

      const response = await request(app)
        .post('/api/admin/cli-tools')
        .send(newTool)
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to create CLI tool',
      });
    });
  });

  describe('PUT /api/admin/cli-tools/:id', () => {
    it('should update an existing CLI tool', async () => {
      const updates = {
        name: 'Updated Name',
        enabled: false,
      };

      const updatedTool = {
        id: 'claude',
        name: 'Updated Name',
        command: 'claude',
        enabled: false,
      };

      mockService.updateTool.mockResolvedValueOnce(updatedTool);

      const response = await request(app)
        .put('/api/admin/cli-tools/claude')
        .send(updates)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        tool: updatedTool,
      });
      expect(mockService.updateTool).toHaveBeenCalledWith('claude', updates);
    });

    it('should handle update errors', async () => {
      mockService.updateTool.mockRejectedValueOnce(
        new Error('Tool not found')
      );

      const response = await request(app)
        .put('/api/admin/cli-tools/non-existent')
        .send({ name: 'New Name' })
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to update CLI tool',
      });
    });

    it('should prevent updating protected fields', async () => {
      const updates = {
        id: 'new-id', // Should not be allowed
        name: 'Updated Name',
      };

      const response = await request(app)
        .put('/api/admin/cli-tools/claude')
        .send(updates)
        .expect(400);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Cannot update'),
      });
    });
  });

  describe('DELETE /api/admin/cli-tools/:id', () => {
    it('should delete a CLI tool', async () => {
      mockService.deleteTool.mockResolvedValueOnce({
        success: true,
        removed: 'Test Tool',
      });

      const response = await request(app)
        .delete('/api/admin/cli-tools/test-tool')
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        message: 'CLI tool deleted successfully',
      });
      expect(mockService.deleteTool).toHaveBeenCalledWith('test-tool');
    });

    it('should handle deletion errors', async () => {
      mockService.deleteTool.mockRejectedValueOnce(
        new Error('Cannot delete active tool')
      );

      const response = await request(app)
        .delete('/api/admin/cli-tools/active-tool')
        .expect(500);

      expect(response.body).toEqual({
        success: false,
        error: 'Failed to delete CLI tool',
      });
    });
  });

  describe('POST /api/admin/cli-tools/validate', () => {
    it('should validate a CLI tool configuration', async () => {
      const toolConfig = {
        name: 'Test Tool',
        command: 'test',
        auth: {
          type: 'env',
          envVars: ['API_KEY'],
        },
      };

      mockService.validateTool.mockResolvedValueOnce({
        valid: true,
        authStatus: 'authenticated',
        commandAvailable: true,
      });

      const response = await request(app)
        .post('/api/admin/cli-tools/validate')
        .send(toolConfig)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        validation: {
          valid: true,
          authStatus: 'authenticated',
          commandAvailable: true,
        },
      });
      expect(mockService.validateTool).toHaveBeenCalledWith(toolConfig);
    });

    it('should return validation errors', async () => {
      const invalidConfig = {
        name: 'Invalid Tool',
        command: 'missing-command',
      };

      mockService.validateTool.mockResolvedValueOnce({
        valid: false,
        authStatus: 'not_required',
        commandAvailable: false,
        errors: ['Command not found in PATH'],
      });

      const response = await request(app)
        .post('/api/admin/cli-tools/validate')
        .send(invalidConfig)
        .expect(200);

      expect(response.body).toEqual({
        success: true,
        validation: {
          valid: false,
          authStatus: 'not_required',
          commandAvailable: false,
          errors: ['Command not found in PATH'],
        },
      });
    });
  });

  describe('Middleware', () => {
    it('should require admin role', async () => {
      authenticateToken.mockImplementationOnce((req, res, next) => {
        req.user = { id: 'test-user', role: 'user' }; // Not admin
        next();
      });

      const response = await request(app)
        .get('/api/admin/cli-tools')
        .expect(403);

      expect(response.body).toMatchObject({
        error: expect.stringContaining('admin'),
      });
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/admin/cli-tools')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }')
        .expect(400);

      expect(response.body).toMatchObject({
        error: expect.stringContaining('JSON'),
      });
    });
  });
});