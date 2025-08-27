// Mock CLI Tool Service for testing
export default class CLIToolService {
  constructor() {
    this.tools = new Map();
  }

  async getAllTools() {
    return Array.from(this.tools.values());
  }

  async getToolById(id) {
    return this.tools.get(id) || null;
  }

  async createTool(toolData) {
    const id = toolData.id || toolData.name.toLowerCase().replace(/\s+/g, '-');
    const tool = {
      id,
      ...toolData,
      createdAt: new Date(),
    };
    this.tools.set(id, tool);
    return tool;
  }

  async updateTool(id, updates) {
    const tool = this.tools.get(id);
    if (!tool) {
      throw new Error(`Tool ${id} not found`);
    }
    const updated = { ...tool, ...updates };
    this.tools.set(id, updated);
    return updated;
  }

  async deleteTool(id) {
    const tool = this.tools.get(id);
    if (!tool) {
      throw new Error(`Tool ${id} not found`);
    }
    this.tools.delete(id);
    return { success: true, removed: tool.name };
  }

  async validateTool(toolConfig) {
    return {
      valid: true,
      authStatus: 'authenticated',
      commandAvailable: true,
    };
  }
}