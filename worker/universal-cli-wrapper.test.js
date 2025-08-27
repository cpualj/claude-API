import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock util first to handle promisify
vi.mock('util', () => ({
  default: {},
  promisify: vi.fn((fn) => {
    // Return a mock promisified version
    return vi.fn((...args) => Promise.resolve({ stdout: '', stderr: '' }));
  }),
}));

// Mock child_process
vi.mock('child_process', () => ({
  default: {},
  spawn: vi.fn(),
  exec: vi.fn((cmd, opts, cb) => {
    // Mock exec implementation
    if (typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    if (cb) cb(null, '', '');
  }),
}));

// Mock fs/promises  
vi.mock('fs/promises', () => ({
  default: {
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
    access: vi.fn(),
  },
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  access: vi.fn(),
}));

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'test-uuid-123'),
}));

// Import mocked modules after vi.mock
const childProcess = await import('child_process');
const { spawn, exec } = childProcess;
const fs = (await import('fs/promises')).default;
const UniversalCLIWrapper = (await import('./universal-cli-wrapper.js')).default;

describe('UniversalCLIWrapper', () => {
  let wrapper;
  const mockConfigFile = '/test/config/cli-tools.json';

  beforeEach(() => {
    wrapper = new UniversalCLIWrapper({ configFile: mockConfigFile });
    vi.clearAllMocks();
  });

  describe('Configuration Management', () => {
    it('should load configurations from file', async () => {
      const mockConfigs = [
        {
          id: 'test-tool',
          name: 'Test Tool',
          command: 'test',
          enabled: true,
        },
      ];

      fs.readFile.mockResolvedValueOnce(JSON.stringify(mockConfigs));

      await wrapper.loadConfigurations();

      expect(fs.readFile).toHaveBeenCalledWith(mockConfigFile, 'utf8');
      expect(wrapper.configs.size).toBe(1);
      expect(wrapper.configs.get('test-tool')).toBeDefined();
    });

    it('should handle missing configuration file gracefully', async () => {
      fs.readFile.mockRejectedValueOnce(new Error('File not found'));
      fs.mkdir.mockResolvedValueOnce();
      fs.writeFile.mockResolvedValueOnce();

      await wrapper.loadConfigurations();

      expect(fs.writeFile).toHaveBeenCalled();
      expect(wrapper.configs.size).toBe(0);
    });

    it('should add new CLI tool configuration', () => {
      const toolConfig = {
        name: 'Claude',
        command: 'claude',
        description: 'Claude CLI',
      };

      const result = wrapper.addCLITool(toolConfig);

      expect(result.id).toBeDefined();
      expect(result.name).toBe('Claude');
      expect(result.command).toBe('claude');
      expect(result.enabled).toBe(true);
      expect(wrapper.configs.has(result.id)).toBe(true);
    });

    it('should update existing CLI tool configuration', async () => {
      const toolId = 'existing-tool';
      const existingConfig = {
        id: toolId,
        name: 'Old Name',
        command: 'old-command',
        enabled: true,
      };

      wrapper.configs.set(toolId, existingConfig);
      fs.writeFile.mockResolvedValueOnce();

      const updates = {
        name: 'New Name',
        enabled: false,
      };

      const result = await wrapper.updateCLITool(toolId, updates);

      expect(result.name).toBe('New Name');
      expect(result.command).toBe('old-command'); // Should preserve unchanged fields
      expect(result.enabled).toBe(false);
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should throw error when updating non-existent tool', async () => {
      await expect(wrapper.updateCLITool('non-existent', {}))
        .rejects.toThrow('CLI tool non-existent not found');
    });

    it('should remove CLI tool configuration', async () => {
      const toolId = 'tool-to-remove';
      wrapper.configs.set(toolId, {
        id: toolId,
        name: 'Tool to Remove',
        command: 'remove-me',
      });
      fs.writeFile.mockResolvedValueOnce();

      const result = await wrapper.removeCLITool(toolId);

      expect(result.success).toBe(true);
      expect(result.removed).toBe('Tool to Remove');
      expect(wrapper.configs.has(toolId)).toBe(false);
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });

  describe('Command Execution', () => {
    it('should execute spawn command successfully', async () => {
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
      };

      spawn.mockReturnValueOnce(mockProcess);

      const config = {
        id: 'test-spawn',
        name: 'Test Spawn',
        command: 'echo',
        enabled: true,
        execution: {
          type: 'spawn',
          timeout: 5000,
        },
        args: {
          template: ['hello'],
          userInputPosition: 'end',
        },
        io: {
          inputMethod: 'arg',
          errorHandling: 'throw',
        },
      };

      wrapper.configs.set('test-spawn', config);

      // Simulate process completion
      setTimeout(() => {
        const stdoutHandler = mockProcess.stdout.on.mock.calls[0][1];
        stdoutHandler(Buffer.from('Hello World'));
        
        const closeHandler = mockProcess.on.mock.calls.find(
          call => call[0] === 'close'
        )[1];
        closeHandler(0);
      }, 10);

      const result = await wrapper.execute('test-spawn', 'world');

      expect(spawn).toHaveBeenCalledWith(
        'echo',
        ['hello', 'world'],
        expect.any(Object)
      );
      expect(result.success).toBe(true);
      expect(result.stdout).toContain('Hello World');
      expect(result.code).toBe(0);
    });

    it('should handle spawn command failure', async () => {
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
      };

      spawn.mockReturnValueOnce(mockProcess);

      const config = {
        id: 'test-fail',
        name: 'Test Fail',
        command: 'failing-command',
        enabled: true,
        execution: { type: 'spawn', timeout: 5000 },
        io: { inputMethod: 'stdin', errorHandling: 'throw' },
      };

      wrapper.configs.set('test-fail', config);

      setTimeout(() => {
        const stderrHandler = mockProcess.stderr.on.mock.calls[0][1];
        stderrHandler(Buffer.from('Command failed'));
        
        const closeHandler = mockProcess.on.mock.calls.find(
          call => call[0] === 'close'
        )[1];
        closeHandler(1);
      }, 10);

      await expect(wrapper.execute('test-fail', 'input'))
        .rejects.toThrow('Command failed');
    });

    it('should handle command timeout', async () => {
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn(),
        kill: vi.fn(),
      };

      spawn.mockReturnValueOnce(mockProcess);

      const config = {
        id: 'test-timeout',
        name: 'Test Timeout',
        command: 'slow-command',
        enabled: true,
        execution: { type: 'spawn', timeout: 100 }, // Very short timeout
        io: { inputMethod: 'stdin', errorHandling: 'throw' },
      };

      wrapper.configs.set('test-timeout', config);

      // Don't trigger close event, let it timeout
      const promise = wrapper.execute('test-timeout', 'input');

      await expect(promise).rejects.toThrow('Command timed out after 100ms');
      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
    });

    it('should throw error for disabled tool', async () => {
      const config = {
        id: 'disabled-tool',
        name: 'Disabled Tool',
        command: 'disabled',
        enabled: false,
      };

      wrapper.configs.set('disabled-tool', config);

      await expect(wrapper.execute('disabled-tool', 'input'))
        .rejects.toThrow('CLI tool Disabled Tool is disabled');
    });

    it('should throw error for non-existent tool', async () => {
      await expect(wrapper.execute('non-existent', 'input'))
        .rejects.toThrow('CLI tool non-existent not found');
    });
  });

  describe('Authentication', () => {
    it('should check file authentication', async () => {
      const config = {
        auth: {
          type: 'file',
          authFile: '/path/to/auth.json',
        },
      };

      fs.access.mockResolvedValueOnce();
      const result = await wrapper.checkAuthentication(config);
      
      expect(result).toBe(true);
      expect(fs.access).toHaveBeenCalledWith('/path/to/auth.json');
    });

    it('should handle missing auth file', async () => {
      const config = {
        auth: {
          type: 'file',
          authFile: '/path/to/missing.json',
        },
      };

      fs.access.mockRejectedValueOnce(new Error('File not found'));
      const result = await wrapper.checkAuthentication(config);
      
      expect(result).toBe(false);
    });

    it('should check environment variable authentication', async () => {
      const config = {
        auth: {
          type: 'env',
          envVars: ['API_KEY', 'API_SECRET'],
        },
      };

      process.env.API_KEY = 'test-key';
      process.env.API_SECRET = 'test-secret';

      const result = await wrapper.checkAuthentication(config);
      expect(result).toBe(true);

      delete process.env.API_KEY;
      delete process.env.API_SECRET;
    });

    it('should handle missing environment variables', async () => {
      const config = {
        auth: {
          type: 'env',
          envVars: ['MISSING_VAR'],
        },
      };

      const result = await wrapper.checkAuthentication(config);
      expect(result).toBe(false);
    });

    it('should check OAuth authentication with command', async () => {
      const config = {
        auth: {
          type: 'oauth',
          checkCommand: 'auth status',
        },
      };

      exec.mockImplementation((cmd, callback) => {
        callback(null, { stdout: 'Authenticated' });
      });

      const result = await wrapper.checkAuthentication(config);
      expect(result).toBe(true);
    });
  });

  describe('Session Management', () => {
    it('should create a new session', async () => {
      const config = {
        id: 'session-tool',
        name: 'Session Tool',
        command: 'session-cmd',
        session: {
          supported: true,
          persistProcess: false,
        },
      };

      wrapper.configs.set('session-tool', config);

      const session = await wrapper.createSession('session-tool');

      expect(session.id).toBeDefined();
      expect(session.toolId).toBe('session-tool');
      expect(session.context).toEqual([]);
      expect(wrapper.sessions.has(session.id)).toBe(true);
    });

    it('should create session with persistent process', async () => {
      const mockProcess = {
        stdout: { on: vi.fn() },
        stderr: { on: vi.fn() },
        stdin: { write: vi.fn(), end: vi.fn() },
        on: vi.fn(),
        connected: true,
      };

      spawn.mockReturnValueOnce(mockProcess);

      const config = {
        id: 'persist-tool',
        name: 'Persist Tool',
        command: 'persist-cmd',
        session: {
          supported: true,
          persistProcess: true,
        },
        execution: {
          cwd: '/app',
          env: { TEST: 'value' },
        },
      };

      wrapper.configs.set('persist-tool', config);

      const session = await wrapper.createSession('persist-tool');

      expect(spawn).toHaveBeenCalledWith(
        'persist-cmd',
        [],
        expect.objectContaining({
          cwd: '/app',
        })
      );
      expect(session.process).toBe(mockProcess);
      expect(wrapper.processes.has(session.id)).toBe(true);
    });

    it('should throw error for unsupported session', async () => {
      const config = {
        id: 'no-session',
        name: 'No Session',
        command: 'no-session',
        session: {
          supported: false,
        },
      };

      wrapper.configs.set('no-session', config);

      await expect(wrapper.createSession('no-session'))
        .rejects.toThrow('CLI tool No Session does not support sessions');
    });

    it('should end session and cleanup process', async () => {
      const mockProcess = {
        kill: vi.fn(),
      };

      const sessionId = 'session-to-end';
      wrapper.sessions.set(sessionId, {
        id: sessionId,
        toolId: 'test-tool',
        process: mockProcess,
      });
      wrapper.processes.set(sessionId, mockProcess);

      await wrapper.endSession(sessionId);

      expect(mockProcess.kill).toHaveBeenCalled();
      expect(wrapper.sessions.has(sessionId)).toBe(false);
      expect(wrapper.processes.has(sessionId)).toBe(false);
    });
  });

  describe('Argument Building', () => {
    it('should build args with user input at end', () => {
      const config = {
        args: {
          template: ['--model', 'gpt-4'],
          userInputPosition: 'end',
          streaming: false,
        },
        io: {
          inputMethod: 'arg',
        },
      };

      const args = wrapper.buildArgs(config, 'Hello world', {});

      expect(args).toEqual(['--model', 'gpt-4', 'Hello world']);
    });

    it('should build args with user input at start', () => {
      const config = {
        args: {
          template: ['--format', 'json'],
          userInputPosition: 'start',
        },
        io: {
          inputMethod: 'arg',
        },
      };

      const args = wrapper.buildArgs(config, 'input.txt', {});

      expect(args).toEqual(['input.txt', '--format', 'json']);
    });

    it('should replace placeholder with user input', () => {
      const config = {
        args: {
          template: ['process', '{{input}}', '--output', '{{input}}.out'],
          userInputPosition: 'replace',
        },
        io: {
          inputMethod: 'arg',
        },
      };

      const args = wrapper.buildArgs(config, 'data.csv', {});

      expect(args).toEqual(['process', 'data.csv', '--output', 'data.csv.out']);
    });

    it('should add streaming flag when enabled', () => {
      const config = {
        args: {
          template: ['chat'],
          streaming: true,
          streamFlag: '--stream',
        },
      };

      const args = wrapper.buildArgs(config, '', { stream: true });

      expect(args).toContain('--stream');
    });

    it('should add extra args from options', () => {
      const config = {
        args: {
          template: ['run'],
        },
      };

      const args = wrapper.buildArgs(config, '', {
        extraArgs: ['--verbose', '--debug'],
      });

      expect(args).toEqual(['run', '--verbose', '--debug']);
    });
  });

  describe('Tool Listing', () => {
    it('should get all configured tools', () => {
      wrapper.configs.set('tool1', {
        id: 'tool1',
        name: 'Tool 1',
        command: 'cmd1',
        description: 'Description 1',
        enabled: true,
        auth: { required: true },
        session: { supported: true },
      });

      wrapper.configs.set('tool2', {
        id: 'tool2',
        name: 'Tool 2',
        command: 'cmd2',
        enabled: false,
        auth: { required: false },
        session: { supported: false },
      });

      const tools = wrapper.getTools();

      expect(tools).toHaveLength(2);
      expect(tools[0]).toMatchObject({
        id: 'tool1',
        name: 'Tool 1',
        enabled: true,
        authRequired: true,
        sessionSupported: true,
      });
      expect(tools[1]).toMatchObject({
        id: 'tool2',
        name: 'Tool 2',
        enabled: false,
        authRequired: false,
        sessionSupported: false,
      });
    });
  });
});