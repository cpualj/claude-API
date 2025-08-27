/**
 * Universal CLI Wrapper
 * 支持配置和执行任意 CLI 工具
 */

import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const execAsync = promisify(exec);

class UniversalCLIWrapper {
  constructor(config = {}) {
    this.configs = new Map();
    this.sessions = new Map();
    this.processes = new Map();
    this.configFile = config.configFile || '/app/config/cli-tools.json';
    
    this.loadConfigurations();
  }

  /**
   * 加载 CLI 工具配置
   */
  async loadConfigurations() {
    try {
      const configData = await fs.readFile(this.configFile, 'utf8');
      const configs = JSON.parse(configData);
      
      for (const config of configs) {
        this.addCLITool(config);
      }
      
      console.log(`✅ Loaded ${this.configs.size} CLI tool configurations`);
    } catch (error) {
      console.log('📝 No existing configurations found, starting fresh');
      await this.saveConfigurations();
    }
  }

  /**
   * 保存配置到文件
   */
  async saveConfigurations() {
    const configs = Array.from(this.configs.values());
    await fs.mkdir(path.dirname(this.configFile), { recursive: true });
    await fs.writeFile(this.configFile, JSON.stringify(configs, null, 2));
  }

  /**
   * 添加新的 CLI 工具配置
   */
  addCLITool(config) {
    const toolConfig = {
      id: config.id || uuidv4(),
      name: config.name,
      command: config.command,
      description: config.description || '',
      enabled: config.enabled !== false,
      
      // 执行配置
      execution: {
        type: config.execution?.type || 'spawn', // spawn, exec, shell
        shell: config.execution?.shell || false,
        cwd: config.execution?.cwd || process.cwd(),
        env: config.execution?.env || {},
        timeout: config.execution?.timeout || 60000,
        encoding: config.execution?.encoding || 'utf8'
      },
      
      // 参数配置
      args: {
        template: config.args?.template || [], // 默认参数模板
        userInputPosition: config.args?.userInputPosition || 'end', // start, end, replace
        streaming: config.args?.streaming || false,
        streamFlag: config.args?.streamFlag || '--stream'
      },
      
      // 输入输出配置
      io: {
        inputMethod: config.io?.inputMethod || 'stdin', // stdin, arg, file
        outputParser: config.io?.outputParser || 'raw', // raw, json, line-by-line
        errorHandling: config.io?.errorHandling || 'throw', // throw, ignore, retry
        successPattern: config.io?.successPattern || null, // 正则表达式
        errorPattern: config.io?.errorPattern || null
      },
      
      // 会话管理
      session: {
        supported: config.session?.supported || false,
        persistProcess: config.session?.persistProcess || false,
        contextFile: config.session?.contextFile || null,
        maxSessions: config.session?.maxSessions || 10
      },
      
      // 认证配置
      auth: {
        required: config.auth?.required || false,
        type: config.auth?.type || 'none', // none, file, env, oauth
        authFile: config.auth?.authFile || null,
        envVars: config.auth?.envVars || [],
        checkCommand: config.auth?.checkCommand || null
      },
      
      // 限制和配额
      limits: {
        maxConcurrent: config.limits?.maxConcurrent || 5,
        requestsPerMinute: config.limits?.requestsPerMinute || 60,
        cooldownPeriod: config.limits?.cooldownPeriod || 0
      },
      
      // 自定义脚本钩子
      hooks: {
        beforeExecute: config.hooks?.beforeExecute || null,
        afterExecute: config.hooks?.afterExecute || null,
        onError: config.hooks?.onError || null,
        responseTransform: config.hooks?.responseTransform || null
      }
    };

    this.configs.set(toolConfig.id, toolConfig);
    console.log(`✅ Added CLI tool: ${toolConfig.name} (${toolConfig.command})`);
    
    return toolConfig;
  }

  /**
   * 更新 CLI 工具配置
   */
  async updateCLITool(id, updates) {
    const config = this.configs.get(id);
    if (!config) {
      throw new Error(`CLI tool ${id} not found`);
    }

    // 深度合并配置
    const updatedConfig = this.deepMerge(config, updates);
    this.configs.set(id, updatedConfig);
    
    await this.saveConfigurations();
    return updatedConfig;
  }

  /**
   * 删除 CLI 工具配置
   */
  async removeCLITool(id) {
    const config = this.configs.get(id);
    if (!config) {
      throw new Error(`CLI tool ${id} not found`);
    }

    // 清理相关进程
    for (const [sessionId, session] of this.sessions) {
      if (session.toolId === id) {
        await this.endSession(sessionId);
      }
    }

    this.configs.delete(id);
    await this.saveConfigurations();
    
    return { success: true, removed: config.name };
  }

  /**
   * 执行 CLI 命令
   */
  async execute(toolId, input, options = {}) {
    const config = this.configs.get(toolId);
    if (!config) {
      throw new Error(`CLI tool ${toolId} not found`);
    }

    if (!config.enabled) {
      throw new Error(`CLI tool ${config.name} is disabled`);
    }

    // 检查认证
    if (config.auth.required) {
      const authValid = await this.checkAuthentication(config);
      if (!authValid) {
        throw new Error(`Authentication required for ${config.name}`);
      }
    }

    // 执行前置钩子
    if (config.hooks.beforeExecute) {
      await this.executeHook(config.hooks.beforeExecute, { input, config });
    }

    let result;
    
    switch (config.execution.type) {
      case 'spawn':
        result = await this.executeSpawn(config, input, options);
        break;
      case 'exec':
        result = await this.executeExec(config, input, options);
        break;
      case 'shell':
        result = await this.executeShell(config, input, options);
        break;
      default:
        throw new Error(`Unknown execution type: ${config.execution.type}`);
    }

    // 执行后置钩子
    if (config.hooks.afterExecute) {
      result = await this.executeHook(config.hooks.afterExecute, { result, config });
    }

    // 转换响应
    if (config.hooks.responseTransform) {
      result = await this.executeHook(config.hooks.responseTransform, { result, config });
    }

    return result;
  }

  /**
   * 使用 spawn 执行命令
   */
  async executeSpawn(config, input, options) {
    return new Promise((resolve, reject) => {
      // 构建参数
      const args = this.buildArgs(config, input, options);
      
      // 构建环境变量
      const env = {
        ...process.env,
        ...config.execution.env,
        ...options.env
      };

      const spawnOptions = {
        cwd: config.execution.cwd,
        env,
        encoding: config.execution.encoding,
        shell: config.execution.shell
      };

      const child = spawn(config.command, args, spawnOptions);
      
      let stdout = '';
      let stderr = '';
      
      // 处理标准输出
      child.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        
        if (options.stream && options.onData) {
          options.onData(chunk);
        }
      });

      // 处理错误输出
      child.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        
        if (options.stream && options.onError) {
          options.onError(chunk);
        }
      });

      // 发送输入
      if (config.io.inputMethod === 'stdin' && input) {
        child.stdin.write(input + '\n');
        child.stdin.end();
      }

      // 设置超时
      const timeout = setTimeout(() => {
        child.kill('SIGTERM');
        reject(new Error(`Command timed out after ${config.execution.timeout}ms`));
      }, config.execution.timeout);

      // 处理进程结束
      child.on('close', (code) => {
        clearTimeout(timeout);
        
        const result = {
          success: code === 0,
          code,
          stdout,
          stderr,
          command: config.command,
          args
        };

        // 检查成功/错误模式
        if (config.io.successPattern) {
          const regex = new RegExp(config.io.successPattern);
          result.success = regex.test(stdout);
        }

        if (config.io.errorPattern) {
          const regex = new RegExp(config.io.errorPattern);
          if (regex.test(stdout) || regex.test(stderr)) {
            result.success = false;
          }
        }

        if (result.success || config.io.errorHandling === 'ignore') {
          resolve(result);
        } else {
          reject(new Error(stderr || `Command failed with code ${code}`));
        }
      });

      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * 使用 exec 执行命令
   */
  async executeExec(config, input, options) {
    const args = this.buildArgs(config, input, options);
    const command = `${config.command} ${args.join(' ')}`;
    
    const execOptions = {
      cwd: config.execution.cwd,
      encoding: config.execution.encoding,
      timeout: config.execution.timeout,
      env: {
        ...process.env,
        ...config.execution.env,
        ...options.env
      }
    };

    try {
      const { stdout, stderr } = await execAsync(command, execOptions);
      
      return {
        success: true,
        stdout,
        stderr,
        command
      };
    } catch (error) {
      if (config.io.errorHandling === 'retry' && options.retries > 0) {
        console.log(`Retrying command, ${options.retries} attempts remaining`);
        return this.executeExec(config, input, { 
          ...options, 
          retries: options.retries - 1 
        });
      }
      
      throw error;
    }
  }

  /**
   * 构建命令参数
   */
  buildArgs(config, input, options) {
    let args = [...config.args.template];
    
    // 处理流式参数
    if (options.stream && config.args.streaming) {
      args.push(config.args.streamFlag);
    }

    // 处理用户输入
    if (input && config.io.inputMethod === 'arg') {
      switch (config.args.userInputPosition) {
        case 'start':
          args.unshift(input);
          break;
        case 'end':
          args.push(input);
          break;
        case 'replace':
          args = args.map(arg => arg.replace('{{input}}', input));
          break;
      }
    }

    // 处理额外参数
    if (options.extraArgs) {
      args.push(...options.extraArgs);
    }

    return args;
  }

  /**
   * 检查认证状态
   */
  async checkAuthentication(config) {
    switch (config.auth.type) {
      case 'none':
        return true;
        
      case 'file':
        try {
          await fs.access(config.auth.authFile);
          return true;
        } catch {
          return false;
        }
        
      case 'env':
        return config.auth.envVars.every(varName => process.env[varName]);
        
      case 'oauth':
        if (config.auth.checkCommand) {
          try {
            await execAsync(config.auth.checkCommand);
            return true;
          } catch {
            return false;
          }
        }
        return false;
        
      default:
        return false;
    }
  }

  /**
   * 会话管理
   */
  async createSession(toolId, sessionId = null) {
    const config = this.configs.get(toolId);
    if (!config) {
      throw new Error(`CLI tool ${toolId} not found`);
    }

    if (!config.session.supported) {
      throw new Error(`CLI tool ${config.name} does not support sessions`);
    }

    const id = sessionId || uuidv4();
    
    const session = {
      id,
      toolId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      context: [],
      process: null
    };

    if (config.session.persistProcess) {
      // 创建持久进程
      session.process = spawn(config.command, [], {
        cwd: config.execution.cwd,
        env: { ...process.env, ...config.execution.env }
      });
      
      this.processes.set(id, session.process);
    }

    this.sessions.set(id, session);
    return session;
  }

  /**
   * 在会话中执行命令
   */
  async executeInSession(sessionId, input, options = {}) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const config = this.configs.get(session.toolId);
    
    session.lastActivity = Date.now();
    session.context.push({ input, timestamp: Date.now() });

    if (session.process && session.process.connected) {
      // 使用持久进程
      return this.executeWithProcess(session.process, input, config, options);
    } else {
      // 使用上下文执行
      return this.execute(session.toolId, input, {
        ...options,
        context: session.context
      });
    }
  }

  /**
   * 结束会话
   */
  async endSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    if (session.process) {
      session.process.kill();
      this.processes.delete(sessionId);
    }

    this.sessions.delete(sessionId);
  }

  /**
   * 获取所有配置的工具
   */
  getTools() {
    return Array.from(this.configs.values()).map(config => ({
      id: config.id,
      name: config.name,
      command: config.command,
      description: config.description,
      enabled: config.enabled,
      authRequired: config.auth.required,
      sessionSupported: config.session.supported
    }));
  }

  /**
   * 深度合并对象
   */
  deepMerge(target, source) {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }

  /**
   * 执行钩子函数
   */
  async executeHook(hook, context) {
    if (typeof hook === 'string') {
      // 执行外部脚本
      const { stdout } = await execAsync(hook, {
        env: {
          ...process.env,
          HOOK_CONTEXT: JSON.stringify(context)
        }
      });
      return JSON.parse(stdout);
    } else if (typeof hook === 'function') {
      return await hook(context);
    }
    return context.result || context;
  }
}

export default UniversalCLIWrapper;