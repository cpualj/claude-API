import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Box,
  Card,
  Stack,
  Paper,
  Button,
  TextField,
  Typography,
  Avatar,
  IconButton,
  Divider,
  CircularProgress,
  Alert,
  Chip,
  Container
} from '@mui/material';
import SendIcon from '@mui/icons-material/Send';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import PersonIcon from '@mui/icons-material/Person';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3002';

export default function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [token, setToken] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [streaming, setStreaming] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initialize session on mount
  useEffect(() => {
    initializeSession();
  }, []);

  const initializeSession = async () => {
    try {
      // Auto login for development
      const loginResponse = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'chat@example.com',
          password: 'chat123'
        })
      });

      const loginData = await loginResponse.json();
      setToken(loginData.token);

      // Create a new session
      const sessionResponse = await fetch(`${API_URL}/api/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${loginData.token}`
        },
        body: JSON.stringify({
          name: 'Chat Session ' + new Date().toLocaleString()
        })
      });

      const sessionData = await sessionResponse.json();
      setSessionId(sessionData.id);
      
      // Add welcome message
      setMessages([{
        role: 'assistant',
        content: "Hello! I'm Claude, your AI assistant. How can I help you today?",
        timestamp: new Date()
      }]);
    } catch (err) {
      console.error('Failed to initialize session:', err);
      setError('Failed to initialize chat session');
    }
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = {
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: input,
          sessionId,
          stream: false,
          context: messages.slice(-10) // Last 10 messages for context
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      
      const assistantMessage = {
        role: 'assistant',
        content: data.content,
        timestamp: new Date(),
        usage: data.usage
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (err) {
      setError(`Failed to send message: ${err.message}`);
      console.error('Chat error:', err);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const sendStreamingMessage = async () => {
    if (!input.trim() || loading) return;

    const userMessage = {
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const currentInput = input;
    setInput('');
    setLoading(true);
    setStreaming(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          message: currentInput,
          sessionId,
          stream: true,
          context: messages.slice(-10)
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamContent = '';

      // Add placeholder for streaming message
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        streaming: true
      }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              break;
            }
            try {
              const json = JSON.parse(data);
              if (json.chunk) {
                streamContent += json.chunk;
                // Update the last message
                setMessages(prev => {
                  const newMessages = [...prev];
                  newMessages[newMessages.length - 1] = {
                    ...newMessages[newMessages.length - 1],
                    content: streamContent
                  };
                  return newMessages;
                });
              }
            } catch (e) {
              // Ignore parse errors
            }
          }
        }
      }

      // Mark streaming as complete
      setMessages(prev => {
        const newMessages = [...prev];
        newMessages[newMessages.length - 1].streaming = false;
        return newMessages;
      });
    } catch (err) {
      setError(`Stream error: ${err.message}`);
      console.error('Stream error:', err);
    } finally {
      setLoading(false);
      setStreaming(false);
      inputRef.current?.focus();
    }
  };

  const clearChat = () => {
    setMessages([{
      role: 'assistant',
      content: "Chat cleared. How can I help you?",
      timestamp: new Date()
    }]);
  };

  const newSession = () => {
    initializeSession();
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (e.ctrlKey) {
        sendStreamingMessage();
      } else {
        sendMessage();
      }
    }
  };

  return (
    <Container maxWidth="lg" sx={{ height: '100vh', py: 2 }}>
      <Stack spacing={2} sx={{ height: '100%' }}>
        {/* Header */}
        <Card sx={{ p: 2 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between">
            <Stack direction="row" spacing={2} alignItems="center">
              <Avatar sx={{ bgcolor: 'primary.main' }}>
                <SmartToyIcon />
              </Avatar>
              <Box>
                <Typography variant="h5">Claude Chat</Typography>
                <Typography variant="caption" color="text.secondary">
                  Session: {sessionId || 'Initializing...'}
                </Typography>
              </Box>
            </Stack>
            <Stack direction="row" spacing={1}>
              <Chip 
                label={streaming ? "Streaming" : loading ? "Processing" : "Ready"} 
                color={loading ? "warning" : "success"} 
                size="small"
              />
              <IconButton onClick={clearChat} size="small" title="Clear chat">
                <DeleteIcon />
              </IconButton>
              <IconButton onClick={newSession} size="small" title="New session">
                <RefreshIcon />
              </IconButton>
            </Stack>
          </Stack>
        </Card>

        {/* Chat Messages */}
        <Paper 
          sx={{ 
            flex: 1, 
            overflow: 'auto', 
            p: 2,
            bgcolor: 'grey.50'
          }}
        >
          <Stack spacing={2}>
            {messages.map((message, index) => (
              <Box
                key={index}
                sx={{
                  display: 'flex',
                  justifyContent: message.role === 'user' ? 'flex-end' : 'flex-start'
                }}
              >
                <Box
                  sx={{
                    maxWidth: '70%',
                    display: 'flex',
                    gap: 1,
                    flexDirection: message.role === 'user' ? 'row-reverse' : 'row'
                  }}
                >
                  <Avatar
                    sx={{
                      bgcolor: message.role === 'user' ? 'secondary.main' : 'primary.main',
                      width: 32,
                      height: 32
                    }}
                  >
                    {message.role === 'user' ? <PersonIcon /> : <SmartToyIcon />}
                  </Avatar>
                  <Paper
                    sx={{
                      p: 2,
                      bgcolor: message.role === 'user' ? 'primary.light' : 'background.paper',
                      color: message.role === 'user' ? 'primary.contrastText' : 'text.primary'
                    }}
                  >
                    <Typography 
                      variant="body1" 
                      sx={{ 
                        whiteSpace: 'pre-wrap',
                        opacity: message.streaming ? 0.7 : 1
                      }}
                    >
                      {message.content}
                      {message.streaming && <CircularProgress size={12} sx={{ ml: 1 }} />}
                    </Typography>
                    {message.usage && (
                      <Typography variant="caption" sx={{ mt: 1, display: 'block', opacity: 0.7 }}>
                        Tokens: {message.usage.totalTokens} ({message.usage.inputTokens} + {message.usage.outputTokens})
                      </Typography>
                    )}
                  </Paper>
                </Box>
              </Box>
            ))}
            <div ref={messagesEndRef} />
          </Stack>
        </Paper>

        {/* Error Alert */}
        {error && (
          <Alert severity="error" onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Input Area */}
        <Card sx={{ p: 2 }}>
          <Stack direction="row" spacing={2}>
            <TextField
              ref={inputRef}
              fullWidth
              multiline
              maxRows={4}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Type your message... (Enter to send, Ctrl+Enter for streaming)"
              disabled={loading || !sessionId}
              sx={{ flex: 1 }}
            />
            <Stack>
              <Button
                variant="contained"
                onClick={sendMessage}
                disabled={!input.trim() || loading || !sessionId}
                endIcon={<SendIcon />}
              >
                Send
              </Button>
              <Button
                size="small"
                onClick={sendStreamingMessage}
                disabled={!input.trim() || loading || !sessionId}
                sx={{ mt: 1 }}
              >
                Stream
              </Button>
            </Stack>
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
            Enter: Send | Ctrl+Enter: Stream | Shift+Enter: New line
          </Typography>
        </Card>
      </Stack>
    </Container>
  );
}