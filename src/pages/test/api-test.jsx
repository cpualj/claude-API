import { useState, useCallback } from 'react';
import { 
  Box, 
  Card, 
  Stack, 
  Button, 
  TextField, 
  Typography, 
  Alert,
  CircularProgress,
  Divider,
  Chip
} from '@mui/material';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export default function ApiTestPage() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState({});
  const [error, setError] = useState(null);
  const [email, setEmail] = useState('test@example.com');
  const [password, setPassword] = useState('test123');
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('Hello from frontend!');

  const testEndpoint = useCallback(async (endpoint, options = {}) => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { 'Authorization': `Bearer ${token}` }),
          ...options.headers
        },
        ...options
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || `HTTP ${response.status}`);
      }
      
      setResults(prev => ({
        ...prev,
        [endpoint]: { success: true, data, status: response.status }
      }));
      
      return data;
    } catch (err) {
      const errorMsg = err.message || 'Request failed';
      setError(errorMsg);
      setResults(prev => ({
        ...prev,
        [endpoint]: { success: false, error: errorMsg }
      }));
      throw err;
    } finally {
      setLoading(false);
    }
  }, [token]);

  const testHealth = () => testEndpoint('/health');
  
  const testLogin = async () => {
    const data = await testEndpoint('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    if (data.token) {
      setToken(data.token);
    }
  };
  
  const testRegister = () => testEndpoint('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ 
      email, 
      password, 
      name: 'Test User' 
    })
  });
  
  const testChat = () => testEndpoint('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ 
      message,
      sessionId: 'test-session',
      stream: false 
    })
  });
  
  const testSessions = () => testEndpoint('/api/sessions');
  
  const createSession = () => testEndpoint('/api/sessions', {
    method: 'POST',
    body: JSON.stringify({ 
      name: 'Test Session',
      toolId: 'claude' 
    })
  });
  
  const testTools = () => testEndpoint('/api/tools');
  const testUsage = () => testEndpoint('/api/usage');
  const testApiKeys = () => testEndpoint('/api/keys');

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" sx={{ mb: 3 }}>
        API Integration Test
      </Typography>
      
      <Stack spacing={3}>
        {/* Status */}
        <Card sx={{ p: 2 }}>
          <Stack direction="row" spacing={2} alignItems="center">
            <Typography variant="subtitle1">Backend URL:</Typography>
            <Chip label={API_BASE} color="primary" />
            {token && (
              <>
                <Typography variant="subtitle1">Token:</Typography>
                <Chip 
                  label={`${token.substring(0, 20)}...`} 
                  color="success" 
                  size="small"
                />
              </>
            )}
          </Stack>
        </Card>

        {/* Authentication Tests */}
        <Card sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Authentication</Typography>
          <Stack spacing={2}>
            <Stack direction="row" spacing={2}>
              <TextField
                label="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                size="small"
                fullWidth
              />
              <TextField
                label="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                size="small"
                fullWidth
              />
            </Stack>
            <Stack direction="row" spacing={2}>
              <Button variant="contained" onClick={testLogin} disabled={loading}>
                Test Login
              </Button>
              <Button variant="outlined" onClick={testRegister} disabled={loading}>
                Test Register
              </Button>
            </Stack>
          </Stack>
        </Card>

        {/* API Tests */}
        <Card sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>API Endpoints</Typography>
          <Stack spacing={2}>
            <TextField
              label="Chat Message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              size="small"
              fullWidth
              sx={{ mb: 2 }}
            />
            <Stack direction="row" spacing={2} flexWrap="wrap">
              <Button variant="outlined" onClick={testHealth} disabled={loading}>
                Test Health
              </Button>
              <Button variant="outlined" onClick={testChat} disabled={loading || !token}>
                Test Chat
              </Button>
              <Button variant="outlined" onClick={testSessions} disabled={loading || !token}>
                List Sessions
              </Button>
              <Button variant="outlined" onClick={createSession} disabled={loading || !token}>
                Create Session
              </Button>
              <Button variant="outlined" onClick={testTools} disabled={loading}>
                List Tools
              </Button>
              <Button variant="outlined" onClick={testUsage} disabled={loading || !token}>
                Get Usage
              </Button>
              <Button variant="outlined" onClick={testApiKeys} disabled={loading || !token}>
                List API Keys
              </Button>
            </Stack>
          </Stack>
        </Card>

        {/* Results */}
        <Card sx={{ p: 2 }}>
          <Typography variant="h6" sx={{ mb: 2 }}>Test Results</Typography>
          
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          
          {loading && (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}>
              <CircularProgress />
            </Box>
          )}
          
          <Stack spacing={2}>
            {Object.entries(results).map(([endpoint, result]) => (
              <Box key={endpoint}>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Chip 
                    label={result.success ? 'SUCCESS' : 'FAILED'} 
                    color={result.success ? 'success' : 'error'}
                    size="small"
                  />
                  <Typography variant="body2" fontFamily="monospace">
                    {endpoint}
                  </Typography>
                  {result.status && (
                    <Chip label={`${result.status}`} size="small" variant="outlined" />
                  )}
                </Stack>
                {result.data && (
                  <Box sx={{ mt: 1, p: 1, bgcolor: 'grey.100', borderRadius: 1 }}>
                    <pre style={{ margin: 0, fontSize: '12px', overflow: 'auto' }}>
                      {JSON.stringify(result.data, null, 2)}
                    </pre>
                  </Box>
                )}
                {result.error && (
                  <Alert severity="error" sx={{ mt: 1 }}>
                    {result.error}
                  </Alert>
                )}
                <Divider sx={{ mt: 2 }} />
              </Box>
            ))}
          </Stack>
        </Card>
      </Stack>
    </Box>
  );
}