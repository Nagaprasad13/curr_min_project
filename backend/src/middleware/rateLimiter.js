const consentConfig = require('../config/consentConfig.json');
const LoginLockout = require('../models/LoginLockout');

const requestCounts = new Map();

/**
 * Lightweight rate limiter for record access and consent actions.
 */
function createRateLimiter({
  windowMs = consentConfig.rateLimitWindowMs || 60000,
  max = consentConfig.rateLimitMaxRequests || 60,
  message = 'Too many requests. Please slow down to prevent scraping or denial-of-service.',
} = {}) {
  return (req, res, next) => {
    if (process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit']) {
      return next();
    }

    const key = (req.user ? req.user._id.toString() : req.ip) + `:${req.baseUrl || req.path}`;
    const now = Date.now();

    const record = requestCounts.get(key) || { count: 0, resetTime: now + windowMs };

    if (now > record.resetTime) {
      record.count = 1;
      record.resetTime = now + windowMs;
    } else {
      record.count += 1;
    }

    requestCounts.set(key, record);

    res.setHeader('X-RateLimit-Limit', max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.count));

    if (record.count > max) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message,
        retryAfterMs: Math.max(0, record.resetTime - now),
      });
    }

    next();
  };
}

/**
 * MongoDB-Persisted Brute-Force Login Protection Middleware.
 * Enforces max 5 consecutive failures per email / IP with a 15-minute lockout.
 * Persistent in MongoDB so lockouts survive process restarts.
 */
function createLoginRateLimiter({
  maxFailures = 5,
  lockoutMs = 15 * 60 * 1000,
} = {}) {
  return {
    async check(req, res, next) {
      if (process.env.NODE_ENV === 'test' && !req.headers['x-test-rate-limit']) {
        return next();
      }

      const email = (req.body?.email || '').toLowerCase().trim();
      const identifier = email || req.ip;

      try {
        const lockoutDoc = await LoginLockout.findOne({ identifier });
        if (lockoutDoc && lockoutDoc.lockedUntil && new Date() < lockoutDoc.lockedUntil) {
          const remainingMinutes = Math.ceil((new Date(lockoutDoc.lockedUntil) - new Date()) / (60 * 1000));
          return res.status(429).json({
            error: 'Too Many Requests',
            message: `Account temporarily locked due to repeated failed login attempts. Try again in ${remainingMinutes} minute(s).`,
            lockedUntil: lockoutDoc.lockedUntil,
          });
        }
      } catch (err) {
        console.warn('[RateLimiter] Database lockout check error:', err.message);
      }

      next();
    },

    async recordFailure(req) {
      const email = (req.body?.email || '').toLowerCase().trim();
      const identifier = email || req.ip;
      const now = new Date();

      try {
        let lockoutDoc = await LoginLockout.findOne({ identifier });
        if (!lockoutDoc) {
          lockoutDoc = new LoginLockout({
            identifier,
            failedAttempts: 1,
            lastAttemptAt: now,
          });
        } else {
          lockoutDoc.failedAttempts += 1;
          lockoutDoc.lastAttemptAt = now;
        }

        if (lockoutDoc.failedAttempts >= maxFailures) {
          lockoutDoc.lockedUntil = new Date(Date.now() + lockoutMs);
        }

        await lockoutDoc.save();
      } catch (err) {
        console.warn('[RateLimiter] Could not persist failed attempt to MongoDB:', err.message);
      }
    },

    async recordSuccess(req) {
      const email = (req.body?.email || '').toLowerCase().trim();
      const identifier = email || req.ip;
      try {
        await LoginLockout.deleteOne({ identifier });
      } catch (err) {
        console.warn('[RateLimiter] Could not clear lockout doc in MongoDB:', err.message);
      }
    },

    async resetAll() {
      try {
        await LoginLockout.deleteMany({});
      } catch (err) {
        // ignore in tests
      }
      requestCounts.clear();
    },
  };
}

module.exports = {
  createRateLimiter,
  createLoginRateLimiter,
};
