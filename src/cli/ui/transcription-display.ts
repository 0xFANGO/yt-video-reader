import chalk from 'chalk';
import logSymbols from 'log-symbols';
import { SSEClient, createTaskSSEClient } from '../utils/sse-client.js';
import { CLITRPCClient } from '../client.js';
import { colors } from '../utils/formatters.js';

/**
 * Transcription segment for real-time display
 */
export interface TranscriptionSegment {
  id: number;
  text: string;
  startTime: number;
  endTime?: number | undefined;
  confidence?: number | undefined;
  isPartial: boolean;
  timestamp: string;
}

/**
 * Transcription stream event types
 */
export interface TranscriptionStreamEvent {
  type: 'segment-start' | 'segment-text' | 'segment-complete';
  segmentId: number;
  text: string;
  startTime: number;
  endTime?: number | undefined;
  confidence?: number | undefined;
  isPartial: boolean;
}

/**
 * Display configuration for transcription
 */
export interface TranscriptionDisplayConfig {
  maxVisibleLines: number;
  showTimestamps: boolean;
  showConfidence: boolean;
  enableExpandCollapse: boolean;
  autoExpand: boolean;
  highlightPartial: boolean;
}

/**
 * Default transcription display configuration
 */
export const DEFAULT_TRANSCRIPTION_CONFIG: TranscriptionDisplayConfig = {
  maxVisibleLines: 5,
  showTimestamps: true,
  showConfidence: false,
  enableExpandCollapse: true,
  autoExpand: false,
  highlightPartial: true,
};

/**
 * Real-time transcription display component
 */
export class TranscriptionDisplay {
  private taskId: string;
  private client: CLITRPCClient;
  private sseClient: SSEClient | null = null;
  private config: TranscriptionDisplayConfig;
  private segments: TranscriptionSegment[] = [];
  private isExpanded = false;
  private isActive = false;
  private scrollPosition = 0;
  private currentSegmentId = 0;

  constructor(
    taskId: string,
    client: CLITRPCClient,
    config?: Partial<TranscriptionDisplayConfig>
  ) {
    this.taskId = taskId;
    this.client = client;
    this.config = { ...DEFAULT_TRANSCRIPTION_CONFIG, ...config };
  }

  /**
   * Start real-time transcription display
   */
  async start(): Promise<void> {
    if (this.isActive) {
      return;
    }

    this.isActive = true;
    
    try {
      // Setup SSE client for real-time text streaming
      await this.setupSSEClient();

      // Display initial header
      this.displayHeader();

      // Show initial empty state
      this.render();

    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Stop transcription display and cleanup
   */
  stop(): void {
    this.isActive = false;

    if (this.sseClient) {
      this.sseClient.disconnect();
      this.sseClient = null;
    }

    // Show final summary
    this.displaySummary();
  }

  /**
   * Toggle expand/collapse state
   */
  toggle(): void {
    if (!this.config.enableExpandCollapse) return;
    
    this.isExpanded = !this.isExpanded;
    this.render();
  }

  /**
   * Expand transcription display
   */
  expand(): void {
    if (!this.config.enableExpandCollapse) return;
    
    this.isExpanded = true;
    this.render();
  }

  /**
   * Collapse transcription display
   */
  collapse(): void {
    if (!this.config.enableExpandCollapse) return;
    
    this.isExpanded = false;
    this.scrollPosition = Math.max(0, this.segments.length - this.config.maxVisibleLines);
    this.render();
  }

  /**
   * Scroll up in transcription content
   */
  scrollUp(): void {
    if (this.scrollPosition > 0) {
      this.scrollPosition--;
      this.render();
    }
  }

  /**
   * Scroll down in transcription content
   */
  scrollDown(): void {
    const maxScroll = Math.max(0, this.segments.length - this.getVisibleLineCount());
    if (this.scrollPosition < maxScroll) {
      this.scrollPosition++;
      this.render();
    }
  }

  /**
   * Get current content for external access
   */
  getContent(): string[] {
    return this.segments.map(segment => this.formatSegment(segment));
  }

  /**
   * Get segment count
   */
  getSegmentCount(): number {
    return this.segments.length;
  }

  /**
   * Get expansion state
   */
  get isExpandedState(): boolean {
    return this.isExpanded;
  }

  /**
   * Setup SSE client for real-time updates
   */
  private async setupSSEClient(): Promise<void> {
    this.sseClient = createTaskSSEClient(this.taskId);

    this.sseClient.on('connected', () => {
      console.log(`${logSymbols.success} ${colors.success('Connected to transcription stream')}`);
    });

    this.sseClient.on('text-stream', (data) => {
      this.handleTextStreamUpdate(data);
    });

    this.sseClient.on('segment-start', (data) => {
      this.handleSegmentStart(data);
    });

    this.sseClient.on('segment-text', (data) => {
      this.handleSegmentText(data);
    });

    this.sseClient.on('segment-complete', (data) => {
      this.handleSegmentComplete(data);
    });

    this.sseClient.on('error', (error) => {
      this.handleSSEError(error);
    });

    this.sseClient.on('reconnecting', (attempt, delay) => {
      console.log(`${colors.warning('⚠')} Reconnecting to transcription stream (attempt ${attempt})...`);
    });
  }

  /**
   * Handle text stream update (generic)
   */
  handleTextStreamUpdate(data: any): void {
    if (!this.isActive) return;

    const segment: TranscriptionStreamEvent = data.data || data;
    
    switch (segment.type) {
      case 'segment-start':
        this.handleSegmentStart(segment);
        break;
      case 'segment-text':
        this.handleSegmentText(segment);
        break;
      case 'segment-complete':
        this.handleSegmentComplete(segment);
        break;
    }
  }

  /**
   * Handle new segment start
   */
  private handleSegmentStart(segment: TranscriptionStreamEvent): void {
    this.currentSegmentId = segment.segmentId;
    
    const newSegment: TranscriptionSegment = {
      id: segment.segmentId,
      text: '',
      startTime: segment.startTime,
      confidence: segment.confidence ?? undefined,
      isPartial: true,
      timestamp: new Date().toISOString(),
    };

    this.segments.push(newSegment);
    this.autoScrollIfNeeded();
    this.render();
  }

  /**
   * Handle segment text update (partial)
   */
  private handleSegmentText(segment: TranscriptionStreamEvent): void {
    const existingSegment = this.segments.find(s => s.id === segment.segmentId);
    
    if (existingSegment) {
      existingSegment.text = segment.text;
      existingSegment.confidence = segment.confidence ?? undefined;
      existingSegment.isPartial = segment.isPartial;
    } else {
      // Create new segment if not found
      this.handleSegmentStart(segment);
      return;
    }

    this.render();
  }

  /**
   * Handle segment completion
   */
  private handleSegmentComplete(segment: TranscriptionStreamEvent): void {
    const existingSegment = this.segments.find(s => s.id === segment.segmentId);
    
    if (existingSegment) {
      existingSegment.text = segment.text;
      existingSegment.endTime = segment.endTime ?? undefined;
      existingSegment.confidence = segment.confidence ?? undefined;
      existingSegment.isPartial = false;
    }

    this.render();
  }

  /**
   * Auto-scroll to show new content
   */
  private autoScrollIfNeeded(): void {
    if (!this.isExpanded && this.segments.length > this.config.maxVisibleLines) {
      this.scrollPosition = this.segments.length - this.config.maxVisibleLines;
    }
  }

  /**
   * Display header
   */
  private displayHeader(): void {
    console.log('\n' + colors.bold('📝 Real-time Transcription'));
    console.log(colors.dim('Press SPACE to expand/collapse, ↑/↓ to scroll'));
    console.log(colors.dim('─'.repeat(50)));
  }

  /**
   * Render transcription content
   */
  private render(): void {
    if (!process.stdout.isTTY) {
      // Simple output for non-TTY environments
      this.renderSimple();
      return;
    }

    // Clear previous content (move cursor up and clear lines)
    const linesToClear = this.getVisibleLineCount() + 2; // +2 for status lines
    for (let i = 0; i < linesToClear; i++) {
      process.stdout.write('\x1b[1A\x1b[2K'); // Move up and clear line
    }

    // Render visible segments
    const visibleSegments = this.getVisibleSegments();
    
    if (visibleSegments.length === 0) {
      console.log(colors.dim('Waiting for transcription...'));
    } else {
      visibleSegments.forEach(segment => {
        console.log(this.formatSegment(segment));
      });
    }

    // Render status line
    this.renderStatusLine();
  }

  /**
   * Render simple output for non-TTY
   */
  private renderSimple(): void {
    const lastSegment = this.segments[this.segments.length - 1];
    if (lastSegment && lastSegment.text.trim()) {
      console.log(`${colors.primary('▶')} ${this.formatSegment(lastSegment)}`);
    }
  }

  /**
   * Get visible segments based on current state
   */
  private getVisibleSegments(): TranscriptionSegment[] {
    if (this.isExpanded) {
      return this.segments.slice(this.scrollPosition);
    } else {
      const start = Math.max(0, this.segments.length - this.config.maxVisibleLines);
      return this.segments.slice(start);
    }
  }

  /**
   * Get visible line count
   */
  private getVisibleLineCount(): number {
    if (this.isExpanded) {
      return Math.min(process.stdout.rows - 8, this.segments.length - this.scrollPosition);
    } else {
      return Math.min(this.config.maxVisibleLines, this.segments.length);
    }
  }

  /**
   * Format transcription segment for display
   */
  private formatSegment(segment: TranscriptionSegment): string {
    const parts: string[] = [];

    // Timestamp (if enabled)
    if (this.config.showTimestamps) {
      const timeStr = this.formatTime(segment.startTime);
      parts.push(colors.dim(`[${timeStr}]`));
    }

    // Text with highlighting for partial segments
    let text = segment.text.trim();
    if (segment.isPartial && this.config.highlightPartial) {
      text = colors.warning(text);
    } else {
      text = colors.primary(text);
    }
    parts.push(text);

    // Confidence (if enabled and available)
    if (this.config.showConfidence && segment.confidence !== undefined) {
      const confidenceStr = `${Math.round(segment.confidence * 100)}%`;
      parts.push(colors.dim(`(${confidenceStr})`));
    }

    // Partial indicator
    if (segment.isPartial) {
      parts.push(colors.dim('...'));
    }

    return parts.join(' ');
  }

  /**
   * Render status line
   */
  private renderStatusLine(): void {
    const totalSegments = this.segments.length;
    const visibleCount = this.getVisibleSegments().length;
    
    let statusParts: string[] = [];

    if (this.config.enableExpandCollapse) {
      const expandText = this.isExpanded ? 'EXPANDED' : 'COLLAPSED';
      statusParts.push(colors.secondary(expandText));
    }

    if (totalSegments > this.config.maxVisibleLines) {
      statusParts.push(colors.dim(`${visibleCount}/${totalSegments} segments`));
    }

    if (this.isExpanded && this.scrollPosition > 0) {
      statusParts.push(colors.dim(`↑ ${this.scrollPosition} hidden above`));
    }

    const hiddenBelow = totalSegments - (this.scrollPosition + visibleCount);
    if (hiddenBelow > 0) {
      statusParts.push(colors.dim(`↓ ${hiddenBelow} more...`));
    }

    if (statusParts.length > 0) {
      console.log(colors.dim('─'.repeat(30)));
      console.log(statusParts.join(' | '));
    }
  }

  /**
   * Display final summary
   */
  private displaySummary(): void {
    console.log('\n' + colors.bold('📝 Transcription Summary'));
    console.log(colors.dim(`Total segments: ${this.segments.length}`));
    
    const totalWords = this.segments.reduce((count, segment) => {
      return count + segment.text.split(/\s+/).filter(word => word.length > 0).length;
    }, 0);
    
    console.log(colors.dim(`Total words: ${totalWords}`));
    
    if (this.segments.length > 0) {
      const firstSegment = this.segments[0];
      const lastSegment = this.segments[this.segments.length - 1];
      if (firstSegment && lastSegment) {
        const duration = (lastSegment.endTime || lastSegment.startTime) - firstSegment.startTime;
        console.log(colors.dim(`Duration: ${this.formatTime(duration)}`));
      }
    }

    console.log(colors.dim('─'.repeat(50)) + '\n');
  }

  /**
   * Format time in MM:SS format
   */
  private formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Handle errors
   */
  private handleError(error: any): void {
    console.error(`${logSymbols.error} ${colors.error('Transcription display error:')}`);
    console.error(colors.dim(error instanceof Error ? error.message : String(error)));
    this.stop();
  }

  /**
   * Handle SSE errors
   */
  private handleSSEError(error: any): void {
    console.log(`${colors.warning('⚠')} Real-time transcription unavailable, showing final result only...`);
  }
}

/**
 * Create and start transcription display
 */
export async function createTranscriptionDisplay(
  taskId: string,
  client: CLITRPCClient,
  config?: Partial<TranscriptionDisplayConfig>
): Promise<TranscriptionDisplay> {
  const display = new TranscriptionDisplay(taskId, client, config);
  await display.start();
  return display;
}

/**
 * Simple transcription update for non-interactive environments
 */
export function displaySimpleTranscription(text: string, timestamp?: number): void {
  const timeStr = timestamp ? `[${new Date(timestamp * 1000).toISOString().substr(14, 8)}]` : '';
  console.log(`${colors.primary('📝')} ${colors.dim(timeStr)} ${text}`);
}