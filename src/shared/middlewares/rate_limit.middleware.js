/**
 * REST rate limit middleware.
 *
 * Responsibility:
 * - Protect REST endpoints from repeated requests.
 * - Keep rate limiting reusable without adding endpoint business logic.
 */

// *************** IMPORT MODULE ***************
const { AppError } = require('../../core/errors');

// *************** HELPER FUNCTION ***************

/**
 * Creates an in-memory fixed-window rate limit middleware.
 *
 * @param {Object} options - Rate limit options.
 * @param {number} options.windowMs - Window duration in milliseconds.
 * @param {number} options.maxRequests - Maximum requests allowed in the window.
 * @param {string} options.code - Stable AppError code when the limit is exceeded.
 * @param {string} options.message - Static AppError message when the limit is exceeded.
 * @param {Function} [options.keyGenerator] - Optional request key generator.
 * @returns {Function} Express middleware.
 */
function CreateRateLimitMiddleware(options) {
  const requestBuckets = new Map();
  const windowMs = Number(options.windowMs);
  const maxRequests = Number(options.maxRequests);
  let lastCleanupAt = 0;

  return function RateLimitMiddleware(request, response, next) {
    const now = Date.now();

    // *************** Remove expired buckets periodically so rate-limit keys do not grow without bound
    if (now - lastCleanupAt >= windowMs) {
      requestBuckets.forEach((bucket, bucketKey) => {
        if (bucket.expiresAt <= now) {
          requestBuckets.delete(bucketKey);
        }
      });
      lastCleanupAt = now;
    }

    const key = options.keyGenerator
      ? options.keyGenerator(request)
      : `${request.ip || request.socket?.remoteAddress || 'unknown'}:${request.baseUrl}${request.path}`;
    const currentBucket = requestBuckets.get(key);

    if (!currentBucket || currentBucket.expiresAt <= now) {
      requestBuckets.set(key, {
        count: 1,
        expiresAt: now + windowMs,
      });

      next();
      return;
    }

    if (currentBucket.count >= maxRequests) {
      next(
        new AppError(options.code, 429, options.message, {
          retry_after_seconds: Math.ceil((currentBucket.expiresAt - now) / 1000),
        }),
      );
      return;
    }

    currentBucket.count += 1;
    next();
  };
}

// *************** EXPORT MODULE ***************
module.exports = {
  CreateRateLimitMiddleware,
};
