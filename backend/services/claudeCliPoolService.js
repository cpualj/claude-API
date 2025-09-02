import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import EventEmitter from 'events';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const execAsync = promisify(exec);

/**
 * Claude CLI Instance Manager
 * Manages individual Claude CLI instances using --print mode for non-interactive communication
 */
class ClaudeCliInstance extends EventEmitter {
  constructor(id) {
    super();
    this.id = id;
    this.busy = false;
    this.ready = true; // Always ready in --print mode
    this.messageCount = 0;
    this.conversationHistory = [];
    this.lastUsed = Date.now();
    this.createdAt = Date.now();
    this.terminating = false;
  }

  async initialize() {
    // No initialization needed for --print mode
    this.ready = true;
    console.log(`Claude CLI instance ${this.id} ready for --print mode`);
  }

  async sendMessage(message) {
    if (this.busy) {
      throw new Error('Instance is busy processing another request');
    }

    this.busy = true;
    this.lastUsed = Date.now();

    try {
      // Add user message to history
      this.conversationHistory.push({
        role: 'user',
        content: message,
        timestamp: new Date()
      });

      // Build conversation context for Claude
      let fullMessage = message;
      if (this.conversationHistory.length > 1) {
        // Include recent conversation history for context
        const recentHistory = this.conversationHistory
          .slice(-6, -1) // Get last 3 exchanges (6 messages)
          .map((msg, index) => {
            if (msg.role === 'user') {
              return `Human: ${msg.content}`;
            } else {
              return `Assistant: ${msg.content}`;
            }
          })
          .join('\n\n');
        
        if (recentHistory) {
          fullMessage = `Here is our conversation so far:\n${recentHistory}\n\nNow, please respond to:\n${message}`;
        }
      }

      console.log(`Sending to Claude CLI instance ${this.id} with --print mode`);
      
      // Use --print mode without session ID
      const startTime = Date.now();
      
      return new Promise((resolve, reject) => {
        let output = '';
        let errorOutput = '';
        
        // Use spawn for better stdin/stdout handling - no session ID
        const claudeProcess = spawn('claude', ['--print'], {
          shell: true,
          timeout: 30000 // 30 seconds timeout
        });
        
        // Handle stdout
        claudeProcess.stdout.on('data', (data) => {
          output += data.toString();
        });
        
        // Handle stderr
        claudeProcess.stderr.on('data', (data) => {
          errorOutput += data.toString();
        });
        
        // Handle process exit
        claudeProcess.on('close', (code) => {
          const endTime = Date.now();
          const duration = endTime - startTime;
          
          this.busy = false;
          
          // Clean the response
          const response = output.trim();
          
          // If we have output, consider it a success regardless of exit code
          // Claude CLI sometimes exits with non-zero codes even on success
          if (!response) {
            if (code !== 0) {
              console.error(`Claude CLI error for ${this.id}: Exit code ${code}`);
              if (errorOutput) {
                console.error(`Claude CLI stderr: ${errorOutput}`);
              }
              return reject(new Error(`Claude CLI failed with exit code ${code}: ${errorOutput}`));
            }
            return reject(new Error('Empty response from Claude CLI'));
          }
          
          // Add assistant response to history
          this.conversationHistory.push({
            role: 'assistant',
            content: response,
            timestamp: new Date()
          });
          
          this.messageCount++;
          
          resolve({
            id: `msg-${Date.now()}-${this.id}`,
            instanceId: this.id,
            content: response,
            timestamp: new Date(),
            duration,
            messageCount: this.messageCount
          });
        });
        
        // Handle error events
        claudeProcess.on('error', (error) => {
          this.busy = false;
          console.error(`Claude CLI spawn error for ${this.id}:`, error);
          reject(error);
        });
        
        // Send the message (with context) via stdin
        claudeProcess.stdin.write(fullMessage);
        claudeProcess.stdin.end();
      });
    } catch (error) {
      this.busy = false;
      throw error;
    }
  }

  async terminate() {
    this.terminating = true;
    this.ready = false;
    console.log(`Terminating Claude CLI instance: ${this.id}`);
  }

  getStats() {
    return {
      id: this.id,
      busy: this.busy,
      ready: this.ready,
      messageCount: this.messageCount,
      lastUsed: this.lastUsed,
      createdAt: this.createdAt,
      conversationLength: this.conversationHistory.length
    };
  }

  isStale(maxAge = 3600000) { // 1 hour default
    return Date.now() - this.lastUsed > maxAge;
  }

  getConversationHistory() {
    return this.conversationHistory;
  }
}

/**
 * Claude CLI Pool Service
 * Manages a pool of Claude CLI instances for concurrent processing
 */
class ClaudeCliPoolService {
  constructor() {
    this.pool = new Map();
    this.sessions = new Map();
    this.initialized = false;
    this.options = {
      minInstances: 2,
      maxInstances: 5,
      maxMessagesPerInstance: 100,
      maxInstanceAge: 3600000, // 1 hour
      staleTimeout: 600000, // 10 minutes
      healthCheckInterval: 30000 // 30 seconds
    };
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageResponseTime: 0,
      poolUtilization: 0,
      recycledInstances: 0
    };
    this.healthCheckTimer = null;
  }

  async initialize(options = {}) {
    if (this.initialized) {
      console.log('Claude CLI pool already initialized');
      return;
    }

    this.options = { ...this.options, ...options };
    
    console.log('Initializing Claude CLI pool with options:', this.options);
    
    // Create initial instances
    const promises = [];
    for (let i = 0; i < this.options.minInstances; i++) {
      promises.push(this.createNewInstance());
    }
    
    await Promise.all(promises);
    
    this.initialized = true;
    
    // Start health check timer
    this.startHealthCheck();
    
    console.log(`Claude CLI pool initialized with ${this.pool.size} instances`);
  }

  async createNewInstance() {
    const instanceId = `cli-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const instance = new ClaudeCliInstance(instanceId);
    
    await instance.initialize();
    
    this.pool.set(instanceId, instance);
    
    return instance;
  }

  async getAvailableInstance() {
    // Find an available instance
    for (const [id, instance] of this.pool) {
      if (instance.ready && !instance.busy) {
        // Check if instance needs recycling
        if (instance.messageCount >= this.options.maxMessagesPerInstance ||
            instance.isStale(this.options.maxInstanceAge)) {
          await this.recycleInstance(id);
          continue;
        }
        return instance;
      }
    }
    
    // If no available instance and we can create more
    if (this.pool.size < this.options.maxInstances) {
      return await this.createNewInstance();
    }
    
    // Wait for an instance to become available
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        for (const [, instance] of this.pool) {
          if (instance.ready && !instance.busy) {
            clearInterval(checkInterval);
            resolve(instance);
            return;
          }
        }
      }, 100);
    });
  }

  async recycleInstance(instanceId) {
    console.log(`Recycling CLI instance: ${instanceId}`);
    
    const instance = this.pool.get(instanceId);
    if (instance) {
      await instance.terminate();
      this.pool.delete(instanceId);
      this.stats.recycledInstances++;
    }
    
    // Create a replacement if below minimum
    if (this.pool.size < this.options.minInstances) {
      await this.createNewInstance();
    }
  }

  async sendMessage(message, options = {}) {
    this.stats.totalRequests++;
    
    try {
      const { sessionId } = options;
      
      // Get or create session instance mapping
      let instance;
      if (sessionId && this.sessions.has(sessionId)) {
        const instanceId = this.sessions.get(sessionId);
        instance = this.pool.get(instanceId);
        
        // If instance is not available, get a new one
        if (!instance || !instance.ready || instance.busy) {
          instance = await this.getAvailableInstance();
          this.sessions.set(sessionId, instance.id);
        }
      } else {
        instance = await this.getAvailableInstance();
        if (sessionId) {
          this.sessions.set(sessionId, instance.id);
        }
      }
      
      console.log(`Sending message to instance ${instance.id}: ${message.substring(0, 50)}...`);
      
      const startTime = Date.now();
      const response = await instance.sendMessage(message);
      const duration = Date.now() - startTime;
      
      this.stats.successfulRequests++;
      this.updateAverageResponseTime(duration);
      this.updatePoolUtilization();
      
      return {
        ...response,
        sessionId: sessionId || instance.id
      };
    } catch (error) {
      this.stats.failedRequests++;
      console.error('Failed to send message:', error);
      throw error;
    }
  }

  updateAverageResponseTime(duration) {
    const totalRequests = this.stats.successfulRequests;
    if (totalRequests === 0) {
      this.stats.averageResponseTime = 0;
    } else if (totalRequests === 1) {
      this.stats.averageResponseTime = duration;
    } else {
      this.stats.averageResponseTime = 
        (this.stats.averageResponseTime * (totalRequests - 1) + duration) / totalRequests;
    }
  }

  updatePoolUtilization() {
    const busyCount = Array.from(this.pool.values()).filter(i => i.busy).length;
    this.stats.poolUtilization = this.pool.size > 0 ? (busyCount / this.pool.size) * 100 : 0;
  }

  startHealthCheck() {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.options.healthCheckInterval);
  }

  async performHealthCheck() {
    console.log('Performing health check on Claude CLI pool...');
    
    // Check for stale instances
    for (const [id, instance] of this.pool) {
      if (!instance.busy && instance.isStale(this.options.staleTimeout)) {
        console.log(`Instance ${id} is stale, recycling...`);
        await this.recycleInstance(id);
      }
    }
    
    // Ensure minimum instances
    while (this.pool.size < this.options.minInstances) {
      await this.createNewInstance();
    }
    
    // Update utilization stats
    this.updatePoolUtilization();
  }

  getStats() {
    const instances = Array.from(this.pool.values()).map(i => i.getStats());
    
    return {
      ...this.stats,
      poolSize: this.pool.size,
      minInstances: this.options.minInstances,
      maxInstances: this.options.maxInstances,
      busyInstances: instances.filter(i => i.busy).length,
      readyInstances: instances.filter(i => i.ready).length,
      instances
    };
  }

  getInstanceInfo(instanceId) {
    const instance = this.pool.get(instanceId);
    if (!instance) {
      return null;
    }
    
    return {
      ...instance.getStats(),
      conversationHistory: instance.getConversationHistory()
    };
  }

  async shutdown() {
    console.log('Shutting down Claude CLI pool...');
    
    // Stop health check
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    
    // Terminate all instances
    const promises = [];
    for (const [, instance] of this.pool) {
      promises.push(instance.terminate());
    }
    
    await Promise.all(promises);
    
    this.pool.clear();
    this.sessions.clear();
    this.initialized = false;
    
    console.log('Claude CLI pool shut down successfully');
  }

  isHealthy() {
    return this.initialized && this.pool.size >= this.options.minInstances;
  }
}

// Create singleton instance
const claudeCliPoolService = new ClaudeCliPoolService();

export default claudeCliPoolService;