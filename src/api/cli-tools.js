// Mock API functions for CLI tools testing
export const fetchCLITools = async () => {
  return [];
};

export const deleteCLITool = async (id) => {
  return { success: true };
};

export const updateCLITool = async (id, updates) => {
  return { success: true, tool: { id, ...updates } };
};

export const createCLITool = async (toolData) => {
  return { success: true, tool: { id: 'new-tool', ...toolData } };
};