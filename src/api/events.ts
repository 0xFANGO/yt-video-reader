import { z } from 'zod';
import { router, protectedProcedure, handleAsyncOperation } from './trpc.js';
import { SSEMessageSchema } from '../types/api.js';
import { fileManager } from '../utils/file-manager.js';
import { Request, Response } from 'express';
import { queueConfig } from '../utils/queue-config.js';

/**
 * SSE connection management
 */
class SSEConnectionManager {
  private connections: Map<string, Response> = new Map();
  private taskSubscriptions: Map<string, Set<string>> = new Map();
  private eventBuffer: Map<string, any[]> = new Map(); // Buffer events for rapid updates
  private lastEventTime: Map<string, number> = new Map();
  private readonly BUFFER_WINDOW_MS = 100; // Buffer events for 100ms
  private readonly MAX_BUFFER_SIZE = 50;

  /**
   * Add SSE connection
   */
  addConnection(connectionId: string, response: Response): void {
    this.connections.set(connectionId, response);
    
    // Send initial connection message
    this.sendMessage(connectionId, {
      type: 'connected',
      data: { connectionId, timestamp: new Date().toISOString() },
    });

    console.log(`SSE connection added: ${connectionId}`);
  }

  /**
   * Remove SSE connection
   */
  removeConnection(connectionId: string): void {
    this.connections.delete(connectionId);
    
    // Remove from all task subscriptions
    for (const [taskId, subscribers] of this.taskSubscriptions.entries()) {
      subscribers.delete(connectionId);
      if (subscribers.size === 0) {
        this.taskSubscriptions.delete(taskId);
        // Clean up buffers for tasks with no subscribers
        this.eventBuffer.delete(taskId);
        this.lastEventTime.delete(taskId);
      }
    }

    console.log(`SSE connection removed: ${connectionId}`);
  }

  /**
   * Subscribe connection to task updates
   */
  subscribeToTask(connectionId: string, taskId: string): void {
    if (!this.taskSubscriptions.has(taskId)) {
      this.taskSubscriptions.set(taskId, new Set());
    }
    
    this.taskSubscriptions.get(taskId)!.add(connectionId);
    
    // Send subscription confirmation
    this.sendMessage(connectionId, {
      type: 'subscribed',
      data: { taskId, timestamp: new Date().toISOString() },
    });

    console.log(`Connection ${connectionId} subscribed to task ${taskId}`);
  }

  /**
   * Unsubscribe connection from task updates
   */
  unsubscribeFromTask(connectionId: string, taskId: string): void {
    const subscribers = this.taskSubscriptions.get(taskId);
    if (subscribers) {
      subscribers.delete(connectionId);
      if (subscribers.size === 0) {
        this.taskSubscriptions.delete(taskId);
      }
    }

    // Send unsubscription confirmation
    this.sendMessage(connectionId, {
      type: 'unsubscribed',
      data: { taskId, timestamp: new Date().toISOString() },
    });

    console.log(`Connection ${connectionId} unsubscribed from task ${taskId}`);
  }

  /**
   * Broadcast message to all subscribers of a task
   */
  broadcastToTask(taskId: string, message: any): void {
    const subscribers = this.taskSubscriptions.get(taskId);
    if (!subscribers) return;

    // Send all events immediately for real-time display
    for (const connectionId of subscribers) {
      this.sendMessage(connectionId, message);
    }
  }

  /**
   * Buffer text stream events to reduce rapid updates
   */
  private bufferTextStreamEvent(taskId: string, message: any): void {
    const now = Date.now();
    const lastEventTime = this.lastEventTime.get(taskId) || 0;
    
    // Initialize buffer if needed
    if (!this.eventBuffer.has(taskId)) {
      this.eventBuffer.set(taskId, []);
    }
    
    const buffer = this.eventBuffer.get(taskId)!;
    buffer.push(message);
    
    // Limit buffer size
    if (buffer.length > this.MAX_BUFFER_SIZE) {
      buffer.shift(); // Remove oldest event
    }
    
    // If enough time has passed or buffer is getting full, flush it
    if (now - lastEventTime > this.BUFFER_WINDOW_MS || buffer.length >= this.MAX_BUFFER_SIZE) {
      this.flushTextStreamBuffer(taskId);
    }
  }

  /**
   * Flush buffered text stream events
   */
  private flushTextStreamBuffer(taskId: string): void {
    const buffer = this.eventBuffer.get(taskId);
    if (!buffer || buffer.length === 0) return;
    
    const subscribers = this.taskSubscriptions.get(taskId);
    if (!subscribers) return;
    
    // Send all buffered events
    for (const connectionId of subscribers) {
      for (const message of buffer) {
        this.sendMessage(connectionId, message);
      }
    }
    
    // Clear buffer and update last event time
    this.eventBuffer.set(taskId, []);
    this.lastEventTime.set(taskId, Date.now());
  }

  /**
   * Send message to specific connection
   */
  sendMessage(connectionId: string, message: any): void {
    const response = this.connections.get(connectionId);
    if (!response) return;

    try {
      const sseMessage = {
        type: message.type || 'message',
        taskId: message.taskId || '',
        data: message.data || message,
        timestamp: new Date().toISOString(),
      };

      response.write(`data: ${JSON.stringify(sseMessage)}\n\n`);
    } catch (error) {
      console.error(`Failed to send SSE message to ${connectionId}:`, error);
      this.removeConnection(connectionId);
    }
  }

  /**
   * Send heartbeat to all connections
   */
  sendHeartbeat(): void {
    const heartbeatMessage = {
      type: 'heartbeat',
      data: { timestamp: new Date().toISOString() },
    };

    for (const connectionId of this.connections.keys()) {
      this.sendMessage(connectionId, heartbeatMessage);
    }
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    totalConnections: number;
    activeSubscriptions: number;
    taskSubscriptions: Record<string, number>;
  } {
    const taskSubscriptions: Record<string, number> = {};
    for (const [taskId, subscribers] of this.taskSubscriptions.entries()) {
      taskSubscriptions[taskId] = subscribers.size;
    }

    return {
      totalConnections: this.connections.size,
      activeSubscriptions: this.taskSubscriptions.size,
      taskSubscriptions,
    };
  }

  /**
   * Flush all pending text stream buffers
   */
  flushAllBuffers(): void {
    for (const taskId of this.eventBuffer.keys()) {
      this.flushTextStreamBuffer(taskId);
    }
  }
}

// Global SSE connection manager
const sseManager = new SSEConnectionManager();

// Start heartbeat interval
setInterval(() => {
  sseManager.sendHeartbeat();
}, 30000); // Every 30 seconds

// Start buffer flush interval
setInterval(() => {
  sseManager.flushAllBuffers();
}, 500); // Flush buffers every 500ms

/**
 * Events router for SSE management
 */
export const eventsRouter = router({
  /**
   * Get SSE connection statistics
   */
  getStats: protectedProcedure
    .query(async () => {
      return handleAsyncOperation(async () => {
        return sseManager.getStats();
      }, 'Failed to get SSE statistics');
    }),

  /**
   * Send test message to task subscribers
   */
  sendTestMessage: protectedProcedure
    .input(z.object({
      taskId: z.string(),
      message: z.string(),
    }))
    .mutation(async ({ input }) => {
      return handleAsyncOperation(async () => {
        const { taskId, message } = input;

        sseManager.broadcastToTask(taskId, {
          type: 'test',
          taskId,
          data: { message, timestamp: new Date().toISOString() },
        });

        return {
          success: true,
          message: 'Test message sent to subscribers',
        };
      }, 'Failed to send test message');
    }),

  /**
   * Get active subscriptions for a task
   */
  getTaskSubscriptions: protectedProcedure
    .input(z.object({
      taskId: z.string(),
    }))
    .query(async ({ input }) => {
      return handleAsyncOperation(async () => {
        const { taskId } = input;
        const stats = sseManager.getStats();

        return {
          taskId,
          subscriberCount: stats.taskSubscriptions[taskId] || 0,
        };
      }, 'Failed to get task subscriptions');
    }),
});

/**
 * Express middleware for SSE connections
 */
export function createSSEHandler() {
  return (req: Request, res: Response) => {
    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    // Generate connection ID
    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Add connection to manager
    sseManager.addConnection(connectionId, res);

    // Handle connection close
    req.on('close', () => {
      sseManager.removeConnection(connectionId);
    });

    req.on('end', () => {
      sseManager.removeConnection(connectionId);
    });

    // Keep connection alive
    const keepAlive = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 15000); // Every 15 seconds

    req.on('close', () => {
      clearInterval(keepAlive);
    });
    
    // SSE connection is kept alive until client disconnects
    return;
  };
}

/**
 * Express middleware for task-specific SSE connections
 */
export function createTaskSSEHandler() {
  return (req: Request, res: Response) => {
    const { taskId } = req.params;

    if (!taskId) {
      return res.status(400).json({ error: 'Task ID is required' });
    }

    // Check if task exists
    if (!fileManager.taskDirectoryExists(taskId)) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    });

    // Generate connection ID
    const connectionId = `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Add connection and subscribe to task
    sseManager.addConnection(connectionId, res);
    sseManager.subscribeToTask(connectionId, taskId);

    // Send initial task status
    fileManager.loadManifest(taskId).then(manifest => {
      if (manifest) {
        sseManager.sendMessage(connectionId, {
          type: 'status',
          taskId,
          data: manifest,
        });
      }
    }).catch(error => {
      console.error('Failed to load initial task status:', error);
    });

    // Handle connection close
    req.on('close', () => {
      sseManager.removeConnection(connectionId);
    });

    req.on('end', () => {
      sseManager.removeConnection(connectionId);
    });

    // Keep connection alive
    const keepAlive = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 15000); // Every 15 seconds

    req.on('close', () => {
      clearInterval(keepAlive);
    });
    
    // SSE connection is kept alive until client disconnects
    return;
  };
}

/**
 * Function to broadcast task updates (to be called from workers)
 */
export function broadcastTaskUpdate(taskId: string, update: {
  type: 'progress' | 'status' | 'error' | 'complete' | 'text-stream' | 'flow-start' | 'stage-complete' | 'stage-failed' | 'status-change';
  data: any;
}): void {
  sseManager.broadcastToTask(taskId, {
    type: update.type,
    taskId,
    data: update.data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Monitor task progress and broadcast updates
 */
export async function startTaskMonitoring(): Promise<void> {
  console.log('Starting task monitoring for SSE broadcasts...');

  // This would be more sophisticated in a real implementation
  // For now, we'll poll for task updates periodically
  setInterval(async () => {
    try {
      const stats = sseManager.getStats();
      
      // Only check tasks that have active subscriptions
      for (const taskId of Object.keys(stats.taskSubscriptions)) {
        const manifest = await fileManager.loadManifest(taskId);
        if (manifest) {
          broadcastTaskUpdate(taskId, {
            type: 'status',
            data: manifest,
          });
        }
      }
    } catch (error) {
      console.error('Task monitoring error:', error);
    }
  }, 5000); // Check every 5 seconds
}

/**
 * Export SSE manager for use in other modules
 */
export { sseManager };