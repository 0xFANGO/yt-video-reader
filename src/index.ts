import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter, createTRPCContext } from './api/index.js';
import { createFileDownloadHandler, createFilePreviewHandler } from './api/files.js';
import { createSSEHandler, createTaskSSEHandler, startTaskMonitoring } from './api/events.js';
import { queueConfig } from './utils/queue-config.js';
import { validateEnvironment } from './utils/validation.js';
import { youTubeDownloader } from './services/youtube-downloader.js';
// Orchestrator removed - using simplified flow structure
import { processDownloadJobs } from './workers/download-worker.js';
import { processAudioJobs } from './workers/audio-stage-worker.js';
import { processSummarizationJobs } from './workers/summarize-worker.js';
// Legacy imports for backward compatibility
import { processVideoJob } from './workers/video-processor.js';
import { processDownloadJob } from './workers/download-worker.js';
import { processTranscriptionJob } from './workers/transcribe-worker.js';
import { processSummarizationJob } from './workers/summarize-worker.js';
import { fileManager } from './utils/file-manager.js';

/**
 * Main application server
 */
class VideoProcessorServer {
  private app: express.Application;
  private port: number;
  private workers: any[] = [];

  constructor() {
    this.app = express();
    this.port = parseInt(process.env.PORT || '3000');
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "ws:", "wss:"],
        },
      },
    }));

    // CORS middleware
    this.app.use(cors({
      origin: process.env.NODE_ENV === 'production' 
        ? process.env.ALLOWED_ORIGINS?.split(',') || []
        : true,
      credentials: true,
    }));

    // JSON parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      const start = Date.now();
      
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(
          `${req.method} ${req.originalUrl} - ${res.statusCode} (${duration}ms)`
        );
      });
      
      next();
    });
  }

  /**
   * Setup routes
   */
  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uptime: process.uptime(),
      });
    });

    // tRPC middleware
    this.app.use(
      '/trpc',
      createExpressMiddleware({
        router: appRouter,
        createContext: createTRPCContext,
        onError: ({ path, error }) => {
          console.error(`tRPC error on ${path}:`, error);
        },
      })
    );

    // File download routes
    this.app.get('/api/files/download/:taskId/:filename', createFileDownloadHandler());
    this.app.get('/api/files/preview/:taskId/:filename', createFilePreviewHandler());

    // SSE routes
    this.app.get('/api/events/stream', createSSEHandler());
    this.app.get('/api/events/task/:taskId/stream', createTaskSSEHandler());

    // Static file serving (for frontend if needed)
    this.app.use(express.static('public'));

    // API documentation route
    this.app.get('/api/docs', (req, res) => {
      res.json({
        name: 'YouTube Video Processor API',
        version: '1.0.0',
        description: 'AI-powered YouTube video processing system',
        endpoints: {
          tRPC: '/trpc',
          files: '/api/files',
          events: '/api/events',
          health: '/health',
        },
        features: [
          'YouTube video downloading',
          'Audio extraction and processing',
          'Voice separation with Demucs',
          'Whisper.cpp transcription',
          'AI-powered summarization',
          'Real-time progress tracking',
        ],
        documentation: 'https://github.com/your-repo/docs',
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not found',
        message: `Route ${req.method} ${req.originalUrl} not found`,
        timestamp: new Date().toISOString(),
      });
    });

    // Error handler
    this.app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      console.error('Express error:', err);
      
      res.status(500).json({
        error: 'Internal server error',
        message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
        timestamp: new Date().toISOString(),
      });
    });
  }

  /**
   * Initialize services
   */
  private async initializeServices(): Promise<void> {
    console.log('Initializing services...');

    try {
      // Initialize YouTube downloader
      await youTubeDownloader.initialize();
      console.log('✓ YouTube downloader initialized');

      // Test Redis connection
      const redisHealthy = await queueConfig.testConnection();
      if (!redisHealthy) {
        throw new Error('Redis connection failed');
      }
      console.log('✓ Redis connection established');

      // Test whisper.cpp installation
      const { whisperCLI } = await import('./utils/whisper-cli.js');
      const whisperValidation = await whisperCLI.validateInstallation();
      if (!whisperValidation.isValid) {
        console.error('Whisper validation errors:', whisperValidation.errors);
        throw new Error('Whisper.cpp installation is invalid');
      }
      console.log('✓ Whisper.cpp installation validated');

      // Initialize file manager
      const storageStats = await fileManager.getStorageStats();
      console.log(`✓ File manager initialized (${storageStats.totalTasks} existing tasks)`);

      console.log('All services initialized successfully');
    } catch (error) {
      console.error('Failed to initialize services:', error);
      throw error;
    }
  }

  /**
   * Start BullMQ workers
   */
  private async startWorkers(): Promise<void> {
    console.log('Starting BullMQ workers...');

    try {
      // Flow-based workers for concurrent processing (no orchestrator needed)

      // Download worker (flow-integrated)
      const downloadWorker = queueConfig.createDownloadWorker(processDownloadJobs);
      this.workers.push(downloadWorker);
      console.log('✓ Download worker started (concurrent: 3)');

      // Audio processing worker (combines extraction + transcription)
      const audioWorker = queueConfig.createAudioProcessingWorker(processAudioJobs);
      this.workers.push(audioWorker);
      console.log('✓ Audio processing worker started (concurrent: 2)');

      // Summarization worker (flow-integrated)
      const summarizationWorker = queueConfig.createSummarizationWorker(processSummarizationJobs);
      this.workers.push(summarizationWorker);
      console.log('✓ Summarization worker started (concurrent: 1)');
      
      // Legacy workers for backward compatibility
      const legacyVideoWorker = queueConfig.createVideoProcessingWorker(processVideoJob);
      this.workers.push(legacyVideoWorker);
      console.log('✓ Legacy video processing worker started (DEPRECATED)');

      const legacyTranscriptionWorker = queueConfig.createTranscriptionWorker(processTranscriptionJob);
      this.workers.push(legacyTranscriptionWorker);
      console.log('✓ Legacy transcription worker started (DEPRECATED)');

      // Start task monitoring for SSE
      await startTaskMonitoring();
      console.log('✓ Task monitoring started');

      console.log(`All workers started successfully (${this.workers.length} workers - flow-based + legacy)`);
    } catch (error) {
      console.error('Failed to start workers:', error);
      throw error;
    }
  }

  /**
   * Start periodic cleanup
   */
  private startPeriodicCleanup(): void {
    console.log('Starting periodic cleanup...');

    const cleanupInterval = parseInt(process.env.CLEANUP_INTERVAL_HOURS || '24');
    
    setInterval(async () => {
      try {
        console.log('Starting periodic cleanup...');
        await fileManager.cleanupOldTasks(cleanupInterval);
        console.log('Periodic cleanup completed');
      } catch (error) {
        console.error('Periodic cleanup failed:', error);
      }
    }, cleanupInterval * 60 * 60 * 1000); // Convert hours to milliseconds

    console.log(`✓ Periodic cleanup scheduled (every ${cleanupInterval} hours)`);
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    try {
      // Validate environment
      console.log('Validating environment...');
      const envValidation = validateEnvironment();
      if (!envValidation.isValid) {
        console.error('Environment validation failed:');
        envValidation.errors.forEach(error => console.error(`- ${error}`));
        process.exit(1);
      }
      console.log('✓ Environment validated');

      // Initialize services
      await this.initializeServices();

      // Start workers
      await this.startWorkers();

      // Start periodic cleanup
      this.startPeriodicCleanup();

      // Start Express server
      this.app.listen(this.port, () => {
        console.log(`
🚀 YouTube Video Processor Server Started!

📍 Server running on: http://localhost:${this.port}
📊 Health check: http://localhost:${this.port}/health
🔧 API documentation: http://localhost:${this.port}/api/docs
📡 tRPC endpoint: http://localhost:${this.port}/trpc
📁 File downloads: http://localhost:${this.port}/api/files/download
📨 SSE events: http://localhost:${this.port}/api/events/stream

🔧 Environment: ${process.env.NODE_ENV || 'development'}
📦 Node.js: ${process.version}
🧠 Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB
⚡ Workers: ${this.workers.length} active

Ready to process YouTube videos! 🎬✨
        `);
      });
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down server...');

    try {
      // Close all workers
      await Promise.all(this.workers.map(worker => worker.close()));
      console.log('✓ All workers closed');

      // Close Redis connection
      await queueConfig.close();
      console.log('✓ Redis connection closed');

      console.log('Server shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  }
}

// Create server instance
const server = new VideoProcessorServer();

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nReceived SIGINT, shutting down gracefully...');
  server.shutdown();
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM, shutting down gracefully...');
  server.shutdown();
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the server
server.start().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});