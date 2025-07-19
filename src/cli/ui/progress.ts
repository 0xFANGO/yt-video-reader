import * as cliProgress from 'cli-progress';
import chalk from 'chalk';
import logSymbols from 'log-symbols';
import { SSEClient, createTaskSSEClient } from '../utils/sse-client.js';
import { CLITRPCClient } from '../client.js';
import { TaskStatus } from '../../types/task.js';
import { formatDuration, formatTimestamp, colors } from '../utils/formatters.js';

/**
 * Processing stage definitions
 */
export interface ProcessingStage {
  id: string;
  name: string;
  description: string;
  estimatedDuration: number; // in seconds
}

/**
 * Default processing stages
 */
export const PROCESSING_STAGES: ProcessingStage[] = [
  {
    id: 'downloading',
    name: 'Download',
    description: 'Downloading video from YouTube',
    estimatedDuration: 30,
  },
  {
    id: 'extracting',
    name: 'Extract',
    description: 'Extracting audio from video',
    estimatedDuration: 15,
  },
  {
    id: 'separating',
    name: 'Separate',
    description: 'Separating vocals from music',
    estimatedDuration: 45,
  },
  {
    id: 'transcribing',
    name: 'Transcribe',
    description: 'Transcribing audio with Whisper',
    estimatedDuration: 60,
  },
  {
    id: 'summarizing',
    name: 'Summarize',
    description: 'Generating AI summary',
    estimatedDuration: 20,
  },
];

/**
 * Progress bar configuration
 */
export interface ProgressConfig {
  showETA: boolean;
  showSpeed: boolean;
  showPercentage: boolean;
  enableAnimations: boolean;
  compact: boolean;
}

/**
 * Default progress configuration
 */
export const DEFAULT_PROGRESS_CONFIG: ProgressConfig = {
  showETA: true,
  showSpeed: true,
  showPercentage: true,
  enableAnimations: true,
  compact: false,
};

/**
 * Task progress monitor
 */
export class TaskProgressMonitor {
  private taskId: string;
  private client: CLITRPCClient;
  public sseClient: SSEClient | null = null;
  private multibar: cliProgress.MultiBar | null = null;
  private progressBars: Map<string, cliProgress.SingleBar> = new Map();
  private config: ProgressConfig;
  private startTime: Date = new Date();
  private isActive = false;
  private currentStage: string = '';
  private taskStatus: TaskStatus = 'pending';

  constructor(taskId: string, client: CLITRPCClient, config?: Partial<ProgressConfig>) {
    this.taskId = taskId;
    this.client = client;
    this.config = { ...DEFAULT_PROGRESS_CONFIG, ...config };
  }

  /**
   * Start monitoring task progress
   */
  async start(): Promise<void> {
    if (this.isActive) {
      return;
    }

    this.isActive = true;
    this.startTime = new Date();

    try {
      // Initialize progress bars
      this.initializeProgressBars();

      // Setup SSE client for real-time updates
      await this.setupSSEClient();

      // Get initial task status
      await this.updateTaskStatus();

      console.log(colors.info(`🎬 Monitoring task: ${colors.primary(this.taskId)}`));
      console.log(colors.dim(`Started at: ${formatTimestamp(this.startTime)}`));
      console.log(); // Empty line for spacing

    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Stop monitoring and cleanup
   */
  stop(): void {
    this.isActive = false;

    if (this.sseClient) {
      this.sseClient.disconnect();
      this.sseClient = null;
    }

    if (this.multibar) {
      this.multibar.stop();
      this.multibar = null;
    }

    this.progressBars.clear();
  }

  /**
   * Initialize progress bars for each stage
   */
  private initializeProgressBars(): void {
    if (!process.stdout.isTTY || this.config.compact) {
      // Don't create progress bars if not in TTY or compact mode
      return;
    }

    this.multibar = new cliProgress.MultiBar({
      clearOnComplete: false,
      hideCursor: true,
      format: this.getProgressBarFormat(),
      barCompleteChar: '█',
      barIncompleteChar: '░',
      barsize: 25,
    });

    // Create progress bars for each stage
    for (const stage of PROCESSING_STAGES) {
      const bar = this.multibar.create(100, 0, {
        stage: stage.name,
        description: stage.description,
        eta: '--',
        speed: '--',
      });

      this.progressBars.set(stage.id, bar);
    }
  }

  /**
   * Setup SSE client for real-time updates
   */
  private async setupSSEClient(): Promise<void> {
    this.sseClient = createTaskSSEClient(this.taskId);

    this.sseClient.on('connected', () => {
      if (this.config.enableAnimations) {
        console.log(`${logSymbols.success} ${colors.success('Connected to real-time updates')}`);
      }
    });

    this.sseClient.on('progress', (data) => {
      this.handleProgressUpdate(data);
    });

    this.sseClient.on('status', (data) => {
      this.handleStatusUpdate(data);
    });

    this.sseClient.on('complete', (data) => {
      this.handleTaskComplete(data);
    });

    this.sseClient.on('error', (error) => {
      this.handleSSEError(error);
    });

    this.sseClient.on('reconnecting', (attempt, delay) => {
      if (this.config.enableAnimations) {
        console.log(`${colors.warning('⚠')} Reconnecting to server (attempt ${attempt})...`);
      }
    });
  }

  /**
   * Handle progress update from SSE
   */
  private handleProgressUpdate(data: any): void {
    if (!this.isActive) return;

    const { stage, progress, eta } = data.data || data;

    if (stage && typeof stage === 'string' && this.progressBars.has(stage)) {
      const bar = this.progressBars.get(stage)!;
      bar.update(Math.min(100, Math.max(0, progress)), {
        eta: eta ? formatDuration(eta) : '--',
        speed: this.calculateSpeed(progress),
      });
    }

    // Update compact mode display
    if (!this.multibar && this.config.compact && stage) {
      this.displayCompactProgress(stage, progress);
    }
  }

  /**
   * Handle status update from SSE
   */
  private handleStatusUpdate(data: any): void {
    if (!this.isActive) return;

    const manifest = data.data || data;
    this.taskStatus = manifest.status;
    this.currentStage = manifest.currentStep || '';

    // Update active stage highlighting
    this.updateStageHighlighting();

    if (this.config.enableAnimations) {
      this.displayStatusChange(manifest.status, manifest.currentStep);
    }
  }

  /**
   * Handle task completion
   */
  private handleTaskComplete(data: any): void {
    if (!this.isActive) return;

    const result = data.data || data;
    const endTime = new Date();
    const totalDuration = (endTime.getTime() - this.startTime.getTime()) / 1000;

    // Complete all progress bars
    this.progressBars.forEach(bar => bar.update(100));

    // Stop progress monitoring
    setTimeout(() => {
      this.stop();
      this.displayCompletionSummary(result, totalDuration);
    }, 1000);
  }

  /**
   * Update task status from API
   */
  private async updateTaskStatus(): Promise<void> {
    try {
      const status = await this.client.tasks.getStatus.query({ taskId: this.taskId });
      this.taskStatus = status.status as TaskStatus;
      this.currentStage = status.currentStep;

      // Initial progress update
      this.updateStageProgress(status.status as TaskStatus, status.progress);
    } catch (error) {
      console.warn(colors.warning('Failed to get initial task status'));
    }
  }

  /**
   * Update stage progress based on status
   */
  private updateStageProgress(status: TaskStatus, progress: number): void {
    const stageIndex = PROCESSING_STAGES.findIndex(stage => stage.id === status);
    
    if (stageIndex === -1) return;

    // Complete previous stages
    for (let i = 0; i < stageIndex; i++) {
      const stage = PROCESSING_STAGES[i];
      if (stage) {
        const bar = this.progressBars.get(stage.id);
        if (bar) {
          bar.update(100);
        }
      }
    }

    // Update current stage
    const currentStage = PROCESSING_STAGES[stageIndex];
    if (currentStage) {
      const bar = this.progressBars.get(currentStage.id);
      if (bar) {
        bar.update(progress);
      }
    }
  }

  /**
   * Update stage highlighting
   */
  private updateStageHighlighting(): void {
    // This would update visual highlighting of active stage
    // Implementation depends on the specific UI requirements
  }

  /**
   * Display compact progress (for non-TTY environments)
   */
  private displayCompactProgress(stage: string, progress: number): void {
    
    const percentage = Math.round(progress);
    const stageName = PROCESSING_STAGES.find(s => s.id === stage)?.name || stage;
    console.log(`${colors.primary('▶')} ${stageName}: ${colors.secondary(`${percentage}%`)}`);
  }

  /**
   * Display status change notification
   */
  private displayStatusChange(status: string, step: string): void {
    const statusIcon = this.getStatusIcon(status);
    const statusColor = this.getStatusColor(status);
    console.log(`${statusIcon} ${statusColor(status)}: ${colors.dim(step)}`);
  }

  /**
   * Display completion summary
   */
  private displayCompletionSummary(result: any, duration: number): void {
    console.log('\n' + colors.bold('═'.repeat(50)));
    
    if (this.taskStatus === 'completed') {
      console.log(`${logSymbols.success} ${colors.success('Task completed successfully!')}`);
    } else {
      console.log(`${logSymbols.error} ${colors.error('Task failed')}`);
    }

    console.log(colors.dim(`Total time: ${formatDuration(duration)}`));
    
    if (result.files && Object.keys(result.files).length > 0) {
      console.log(colors.dim(`Generated files: ${Object.keys(result.files).length}`));
    }

    console.log(colors.bold('═'.repeat(50)) + '\n');
  }

  /**
   * Get progress bar format
   */
  private getProgressBarFormat(): string {
    const parts = [];
    
    parts.push(colors.primary('{stage}'));
    parts.push('[{bar}]');
    
    if (this.config.showPercentage) {
      parts.push('{percentage}%');
    }
    
    if (this.config.showETA) {
      parts.push('ETA: {eta}');
    }

    return parts.join(' | ');
  }

  /**
   * Calculate processing speed
   */
  private calculateSpeed(progress: number): string {
    const elapsed = (Date.now() - this.startTime.getTime()) / 1000;
    if (elapsed === 0 || progress === 0) return '--';
    
    const speed = progress / elapsed;
    return `${speed.toFixed(1)}%/s`;
  }

  /**
   * Get status icon
   */
  private getStatusIcon(status: string): string {
    const icons: Record<string, string> = {
      pending: logSymbols.info,
      downloading: '⬇️',
      extracting: '🎵',
      separating: '🎤',
      transcribing: '📝',
      summarizing: '🤖',
      completed: logSymbols.success,
      failed: logSymbols.error,
    };
    
    return icons[status] || '⏳';
  }

  /**
   * Get status color
   */
  private getStatusColor(status: string) {
    switch (status) {
      case 'completed':
        return colors.success;
      case 'failed':
        return colors.error;
      case 'pending':
        return colors.info;
      default:
        return colors.warning;
    }
  }

  /**
   * Handle errors
   */
  private handleError(error: any): void {
    console.error(`${logSymbols.error} ${colors.error('Progress monitoring error:')}`);
    console.error(colors.dim(error instanceof Error ? error.message : String(error)));
    this.stop();
  }

  /**
   * Handle SSE errors
   */
  private handleSSEError(error: any): void {
    if (this.config.enableAnimations) {
      console.log(`${colors.warning('⚠')} Real-time updates unavailable, falling back to polling...`);
    }
    
    // Fallback to polling
    this.startPolling();
  }

  /**
   * Start polling for updates (fallback)
   */
  private startPolling(): void {
    const pollInterval = setInterval(async () => {
      if (!this.isActive) {
        clearInterval(pollInterval);
        return;
      }

      try {
        await this.updateTaskStatus();
      } catch (error) {
        // Ignore polling errors
      }
    }, 3000); // Poll every 3 seconds
  }
}

/**
 * Monitor task progress with real-time updates
 */
export async function monitorTaskProgress(
  taskId: string,
  client: CLITRPCClient,
  config?: Partial<ProgressConfig>
): Promise<void> {
  const monitor = new TaskProgressMonitor(taskId, client, config);
  
  try {
    await monitor.start();
    
    // Keep monitoring until task is complete
    return new Promise((resolve, reject) => {
      monitor.sseClient?.on('complete', () => {
        setTimeout(() => resolve(), 2000); // Wait a bit for final updates
      });
      
      monitor.sseClient?.on('error', (error) => {
        if (error.message.includes('Task not found')) {
          reject(new Error('Task not found'));
        }
      });

      // Timeout after 30 minutes
      setTimeout(() => {
        monitor.stop();
        reject(new Error('Task monitoring timeout'));
      }, 30 * 60 * 1000);
    });
  } catch (error) {
    monitor.stop();
    throw error;
  }
}

/**
 * Simple progress display for non-interactive environments
 */
export function displaySimpleProgress(stage: string, progress: number, message?: string): void {
  const percentage = Math.round(Math.max(0, Math.min(100, progress)));
  const stageIcon = PROCESSING_STAGES.find(s => s.id === stage)?.name || stage;
  
  console.log(`${colors.primary('▶')} ${stageIcon}: ${colors.secondary(`${percentage}%`)}${message ? ` - ${colors.dim(message)}` : ''}`);
}