// Mock authentication middleware for testing
export const authMiddleware = (req, res, next) => {
  req.user = { id: 'test-user', role: 'admin' };
  next();
};

export const adminMiddleware = (req, res, next) => {
  if (req.user && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

export const authenticateToken = authMiddleware;

export const authenticateAPIKey = (req, res, next) => {
  req.apiKey = { id: 'test-key', userId: 'test-user' };
  next();
};