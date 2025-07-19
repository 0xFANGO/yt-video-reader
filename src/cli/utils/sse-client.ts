import { EventEmitter } from 'events';
import { SSEMessage } from '../../types/api.js';

/**
 * SSE Client configuration
 */
export interface SSEClientConfig {
  baseUrl: string;
  reconnectInterval: number;
  maxReconnectAttempts: number;
  timeout: number;
}

/**
 * Default SSE client configuration
 */
const DEFAULT_SSE_CONFIG: SSEClientConfig = {
  baseUrl: 'http://localhost:3000',
  reconnectInterval: 5000, // 5 seconds
  maxReconnectAttempts: 5, // Reduced attempts
  timeout: 15000, // 15 seconds timeout
};

/**
 * SSE connection state
 */
export type SSEConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error' | 'closed';

/**
 * SSE Client for real-time task updates
 */
export class SSEClient extends EventEmitter {
  private config: SSEClientConfig;
  private abortController: AbortController | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private state: SSEConnectionState = 'disconnected';
  private taskId: string | null = null;

  constructor(config?: Partial<SSEClientConfig>) {
    super();
    this.config = { ...DEFAULT_SSE_CONFIG, ...config };
  }

  /**
   * Connect to SSE stream for a specific task
   */
  async connect(taskId: string): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      return;
    }

    this.taskId = taskId;
    this.setState('connecting');
    
    try {
      await this.createConnection(taskId);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Connect to general SSE stream
   */
  async connectGeneral(): Promise<void> {
    if (this.state === 'connected' || this.state === 'connecting') {
      return;
    }

    this.setState('connecting');
    
    try {
      await this.createConnection();
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Disconnect from SSE stream
   */
  disconnect(): void {
    this.setState('disconnected');
    
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.reconnectAttempts = 0;
    this.taskId = null;
  }

  /**
   * Get current connection state
   */
  getState(): SSEConnectionState {
    return this.state;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === 'connected';
  }

  /**
   * Create SSE connection
   */
  private async createConnection(taskId?: string): Promise<void> {
    this.abortController = new AbortController();
    
    const url = taskId 
      ? `${this.config.baseUrl}/api/events/task/${taskId}/stream`
      : `${this.config.baseUrl}/api/events/stream`;

    try {
      const response = await fetch(url, {
        signal: this.abortController.signal,
        headers: {
          'Accept': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      });

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status} ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body available for SSE stream');
      }

      this.setState('connected');
      this.reconnectAttempts = 0;
      this.emit('connected');

      // Process the SSE stream
      await this.processStream(response.body);
      
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // Connection was intentionally aborted
        this.setState('disconnected');
        return;
      }
      
      throw error;
    }
  }

  /**
   * Process SSE event stream
   */
  private async processStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Keep the last incomplete line in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          this.processSSELine(line);
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return; // Connection was intentionally closed
      }
      throw error;
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Process individual SSE line
   */
  private processSSELine(line: string): void {
    const trimmedLine = line.trim();
    
    if (trimmedLine === '') {
      return; // Empty line, ignore
    }

    if (trimmedLine.startsWith(':')) {
      return; // Comment line, ignore
    }

    if (trimmedLine.startsWith('data: ')) {
      const data = trimmedLine.slice(6); // Remove 'data: ' prefix
      
      try {
        const parsedData = this.parseEventData(data);
        if (parsedData) {
          this.emit('message', parsedData);
          this.emit(parsedData.type, parsedData);
        }
      } catch (error) {
        console.warn('Failed to parse SSE data:', data, error);
      }
    }

    // Handle other SSE fields if needed (event, id, retry)
    if (trimmedLine.startsWith('event: ')) {
      const eventType = trimmedLine.slice(7);
      this.emit('event-type', eventType);
    }
  }

  /**
   * Parse SSE event data
   */
  private parseEventData(data: string): SSEMessage | null {
    if (data === 'keepalive' || data.startsWith(':')) {
      return null; // Ignore keepalive and comment data
    }

    try {
      const parsed = JSON.parse(data);
      
      // Validate the structure matches SSEMessage
      if (typeof parsed === 'object' && parsed.type && parsed.timestamp) {
        return parsed as SSEMessage;
      }
      
      // Fallback for simpler message formats
      return {
        type: 'progress' as const,
        taskId: this.taskId || '',
        data: parsed,
        timestamp: new Date().toISOString(),
      };
      
    } catch (error) {
      console.warn('Failed to parse JSON data:', data);
      return null;
    }
  }

  /**
   * Handle connection errors
   */
  private handleError(error: any): void {
    this.setState('error');
    this.emit('error', error);

    // Attempt reconnection if enabled
    if (this.reconnectAttempts < this.config.maxReconnectAttempts) {
      this.scheduleReconnect();
    } else {
      this.setState('closed');
      this.emit('closed', 'Maximum reconnection attempts reached');
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectInterval * Math.pow(2, this.reconnectAttempts - 1);
    
    this.emit('reconnecting', this.reconnectAttempts, delay);

    this.reconnectTimer = setTimeout(() => {
      if (this.taskId) {
        this.connect(this.taskId);
      } else {
        this.connectGeneral();
      }
    }, delay);
  }

  /**
   * Set connection state and emit event
   */
  private setState(newState: SSEConnectionState): void {
    if (this.state !== newState) {
      const oldState = this.state;
      this.state = newState;
      this.emit('state-change', newState, oldState);
    }
  }
}

/**
 * Create SSE client for task monitoring
 */
export function createTaskSSEClient(taskId: string, config?: Partial<SSEClientConfig>): SSEClient {
  const client = new SSEClient(config);
  
  // Auto-connect to the specific task
  client.connect(taskId).catch(error => {
    console.error('Failed to connect to task SSE stream:', error);
  });

  return client;
}

/**
 * Create general SSE client
 */
export function createGeneralSSEClient(config?: Partial<SSEClientConfig>): SSEClient {
  const client = new SSEClient(config);
  
  // Auto-connect to general stream
  client.connectGeneral().catch(error => {
    console.error('Failed to connect to general SSE stream:', error);
  });

  return client;
}

/**
 * SSE event types for TypeScript
 */
export interface SSEClientEvents {
  connected: () => void;
  disconnected: () => void;
  error: (error: Error) => void;
  closed: (reason: string) => void;
  message: (message: SSEMessage) => void;
  progress: (data: any) => void;
  status: (data: any) => void;
  complete: (data: any) => void;
  'text-stream': (data: any) => void;
  'event-type': (eventType: string) => void;
  'state-change': (newState: SSEConnectionState, oldState: SSEConnectionState) => void;
  reconnecting: (attempt: number, delay: number) => void;
}

/**
 * Typed SSE client
 */
export interface TypedSSEClient extends SSEClient {
  on<K extends keyof SSEClientEvents>(event: K, listener: SSEClientEvents[K]): this;
  emit<K extends keyof SSEClientEvents>(event: K, ...args: Parameters<SSEClientEvents[K]>): boolean;
}