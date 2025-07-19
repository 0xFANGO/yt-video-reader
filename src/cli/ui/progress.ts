import * as cliProgress from 'cli-progress';
import chalk from 'chalk';
import logSymbols from 'log-symbols';
import { SSEClient, createTaskSSEClient } from '../utils/sse-client.js';
import { CLITRPCClient } from '../client.js';
import { TaskStatus } from '../../types/task.js';
import { formatDuration, formatTimestamp, colors } from '../utils/formatters.js';
import { TranscriptionDisplay, createTranscriptionDisplay } from './transcription-display.js';

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
  private transcriptionDisplay: TranscriptionDisplay | null = null;
  private isStuckProgressDetected = false;
  private lastProgressUpdate = Date.now();
  private currentTranscriptionText = '';
  private lastTranscriptionUpdate = Date.now();
  private queuePollingInterval: NodeJS.Timeout | null = null;

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
    this.cleanupAndStop();
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

    this.sseClient.on('connected', async () => {
      if (this.config.enableAnimations) {
        console.log(`${logSymbols.success} ${colors.success('Connected to real-time updates')}`);
      }
      
      // Immediately sync with current task status when connected
      await this.updateTaskStatus();
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

    this.sseClient.on('text-stream', (data) => {
      this.handleTextStreamUpdate(data);
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

    const { stage, progress, eta, step } = data.data || data;
    this.lastProgressUpdate = Date.now();
    this.isStuckProgressDetected = false;

    if (stage && typeof stage === 'string' && this.progressBars.has(stage)) {
      const bar = this.progressBars.get(stage)!;
      bar.update(Math.min(100, Math.max(0, progress)), {
        eta: eta ? formatDuration(eta) : '--',
        speed: this.calculateSpeed(progress),
        step: step || '',
      });
    }

    // Initialize simple transcription display when transcribing starts
    if (stage === 'transcribing') {
      // Simple mode - we handle transcription in handleTextStreamUpdate
    }

    // Update compact mode display
    if (!this.multibar && this.config.compact && stage) {
      this.displayCompactProgress(stage, progress, step);
    }

    // Detect stuck progress
    this.detectStuckProgress(stage, progress);
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

    // Update stage progress based on status
    if (manifest.status && manifest.progress !== undefined) {
      this.updateStageProgress(manifest.status, manifest.progress);
    }

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

    // Display any remaining transcription text
    if (this.currentTranscriptionText.trim()) {
      this.displayCurrentTranscription();
    }

    // Stop transcription display
    if (this.transcriptionDisplay) {
      this.transcriptionDisplay.stop();
      this.transcriptionDisplay = null;
    }

    // Stop progress monitoring with proper cleanup
    setTimeout(() => {
      this.cleanupAndStop();
      this.displayCompletionSummary(result, totalDuration);
    }, 1500); // Give more time for final updates
  }

  /**
   * Handle text stream updates for transcription
   */
  private handleTextStreamUpdate(data: any): void {
    if (!this.isActive) return;

    const segment = data.data || data;
    if (segment && segment.text && segment.text.trim()) {
      const now = Date.now();
      const cleanText = segment.text.trim();
      
      // Accumulate text with space if needed
      if (this.currentTranscriptionText && !this.currentTranscriptionText.endsWith(' ') && !cleanText.startsWith(' ')) {
        this.currentTranscriptionText += ' ';
      }
      this.currentTranscriptionText += cleanText;
      
      // Show updates when we have enough text or after time delay
      if (now - this.lastTranscriptionUpdate > 1000 || 
          this.currentTranscriptionText.length > 20 ||
          cleanText.includes('。') || cleanText.includes('？') || cleanText.includes('！') || 
          cleanText.includes('.') || cleanText.includes('?') || cleanText.includes('!')) {
        this.displayCurrentTranscription();
        this.lastTranscriptionUpdate = now;
      }
    }
  }

  /**
   * Display current transcription text in a clean format
   */
  private displayCurrentTranscription(): void {
    if (this.currentTranscriptionText.trim()) {
      // Clear previous line and show new transcription
      process.stdout.write('\r\x1b[K'); // Clear current line
      process.stdout.write(`📝 ${colors.dim('正在转录:')} ${colors.primary(this.currentTranscriptionText)}\n`);
      
      // Reset text buffer after displaying
      this.currentTranscriptionText = '';
    }
  }

  /**
   * Initialize transcription display
   */
  private async initializeTranscriptionDisplay(): Promise<void> {
    try {
      if (!this.transcriptionDisplay) {
        this.transcriptionDisplay = await createTranscriptionDisplay(
          this.taskId,
          this.client,
          {
            maxVisibleLines: 4,
            showTimestamps: true,
            enableExpandCollapse: true,
            autoExpand: false,
          }
        );
      }
    } catch (error) {
      console.warn('Failed to initialize transcription display:', error);
    }
  }

  /**
   * Detect stuck progress and provide recovery
   */
  private detectStuckProgress(stage: string, progress: number): void {
    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastProgressUpdate;
    
    // Consider progress stuck if no updates for 30 seconds during active stages
    if (timeSinceLastUpdate > 30000 && ['transcribing', 'summarizing'].includes(stage)) {
      if (!this.isStuckProgressDetected) {
        this.isStuckProgressDetected = true;
        console.log(`${colors.warning('⚠')} Progress appears stuck at ${progress}% - this is normal for large files`);
        
        // Attempt recovery by polling task status
        this.attemptProgressRecovery();
      }
    }
  }

  /**
   * Attempt to recover from stuck progress
   */
  private async attemptProgressRecovery(): Promise<void> {
    try {
      await this.updateTaskStatus();
      console.log(`${colors.info('ℹ')} Refreshed task status`);
    } catch (error) {
      console.warn('Failed to recover progress status:', error);
    }
  }

  /**
   * Enhanced cleanup and stop
   */
  private cleanupAndStop(): void {
    this.isActive = false;

    // Stop transcription display
    if (this.transcriptionDisplay) {
      this.transcriptionDisplay.stop();
      this.transcriptionDisplay = null;
    }

    // Clear queue polling
    if (this.queuePollingInterval) {
      clearInterval(this.queuePollingInterval);
      this.queuePollingInterval = null;
    }

    // Disconnect SSE client
    if (this.sseClient) {
      this.sseClient.disconnect();
      this.sseClient = null;
    }

    // Stop and clear progress bars properly
    if (this.multibar) {
      try {
        this.multibar.stop();
        // Clear any remaining display artifacts
        process.stdout.write('\n');
      } catch (error) {
        // Ignore cleanup errors
      }
      this.multibar = null;
    }

    this.progressBars.clear();
  }

  /**
   * Update task status from API
   */
  private async updateTaskStatus(): Promise<void> {
    try {
      const status = await this.client.tasks.getStatus.query({ taskId: this.taskId });
      this.taskStatus = status.status as TaskStatus;
      this.currentStage = status.currentStep;

      // Show queue status if task is still pending
      if (status.status === 'pending') {
        if (this.config.enableAnimations) {
          this.displayStatusChange('pending', 'Waiting in queue for processing to begin...');
        }
        // Start polling for when task begins
        this.startQueuePolling();
      } else {
        // Initial progress update for active tasks
        this.updateStageProgress(status.status as TaskStatus, status.progress);
      }
    } catch (error) {
      // Silently fail for polling fallback - don't spam the console
      if (this.config.enableAnimations) {
        console.warn(colors.warning('Failed to get initial task status'));
      }
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
  private displayCompactProgress(stage: string, progress: number, step?: string): void {
    
    const percentage = Math.round(progress);
    const stageName = PROCESSING_STAGES.find(s => s.id === stage)?.name || stage;
    const stepText = step ? ` - ${colors.dim(step)}` : '';
    console.log(`${colors.primary('▶')} ${stageName}: ${colors.secondary(`${percentage}%`)}${stepText}`);
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
    // Only show message once
    if (this.config.enableAnimations && !this.isStuckProgressDetected) {
      console.log(`${colors.warning('⚠')} Real-time updates unavailable, falling back to polling...`);
      this.isStuckProgressDetected = true; // Reuse this flag to prevent spam
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
    }, 5000); // Poll every 5 seconds
  }

  /**
   * Start queue polling for pending tasks
   */
  private startQueuePolling(): void {
    if (this.queuePollingInterval) return; // Already polling

    this.queuePollingInterval = setInterval(async () => {
      if (!this.isActive) {
        if (this.queuePollingInterval) {
          clearInterval(this.queuePollingInterval);
          this.queuePollingInterval = null;
        }
        return;
      }

      try {
        const status = await this.client.tasks.getStatus.query({ taskId: this.taskId });
        if (status.status !== 'pending') {
          // Task has started, stop queue polling
          if (this.queuePollingInterval) {
            clearInterval(this.queuePollingInterval);
            this.queuePollingInterval = null;
          }
          // Trigger status update
          this.handleStatusUpdate({ data: status });
        }
      } catch (error) {
        // Ignore polling errors
      }
    }, 2000); // Poll every 2 seconds for queue status
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