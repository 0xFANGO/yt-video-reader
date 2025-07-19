import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import { AppRouter } from '../api/index.js';

/**
 * CLI configuration for tRPC client
 */
export interface CLIClientConfig {
  apiBaseUrl: string;
  timeout?: number;
  retries?: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: CLIClientConfig = {
  apiBaseUrl: 'http://localhost:3000/trpc',
  timeout: 30000, // 30 seconds
  retries: 3,
};

/**
 * Create tRPC client for CLI usage
 */
export function createTRPCClient(config?: Partial<CLIClientConfig>) {
  const clientConfig = { ...DEFAULT_CONFIG, ...config };

  return createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: clientConfig.apiBaseUrl,
        // Add timeout and retry logic
        fetch: async (input, init) => {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), clientConfig.timeout);

          try {
            const response = await fetch(input, {
              ...init,
              signal: controller.signal,
            });
            
            clearTimeout(timeoutId);
            return response;
          } catch (error) {
            clearTimeout(timeoutId);
            throw error;
          }
        },
      }),
    ],
  });
}

/**
 * Test connection to the server
 */
export async function testConnection(client: ReturnType<typeof createTRPCClient>): Promise<{
  isConnected: boolean;
  error?: string;
  serverInfo?: any;
}> {
  try {
    const healthCheck = await client.health.check.query();
    const systemInfo = await client.system.info.query();
    
    return {
      isConnected: true,
      serverInfo: {
        health: healthCheck,
        system: systemInfo,
      },
    };
  } catch (error) {
    return {
      isConnected: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * CLI-specific error handler for tRPC errors
 */
export function handleTRPCError(error: any): string {
  if (error?.message) {
    // Extract meaningful error message
    if (error.message.includes('fetch')) {
      return 'Cannot connect to server. Make sure the server is running on the correct port.';
    }
    
    if (error.message.includes('ECONNREFUSED')) {
      return 'Connection refused. The server appears to be offline.';
    }
    
    if (error.message.includes('timeout')) {
      return 'Request timed out. The server may be overloaded.';
    }
    
    return error.message;
  }
  
  return 'An unknown error occurred while communicating with the server.';
}

/**
 * Default tRPC client instance for CLI usage
 */
export const defaultClient = createTRPCClient();

/**
 * Type definitions for CLI client
 */
export type CLITRPCClient = ReturnType<typeof createTRPCClient>;