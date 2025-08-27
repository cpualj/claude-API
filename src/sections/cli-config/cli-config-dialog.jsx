import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  FormControlLabel,
  Switch,
  MenuItem,
  Tabs,
  Tab,
  Box,
  Typography,
  Chip,
  Stack,
  IconButton,
  Divider,
} from '@mui/material';

import { Iconify } from 'src/components/iconify';

// ----------------------------------------------------------------------

function TabPanel({ children, value, index, ...other }) {
  return (
    <div hidden={value !== index} {...other}>
      {value === index && <Box sx={{ pt: 3 }}>{children}</Box>}
    </div>
  );
}

export function CLIConfigDialog({ open, tool, onClose, onSave }) {
  const [tab, setTab] = useState(0);
  const [envVars, setEnvVars] = useState([]);
  const [args, setArgs] = useState([]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm({
    defaultValues: tool || {
      name: '',
      command: '',
      description: '',
      enabled: true,
      execution: {
        type: 'spawn',
        shell: false,
        timeout: 60000,
        encoding: 'utf8',
      },
      args: {
        template: [],
        streaming: false,
        streamFlag: '--stream',
        userInputPosition: 'end',
      },
      io: {
        inputMethod: 'stdin',
        outputParser: 'raw',
        errorHandling: 'throw',
      },
      session: {
        supported: false,
        persistProcess: false,
        maxSessions: 10,
      },
      auth: {
        required: false,
        type: 'none',
        authFile: '',
        envVars: [],
        checkCommand: '',
      },
      limits: {
        maxConcurrent: 5,
        requestsPerMinute: 60,
        cooldownPeriod: 0,
      },
    },
  });

  const authRequired = watch('auth.required');
  const authType = watch('auth.type');
  const sessionSupported = watch('session.supported');

  useEffect(() => {
    if (tool) {
      setEnvVars(tool.auth?.envVars || []);
      setArgs(tool.args?.template || []);
    }
  }, [tool]);

  const handleAddEnvVar = () => {
    setEnvVars([...envVars, '']);
  };

  const handleRemoveEnvVar = (index) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  const handleEnvVarChange = (index, value) => {
    const newVars = [...envVars];
    newVars[index] = value;
    setEnvVars(newVars);
  };

  const handleAddArg = () => {
    setArgs([...args, '']);
  };

  const handleRemoveArg = (index) => {
    setArgs(args.filter((_, i) => i !== index));
  };

  const handleArgChange = (index, value) => {
    const newArgs = [...args];
    newArgs[index] = value;
    setArgs(newArgs);
  };

  const onSubmit = (data) => {
    // 添加环境变量和参数
    data.auth.envVars = envVars.filter(v => v);
    data.args.template = args.filter(a => a);
    
    onSave(data);
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <form onSubmit={handleSubmit(onSubmit)}>
        <DialogTitle>
          {tool ? '编辑 CLI 工具' : '添加 CLI 工具'}
        </DialogTitle>

        <DialogContent>
          <Tabs value={tab} onChange={(e, v) => setTab(v)}>
            <Tab label="基础配置" />
            <Tab label="执行配置" />
            <Tab label="认证配置" />
            <Tab label="高级设置" />
          </Tabs>

          {/* 基础配置 */}
          <TabPanel value={tab} index={0}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="工具名称"
                  {...register('name', { required: '名称必填' })}
                  error={!!errors.name}
                  helperText={errors.name?.message}
                />
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  label="命令"
                  {...register('command', { required: '命令必填' })}
                  error={!!errors.command}
                  helperText={errors.command?.message || '例如: claude, openai, python'}
                />
              </Grid>
              <Grid item xs={12}>
                <TextField
                  fullWidth
                  multiline
                  rows={2}
                  label="描述"
                  {...register('description')}
                />
              </Grid>
              <Grid item xs={12}>
                <FormControlLabel
                  control={<Switch {...register('enabled')} defaultChecked />}
                  label="启用此工具"
                />
              </Grid>
            </Grid>
          </TabPanel>

          {/* 执行配置 */}
          <TabPanel value={tab} index={1}>
            <Grid container spacing={3}>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  select
                  label="执行类型"
                  {...register('execution.type')}
                  defaultValue="spawn"
                >
                  <MenuItem value="spawn">Spawn (推荐)</MenuItem>
                  <MenuItem value="exec">Exec</MenuItem>
                  <MenuItem value="shell">Shell</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  type="number"
                  label="超时时间 (毫秒)"
                  {...register('execution.timeout')}
                  defaultValue={60000}
                />
              </Grid>
              
              <Grid item xs={12}>
                <Typography variant="subtitle2" gutterBottom>
                  命令参数模板
                </Typography>
                <Stack spacing={1}>
                  {args.map((arg, index) => (
                    <Stack key={index} direction="row" spacing={1}>
                      <TextField
                        fullWidth
                        size="small"
                        value={arg}
                        onChange={(e) => handleArgChange(index, e.target.value)}
                        placeholder="参数 (例如: --model, gpt-4)"
                      />
                      <IconButton onClick={() => handleRemoveArg(index)}>
                        <Iconify icon="eva:trash-2-outline" />
                      </IconButton>
                    </Stack>
                  ))}
                  <Button
                    size="small"
                    onClick={handleAddArg}
                    startIcon={<Iconify icon="eva:plus-fill" />}
                  >
                    添加参数
                  </Button>
                </Stack>
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  select
                  label="输入方式"
                  {...register('io.inputMethod')}
                  defaultValue="stdin"
                >
                  <MenuItem value="stdin">标准输入 (stdin)</MenuItem>
                  <MenuItem value="arg">命令参数</MenuItem>
                  <MenuItem value="file">文件</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  select
                  label="用户输入位置"
                  {...register('args.userInputPosition')}
                  defaultValue="end"
                >
                  <MenuItem value="start">开头</MenuItem>
                  <MenuItem value="end">结尾</MenuItem>
                  <MenuItem value="replace">替换 {'{{input}}'}</MenuItem>
                </TextField>
              </Grid>
              
              <Grid item xs={12}>
                <FormControlLabel
                  control={<Switch {...register('args.streaming')} />}
                  label="支持流式输出"
                />
              </Grid>
              {watch('args.streaming') && (
                <Grid item xs={12} md={6}>
                  <TextField
                    fullWidth
                    label="流式参数"
                    {...register('args.streamFlag')}
                    defaultValue="--stream"
                  />
                </Grid>
              )}
            </Grid>
          </TabPanel>

          {/* 认证配置 */}
          <TabPanel value={tab} index={2}>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <FormControlLabel
                  control={<Switch {...register('auth.required')} />}
                  label="需要认证"
                />
              </Grid>
              
              {authRequired && (
                <>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      select
                      label="认证类型"
                      {...register('auth.type')}
                      defaultValue="none"
                    >
                      <MenuItem value="none">无</MenuItem>
                      <MenuItem value="file">文件</MenuItem>
                      <MenuItem value="env">环境变量</MenuItem>
                      <MenuItem value="oauth">OAuth</MenuItem>
                    </TextField>
                  </Grid>

                  {authType === 'file' && (
                    <Grid item xs={12}>
                      <TextField
                        fullWidth
                        label="认证文件路径"
                        {...register('auth.authFile')}
                        placeholder="/root/.claude/config.json"
                      />
                    </Grid>
                  )}

                  {authType === 'env' && (
                    <Grid item xs={12}>
                      <Typography variant="subtitle2" gutterBottom>
                        环境变量
                      </Typography>
                      <Stack spacing={1}>
                        {envVars.map((varName, index) => (
                          <Stack key={index} direction="row" spacing={1}>
                            <TextField
                              fullWidth
                              size="small"
                              value={varName}
                              onChange={(e) => handleEnvVarChange(index, e.target.value)}
                              placeholder="环境变量名 (例如: API_KEY)"
                            />
                            <IconButton onClick={() => handleRemoveEnvVar(index)}>
                              <Iconify icon="eva:trash-2-outline" />
                            </IconButton>
                          </Stack>
                        ))}
                        <Button
                          size="small"
                          onClick={handleAddEnvVar}
                          startIcon={<Iconify icon="eva:plus-fill" />}
                        >
                          添加环境变量
                        </Button>
                      </Stack>
                    </Grid>
                  )}

                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="认证检查命令"
                      {...register('auth.checkCommand')}
                      placeholder="claude --version"
                      helperText="用于验证认证是否有效的命令"
                    />
                  </Grid>
                </>
              )}
            </Grid>
          </TabPanel>

          {/* 高级设置 */}
          <TabPanel value={tab} index={3}>
            <Grid container spacing={3}>
              <Grid item xs={12}>
                <Typography variant="subtitle2" gutterBottom>
                  会话管理
                </Typography>
                <FormControlLabel
                  control={<Switch {...register('session.supported')} />}
                  label="支持会话"
                />
              </Grid>
              
              {sessionSupported && (
                <>
                  <Grid item xs={12} md={6}>
                    <FormControlLabel
                      control={<Switch {...register('session.persistProcess')} />}
                      label="保持进程"
                    />
                  </Grid>
                  <Grid item xs={12} md={6}>
                    <TextField
                      fullWidth
                      type="number"
                      label="最大会话数"
                      {...register('session.maxSessions')}
                      defaultValue={10}
                    />
                  </Grid>
                </>
              )}

              <Grid item xs={12}>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" gutterBottom>
                  限制和配额
                </Typography>
              </Grid>

              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  type="number"
                  label="最大并发数"
                  {...register('limits.maxConcurrent')}
                  defaultValue={5}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  type="number"
                  label="每分钟请求数"
                  {...register('limits.requestsPerMinute')}
                  defaultValue={60}
                />
              </Grid>
              <Grid item xs={12} md={4}>
                <TextField
                  fullWidth
                  type="number"
                  label="冷却期 (毫秒)"
                  {...register('limits.cooldownPeriod')}
                  defaultValue={0}
                />
              </Grid>

              <Grid item xs={12}>
                <Divider sx={{ my: 2 }} />
                <Typography variant="subtitle2" gutterBottom>
                  输出配置
                </Typography>
              </Grid>

              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  select
                  label="输出解析器"
                  {...register('io.outputParser')}
                  defaultValue="raw"
                >
                  <MenuItem value="raw">原始文本</MenuItem>
                  <MenuItem value="json">JSON</MenuItem>
                  <MenuItem value="line-by-line">逐行</MenuItem>
                </TextField>
              </Grid>
              <Grid item xs={12} md={6}>
                <TextField
                  fullWidth
                  select
                  label="错误处理"
                  {...register('io.errorHandling')}
                  defaultValue="throw"
                >
                  <MenuItem value="throw">抛出错误</MenuItem>
                  <MenuItem value="ignore">忽略</MenuItem>
                  <MenuItem value="retry">重试</MenuItem>
                </TextField>
              </Grid>
            </Grid>
          </TabPanel>
        </DialogContent>

        <DialogActions>
          <Button onClick={onClose}>取消</Button>
          <Button type="submit" variant="contained">
            保存
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}