import rateLimit from 'express-rate-limit';
import { MemoryStore } from 'express-rate-limit';

// Custom store for testing that allows manual reset
class TestMemoryStore extends MemoryStore {
  async resetKey(key: string): Promise<void> {
    // Clear the key from both current and previous maps
    this.current.delete(key);
    this.previous.delete(key);
  }

  async resetAll(): Promise<void> {
    // Clear all keys from both maps
    this.current.clear();
    this.previous.clear();
  }
}

// Rate limit configuration based on environment
const isTest = process.env.NODE_ENV === 'test';

// Create rate limiters
const createLimiter = (options: {
  windowMs: number,
  max: number,
  message: string
}) => {
  const store = new TestMemoryStore();
  
  const limiter = rateLimit({
    windowMs: isTest ? 1000 : options.windowMs,
    max: isTest ? 10 : options.max,
    message: { error: options.message },
    standardHeaders: true,
    legacyHeaders: false,
    store: store
  });

  // Add the store to the limiter for test resets
  (limiter as any).store = store;

  return limiter;
};

// Create rate limiter
const apiLimiterStore = isTest ? new TestMemoryStore() : new MemoryStore();
export const apiLimiter = rateLimit({
  windowMs: isTest ? 1000 : 15 * 60 * 1000, // 1 second in test, 15 minutes in production
  max: isTest ? 10 : 100, // 10 requests in test, 100 in production
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  store: apiLimiterStore
});

// Add the store to the limiter for test resets
(apiLimiter as any).store = apiLimiterStore;

// More strict limit for authentication routes
export const authLimiter = createLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit each IP to 5 requests per window
  message: 'Too many login attempts, please try again later.',
});

// Limit for appointment creation
export const appointmentLimiter = createLimiter({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 3, // Limit each IP to 3 appointments per day
  message: 'Maximum appointment creation limit reached for today.',
});

// Reset all limiters (for testing)
export const resetAllLimiters = async () => {
  if (isTest) {
    for (const limiter of [apiLimiter, authLimiter, appointmentLimiter]) {
      const store = (limiter as any).store;
      if (store instanceof TestMemoryStore) {
        await store.resetAll();
      }
    }
  }
};
