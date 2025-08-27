import { useState, useEffect } from 'react';
import { 
  Box, 
  Chip, 
  LinearProgress, 
  Typography,
  Alert,
  Stack
} from '@mui/material';
import io from 'socket.io-client';

export default function QueueStatus({ sessionId }) {
  const [queueStatus, setQueueStatus] = useState(null);
  const [myPosition, setMyPosition] = useState(null);
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    // 连接 WebSocket
    const newSocket = io(process.env.REACT_APP_API_URL || 'http://localhost:3002');
    
    // 监听队列状态更新
    newSocket.on('queue-status', (status) => {
      setQueueStatus(status);
    });

    // 监听个人请求状态
    newSocket.on('queue-update', (data) => {
      if (data.type === 'processing' && data.sessionId === sessionId) {
        setMyPosition(0); // 正在处理
      } else if (data.type === 'queued') {
        setMyPosition(data.position);
      }
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, [sessionId]);

  if (!queueStatus) return null;

  const { queueLength, isProcessing, requests } = queueStatus;

  // 没有排队的情况
  if (queueLength === 0 && !isProcessing) {
    return (
      <Chip 
        label="Ready - No queue" 
        color="success" 
        size="small" 
      />
    );
  }

  // 正在处理
  if (isProcessing && myPosition === 0) {
    return (
      <Stack spacing={1} sx={{ minWidth: 200 }}>
        <Chip 
          label="Processing your request..." 
          color="primary" 
          size="small"
        />
        <LinearProgress />
      </Stack>
    );
  }

  // 在队列中等待
  if (myPosition > 0) {
    const estimatedWait = myPosition * 5; // 假设每个请求5秒
    
    return (
      <Alert severity="info" sx={{ py: 0.5 }}>
        <Typography variant="caption">
          Position in queue: {myPosition} of {queueLength}
        </Typography>
        <Typography variant="caption" display="block">
          Estimated wait: ~{estimatedWait} seconds
        </Typography>
        <LinearProgress 
          variant="determinate" 
          value={(queueLength - myPosition + 1) / queueLength * 100}
          sx={{ mt: 1 }}
        />
      </Alert>
    );
  }

  // 显示总体队列状态
  return (
    <Box>
      <Chip 
        label={`Queue: ${queueLength} waiting`} 
        color={queueLength > 5 ? "warning" : "default"}
        size="small"
      />
      {queueLength > 10 && (
        <Typography variant="caption" color="warning.main" display="block">
          High demand - responses may be delayed
        </Typography>
      )}
    </Box>
  );
}