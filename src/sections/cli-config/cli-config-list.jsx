import { useState, useEffect, useCallback } from 'react';

import {
  Box,
  Card,
  Table,
  Button,
  Switch,
  TableRow,
  TableBody,
  TableCell,
  TableHead,
  IconButton,
  Typography,
  TableContainer,
  Chip,
  Stack,
  Tooltip,
} from '@mui/material';

import { Iconify } from 'src/components/iconify';
import { Scrollbar } from 'src/components/scrollbar';

import { CLIConfigDialog } from './cli-config-dialog';
import { CLITestDialog } from './cli-test-dialog';

// ----------------------------------------------------------------------

export function CLIConfigList() {
  const [tools, setTools] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTool, setSelectedTool] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [testDialogOpen, setTestDialogOpen] = useState(false);
  const [testTool, setTestTool] = useState(null);

  // 获取 CLI 工具列表
  const fetchTools = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/cli-tools', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      const data = await response.json();
      setTools(data.tools || []);
    } catch (error) {
      console.error('Failed to fetch CLI tools:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTools();
  }, [fetchTools]);

  // 切换工具启用状态
  const handleToggleEnabled = async (toolId, enabled) => {
    try {
      await fetch(`/api/admin/cli-tools/${toolId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify({ enabled }),
      });
      await fetchTools();
    } catch (error) {
      console.error('Failed to update tool:', error);
    }
  };

  // 删除工具
  const handleDelete = async (toolId) => {
    if (!window.confirm('确定要删除这个 CLI 工具配置吗？')) {
      return;
    }

    try {
      await fetch(`/api/admin/cli-tools/${toolId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      });
      await fetchTools();
    } catch (error) {
      console.error('Failed to delete tool:', error);
    }
  };

  // 打开编辑对话框
  const handleEdit = (tool) => {
    setSelectedTool(tool);
    setDialogOpen(true);
  };

  // 打开新增对话框
  const handleAdd = () => {
    setSelectedTool(null);
    setDialogOpen(true);
  };

  // 打开测试对话框
  const handleTest = (tool) => {
    setTestTool(tool);
    setTestDialogOpen(true);
  };

  // 保存工具配置
  const handleSave = async (toolData) => {
    try {
      const method = selectedTool ? 'PUT' : 'POST';
      const url = selectedTool 
        ? `/api/admin/cli-tools/${selectedTool.id}`
        : '/api/admin/cli-tools';

      await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
        body: JSON.stringify(toolData),
      });

      await fetchTools();
      setDialogOpen(false);
    } catch (error) {
      console.error('Failed to save tool:', error);
    }
  };

  return (
    <>
      <Card>
        <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="h6">CLI 工具配置</Typography>
          <Button
            variant="contained"
            startIcon={<Iconify icon="eva:plus-fill" />}
            onClick={handleAdd}
          >
            添加工具
          </Button>
        </Box>

        <Scrollbar>
          <TableContainer sx={{ minWidth: 800 }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>名称</TableCell>
                  <TableCell>命令</TableCell>
                  <TableCell>描述</TableCell>
                  <TableCell>认证</TableCell>
                  <TableCell>会话</TableCell>
                  <TableCell>状态</TableCell>
                  <TableCell align="right">操作</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tools.map((tool) => (
                  <TableRow key={tool.id} hover>
                    <TableCell>
                      <Typography variant="subtitle2">{tool.name}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography 
                        variant="body2" 
                        sx={{ 
                          fontFamily: 'monospace',
                          bgcolor: 'grey.100',
                          px: 1,
                          py: 0.5,
                          borderRadius: 0.5,
                          display: 'inline-block',
                        }}
                      >
                        {tool.command}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {tool.description || '-'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {tool.auth?.required ? (
                        <Chip 
                          label={tool.auth.type} 
                          size="small" 
                          color="warning"
                        />
                      ) : (
                        <Chip 
                          label="无需认证" 
                          size="small" 
                          variant="outlined"
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {tool.session?.supported ? (
                        <Iconify 
                          icon="eva:checkmark-circle-2-fill" 
                          sx={{ color: 'success.main' }}
                        />
                      ) : (
                        <Iconify 
                          icon="eva:close-circle-fill" 
                          sx={{ color: 'text.disabled' }}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={tool.enabled}
                        onChange={(e) => handleToggleEnabled(tool.id, e.target.checked)}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Tooltip title="测试">
                          <IconButton 
                            size="small"
                            onClick={() => handleTest(tool)}
                            disabled={!tool.enabled}
                          >
                            <Iconify icon="eva:play-circle-outline" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="编辑">
                          <IconButton 
                            size="small"
                            onClick={() => handleEdit(tool)}
                          >
                            <Iconify icon="eva:edit-fill" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="删除">
                          <IconButton 
                            size="small"
                            onClick={() => handleDelete(tool.id)}
                            sx={{ color: 'error.main' }}
                          >
                            <Iconify icon="eva:trash-2-outline" />
                          </IconButton>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                ))}

                {tools.length === 0 && !loading && (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                      <Typography color="text.secondary">
                        暂无 CLI 工具配置
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Scrollbar>
      </Card>

      {dialogOpen && (
        <CLIConfigDialog
          open={dialogOpen}
          tool={selectedTool}
          onClose={() => setDialogOpen(false)}
          onSave={handleSave}
        />
      )}

      {testDialogOpen && testTool && (
        <CLITestDialog
          open={testDialogOpen}
          tool={testTool}
          onClose={() => setTestDialogOpen(false)}
        />
      )}
    </>
  );
}