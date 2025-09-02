// Mock API functions for CLI tools testing
export const fetchCLITools = async () => [];

export const deleteCLITool = async (id) => ({ success: true });

export const updateCLITool = async (id, updates) => ({ success: true, tool: { id, ...updates } });

export const createCLITool = async (toolData) => ({ success: true, tool: { id: 'new-tool', ...toolData } });