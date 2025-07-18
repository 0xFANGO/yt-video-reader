import { Queue, Worker, ConnectionOptions } from 'bullmq';
import IORedis from 'ioredis';

/**
 * Queue configuration and management
 */
export class QueueConfig {
  private redisConnection: IORedis;
  private connectionOptions: ConnectionOptions;

  constructor(redisUrl: string = process.env.REDIS_URL || 'redis://localhost:6379') {
    this.redisConnection = new IORedis(redisUrl, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      connectionName: 'yt-video-processor',
    });

    this.connectionOptions = {
      host: this.redisConnection.options.host || 'localhost',
      port: this.redisConnection.options.port || 6379,
      db: this.redisConnection.options.db || 0,
      ...(this.redisConnection.options.password && { password: this.redisConnection.options.password }),
    };
  }

  /**
   * Create video processing queue
   */
  createVideoQueue(): Queue {
    return new Queue('video-processing', {
      connection: this.redisConnection,
      defaultJobOptions: {
        removeOnComplete: 10,
        removeOnFail: 50,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
      },
    });
  }

  /**
   * Create download queue
   */
  createDownloadQueue(): Queue {
    return new Queue('download', {
      connection: this.redisConnection,
      defaultJobOptions: {
        removeOnComplete: 5,
        removeOnFail: 20,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      },
    });
  }

  /**
   * Create transcription queue
   */
  createTranscriptionQueue(): Queue {
    return new Queue('transcription', {
      connection: this.redisConnection,
      defaultJobOptions: {
        removeOnComplete: 5,
        removeOnFail: 20,
        attempts: 2,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      },
    });
  }

  /**
   * Create summarization queue
   */
  createSummarizationQueue(): Queue {
    return new Queue('summarization', {
      connection: this.redisConnection,
      defaultJobOptions: {
        removeOnComplete: 5,
        removeOnFail: 20,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 3000,
        },
      },
    });
  }

  /**
   * Create download worker
   */
  createDownloadWorker(processor: any): Worker {
    return new Worker('download', processor, {
      connection: this.redisConnection,
      concurrency: parseInt(process.env.DOWNLOAD_CONCURRENCY || '3'),
      limiter: {
        max: 5,
        duration: 1000,
      },
    });
  }

  /**
   * Create transcription worker
   */
  createTranscriptionWorker(processor: any): Worker {
    return new Worker('transcription', processor, {
      connection: this.redisConnection,
      concurrency: parseInt(process.env.TRANSCRIPTION_CONCURRENCY || '2'),
      limiter: {
        max: 2,
        duration: 5000,
      },
    });
  }

  /**
   * Create summarization worker
   */
  createSummarizationWorker(processor: any): Worker {
    return new Worker('summarization', processor, {
      connection: this.redisConnection,
      concurrency: 1,
      limiter: {
        max: 10,
        duration: 60000, // OpenAI rate limiting
      },
    });
  }

  /**
   * Create video processing worker
   */
  createVideoProcessingWorker(processor: any): Worker {
    return new Worker('video-processing', processor, {
      connection: this.redisConnection,
      concurrency: 1,
    });
  }

  /**
   * Test Redis connection
   */
  async testConnection(): Promise<boolean> {
    try {
      const pong = await this.redisConnection.ping();
      return pong === 'PONG';
    } catch (error) {
      console.error('Redis connection test failed:', error);
      return false;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(queueName: string): Promise<{
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  }> {
    try {
      const queue = new Queue(queueName, { connection: this.redisConnection });
      
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaiting(),
        queue.getActive(),
        queue.getCompleted(),
        queue.getFailed(),
        queue.getDelayed(),
      ]);

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
      };
    } catch (error) {
      console.error(`Failed to get queue stats for ${queueName}:`, error);
      return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
      };
    }
  }

  /**
   * Clear all queues
   */
  async clearAllQueues(): Promise<void> {
    const queueNames = ['video-processing', 'download', 'transcription', 'summarization'];
    
    for (const queueName of queueNames) {
      try {
        const queue = new Queue(queueName, { connection: this.redisConnection });
        await queue.obliterate({ force: true });
        console.log(`Cleared queue: ${queueName}`);
      } catch (error) {
        console.error(`Failed to clear queue ${queueName}:`, error);
      }
    }
  }

  /**
   * Get Redis connection
   */
  getRedisConnection(): IORedis {
    return this.redisConnection;
  }

  /**
   * Get connection options
   */
  getConnectionOptions(): ConnectionOptions {
    return this.connectionOptions;
  }

  /**
   * Close Redis connection
   */
  async close(): Promise<void> {
    await this.redisConnection.disconnect();
  }
}

/**
 * Default queue configuration instance
 */
export const queueConfig = new QueueConfig();

/**
 * Queue names constants
 */
export const QUEUE_NAMES = {
  VIDEO_PROCESSING: 'video-processing',
  DOWNLOAD: 'download',
  TRANSCRIPTION: 'transcription',
  SUMMARIZATION: 'summarization',
} as const;

/**
 * Job priorities
 */
export const JOB_PRIORITIES = {
  LOW: 1,
  NORMAL: 5,
  HIGH: 10,
  URGENT: 20,
} as const;

/**
 * Default job options
 */
export const DEFAULT_JOB_OPTIONS = {
  removeOnComplete: 10,
  removeOnFail: 50,
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 2000,
  },
};