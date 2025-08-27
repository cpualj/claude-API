// Mock rate limiting middleware for testing
export const rateLimiter = (req, res, next) => {
  next();
};