/**
 * Progress Throttling Utility
 * 
 * Provides timestamp-based throttling for progress events to prevent console spam
 * while maintaining responsive user feedback. Follows modern async patterns with
 * configurable intervals optimized for CLI applications.
 */

/**
 * Configuration options for progress throttling
 */
export interface ProgressThrottleOptions {
  intervalMs: number;
  maxBufferSize: number;
  immediate: boolean;
}

/**
 * Default throttling configuration
 * - 200ms interval balances responsiveness with performance
 * - Based on CLI best practices for progress bar updates
 */
export const DEFAULT_THROTTLE_OPTIONS: ProgressThrottleOptions = {
  intervalMs: 200, // 200ms = 5 updates per second (optimal for CLI)
  maxBufferSize: 10,
  immediate: false,
};

/**
 * Progress Throttle Class
 * 
 * Implements timestamp-based throttling with configurable intervals.
 * Prevents excessive console output while maintaining smooth progress feedback.
 */
export class ProgressThrottle {
  private lastUpdate = 0;
  private intervalMs: number;
  private maxBufferSize: number;
  private bufferedUpdates: Array<{ timestamp: number; data: any }> = [];

  constructor(intervalMs: number = DEFAULT_THROTTLE_OPTIONS.intervalMs) {
    this.intervalMs = intervalMs;
    this.maxBufferSize = DEFAULT_THROTTLE_OPTIONS.maxBufferSize;
  }

  /**
   * Check if an update should be processed based on throttling rules
   * 
   * @param immediate - Force immediate update regardless of throttling
   * @returns Promise<boolean> - true if update should be processed
   */
  async shouldUpdate(immediate: boolean = false): Promise<boolean> {
    const now = Date.now();
    
    // Always allow immediate updates or if enough time has passed
    if (immediate || (now - this.lastUpdate) >= this.intervalMs) {
      this.lastUpdate = now;
      return true;
    }
    
    return false;
  }

  /**
   * Check if update should be processed and update timestamp
   * 
   * @param data - Optional data to buffer if not processed immediately
   * @param immediate - Force immediate processing
   * @returns boolean - true if should process now
   */
  shouldProcess(data?: any, immediate: boolean = false): boolean {
    const now = Date.now();
    
    if (immediate || (now - this.lastUpdate) >= this.intervalMs) {
      this.lastUpdate = now;
      this.flushBuffer(); // Clear any buffered updates
      return true;
    }
    
    // Buffer the update if provided
    if (data !== undefined) {
      this.bufferUpdate(data, now);
    }
    
    return false;
  }

  /**
   * Buffer an update for later processing
   */
  private bufferUpdate(data: any, timestamp: number): void {
    this.bufferedUpdates.push({ timestamp, data });
    
    // Limit buffer size to prevent memory issues
    if (this.bufferedUpdates.length > this.maxBufferSize) {
      this.bufferedUpdates.shift(); // Remove oldest buffered update
    }
  }

  /**
   * Get all buffered updates and clear the buffer
   */
  flushBuffer(): Array<{ timestamp: number; data: any }> {
    const buffered = [...this.bufferedUpdates];
    this.bufferedUpdates = [];
    return buffered;
  }

  /**
   * Get the time until next update is allowed
   */
  getTimeUntilNextUpdate(): number {
    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastUpdate;
    return Math.max(0, this.intervalMs - timeSinceLastUpdate);
  }

  /**
   * Reset throttling state
   */
  reset(): void {
    this.lastUpdate = 0;
    this.bufferedUpdates = [];
  }

  /**
   * Get throttling statistics
   */
  getStats(): {
    intervalMs: number;
    lastUpdate: number;
    bufferedCount: number;
    timeUntilNext: number;
  } {
    return {
      intervalMs: this.intervalMs,
      lastUpdate: this.lastUpdate,
      bufferedCount: this.bufferedUpdates.length,
      timeUntilNext: this.getTimeUntilNextUpdate(),
    };
  }
}

/**
 * Create a progress throttle instance with specified interval
 */
export function createProgressThrottle(intervalMs: number = DEFAULT_THROTTLE_OPTIONS.intervalMs): ProgressThrottle {
  return new ProgressThrottle(intervalMs);
}

/**
 * Async throttle function for use with progress callbacks
 * 
 * @param fn - Function to throttle
 * @param intervalMs - Throttling interval in milliseconds
 * @returns Throttled function
 */
export function throttleAsync<T extends (...args: any[]) => any>(
  fn: T,
  intervalMs: number = DEFAULT_THROTTLE_OPTIONS.intervalMs
): (...args: Parameters<T>) => Promise<ReturnType<T> | undefined> {
  const throttle = new ProgressThrottle(intervalMs);
  
  return async (...args: Parameters<T>): Promise<ReturnType<T> | undefined> => {
    if (await throttle.shouldUpdate()) {
      return await fn(...args);
    }
    return undefined;
  };
}

/**
 * Synchronous throttle function for immediate use cases
 */
export function throttleSync<T extends (...args: any[]) => any>(
  fn: T,
  intervalMs: number = DEFAULT_THROTTLE_OPTIONS.intervalMs
): (...args: Parameters<T>) => ReturnType<T> | undefined {
  const throttle = new ProgressThrottle(intervalMs);
  
  return (...args: Parameters<T>): ReturnType<T> | undefined => {
    if (throttle.shouldProcess()) {
      return fn(...args);
    }
    return undefined;
  };
}

/**
 * Specialized throttle for progress events with percentage tracking
 */
export class ProgressPercentageThrottle extends ProgressThrottle {
  private lastPercentage = -1;
  private percentageThreshold: number;

  constructor(intervalMs: number = 200, percentageThreshold: number = 5) {
    super(intervalMs);
    this.percentageThreshold = percentageThreshold;
  }

  /**
   * Check if progress update should be processed based on time and percentage change
   */
  shouldUpdateProgress(percentage: number, immediate: boolean = false): boolean {
    const percentageChanged = Math.abs(percentage - this.lastPercentage) >= this.percentageThreshold;
    const shouldUpdate = this.shouldProcess(percentage, immediate);
    
    if (shouldUpdate || percentageChanged) {
      this.lastPercentage = percentage;
      return true;
    }
    
    return false;
  }

  /**
   * Reset percentage tracking
   */
  override reset(): void {
    super.reset();
    this.lastPercentage = -1;
  }
}

/**
 * Export default throttle instance for common use
 */
export const defaultProgressThrottle = new ProgressThrottle();