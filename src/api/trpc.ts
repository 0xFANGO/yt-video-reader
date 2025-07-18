import { initTRPC } from '@trpc/server';
import { z } from 'zod';
import { createApiError } from '../types/api.js';

/**
 * Create tRPC instance
 */
const t = initTRPC.create({
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError: error.cause instanceof z.ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Create router
 */
export const router = t.router;

/**
 * Create procedure
 */
export const publicProcedure = t.procedure;

/**
 * Create middleware
 */
export const middleware = t.middleware;

/**
 * Logging middleware
 */
export const loggingMiddleware = middleware(async ({ path, type, next }) => {
  const start = Date.now();
  
  console.log(`[${type}] ${path} - Start`);
  
  const result = await next();
  
  const duration = Date.now() - start;
  
  if (result.ok) {
    console.log(`[${type}] ${path} - Success (${duration}ms)`);
  } else {
    console.log(`[${type}] ${path} - Error (${duration}ms):`, result.error.message);
  }
  
  return result;
});

/**
 * Rate limiting middleware
 */
export const rateLimitMiddleware = middleware(async ({ next }) => {
  // Simple rate limiting - in production, use Redis or similar
  // For now, just pass through
  return next();
});

/**
 * Protected procedure with logging
 */
export const protectedProcedure = publicProcedure.use(loggingMiddleware);

/**
 * Utility to create standardized error responses
 */
export function createTRPCError(message: string, code: string = 'INTERNAL_SERVER_ERROR') {
  const errorResponse = createApiError(message, code);
  throw new Error(JSON.stringify(errorResponse));
}

/**
 * Utility to handle async operations with proper error handling
 */
export async function handleAsyncOperation<T>(
  operation: () => Promise<T>,
  errorMessage: string = 'Operation failed'
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    console.error(`${errorMessage}:`, error);
    throw new Error(
      error instanceof Error ? error.message : String(error)
    );
  }
}