import rateLimit from "express-rate-limit";

export const aiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per window
  message: { 
    message: "Too many AI requests. Please try again in 15 minutes.",
    retryAfter: 15 
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || req.headers["x-forwarded-for"] as string || "unknown";
  },
});

export const documentParseRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 document parses per window
  message: { 
    message: "Too many document parsing requests. Please try again later.",
    retryAfter: 15 
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || req.headers["x-forwarded-for"] as string || "unknown";
  },
});

export const researchRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 research requests per hour
  message: { 
    message: "Too many research requests. Please try again in an hour.",
    retryAfter: 60 
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    return req.ip || req.headers["x-forwarded-for"] as string || "unknown";
  },
});
