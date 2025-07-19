import chalk from 'chalk';
import logSymbols from 'log-symbols';
import Table, { Table as CliTable3 } from 'cli-table3';
import { TaskStatus } from '../../types/task.js';

/**
 * Color scheme for consistent theming
 */
export const colors = {
  primary: chalk.cyan,
  secondary: chalk.blue,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  info: chalk.blue,
  dim: chalk.dim,
  bold: chalk.bold,
  accent: chalk.magenta,
} as const;

/**
 * Status icons mapping
 */
export const statusIcons = {
  pending: logSymbols.info,
  downloading: '⬇️',
  extracting: '🎵',
  separating: '🎤',
  transcribing: '📝',
  summarizing: '🤖',
  completed: logSymbols.success,
  failed: logSymbols.error,
} as const;

/**
 * Format task status with appropriate color and icon
 */
export function formatTaskStatus(status: TaskStatus): string {
  const icon = statusIcons[status] || '⏳';
  const colorFn = getStatusColor(status);
  return `${icon} ${colorFn(status)}`;
}

/**
 * Get color function for status
 */
export function getStatusColor(status: TaskStatus) {
  switch (status) {
    case 'completed':
      return colors.success;
    case 'failed':
      return colors.error;
    case 'pending':
      return colors.info;
    case 'downloading':
    case 'extracting':
    case 'separating':
    case 'transcribing':
    case 'summarizing':
      return colors.warning;
    default:
      return colors.dim;
  }
}

/**
 * Format file size in human-readable format
 */
export function formatFileSize(bytes: number): string {
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  if (bytes === 0) return '0 B';
  
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = (bytes / Math.pow(1024, i)).toFixed(1);
  
  return `${size} ${sizes[i]}`;
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${Math.round(seconds)}s`;
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  } else {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
}

/**
 * Format timestamp for display
 */
export function formatTimestamp(timestamp: string | Date, showTime = true): string {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  // Show relative time for recent timestamps
  if (diffMinutes < 1) {
    return colors.dim('just now');
  } else if (diffMinutes < 60) {
    return colors.dim(`${diffMinutes}m ago`);
  } else if (diffHours < 24) {
    return colors.dim(`${diffHours}h ago`);
  } else if (diffDays < 7) {
    return colors.dim(`${diffDays}d ago`);
  }

  // Show formatted date for older timestamps
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    ...(showTime && { hour: '2-digit', minute: '2-digit' }),
  };

  if (date.getFullYear() !== now.getFullYear()) {
    options.year = 'numeric';
  }

  return colors.dim(date.toLocaleDateString('en-US', options));
}

/**
 * Format progress percentage
 */
export function formatProgress(progress: number): string {
  const percentage = Math.round(Math.max(0, Math.min(100, progress)));
  
  if (percentage === 100) {
    return colors.success(`${percentage}%`);
  } else if (percentage >= 75) {
    return colors.primary(`${percentage}%`);
  } else if (percentage >= 50) {
    return colors.warning(`${percentage}%`);
  } else {
    return colors.dim(`${percentage}%`);
  }
}

/**
 * Create a formatted table for task list
 */
export function createTaskTable(tasks: Array<{
  taskId: string;
  status: TaskStatus;
  progress: number;
  createdAt: string;
  videoTitle?: string;
}>): CliTable3 {
  const table = new Table({
    head: [
      colors.bold('ID'),
      colors.bold('Title'),
      colors.bold('Status'),
      colors.bold('Progress'),
      colors.bold('Created'),
    ],
    colWidths: [12, 30, 15, 10, 12],
    wordWrap: true,
    style: {
      head: [],
      border: [],
    },
  });

  for (const task of tasks) {
    table.push([
      colors.primary(task.taskId.slice(-8)), // Show last 8 chars
      task.videoTitle ? colors.dim(truncateText(task.videoTitle, 25)) : colors.dim('Unknown'),
      formatTaskStatus(task.status),
      formatProgress(task.progress),
      formatTimestamp(task.createdAt, false),
    ]);
  }

  return table;
}

/**
 * Create a formatted table for file list
 */
export function createFileTable(files: Array<{
  filename: string;
  size: number;
  mimeType: string;
  createdAt: string;
}>): CliTable3 {
  const table = new Table({
    head: [
      colors.bold('File'),
      colors.bold('Type'),
      colors.bold('Size'),
      colors.bold('Created'),
    ],
    colWidths: [25, 15, 10, 12],
    wordWrap: true,
    style: {
      head: [],
      border: [],
    },
  });

  for (const file of files) {
    const fileIcon = getFileIcon(file.filename);
    const fileName = `${fileIcon} ${file.filename}`;
    
    table.push([
      colors.primary(truncateText(fileName, 22)),
      colors.dim(getFileTypeLabel(file.mimeType)),
      colors.secondary(formatFileSize(file.size)),
      formatTimestamp(file.createdAt, false),
    ]);
  }

  return table;
}

/**
 * Get file icon based on filename
 */
export function getFileIcon(filename: string): string {
  if (filename.endsWith('.mp4')) return '🎥';
  if (filename.endsWith('.wav') || filename.endsWith('.mp3')) return '🎵';
  if (filename.endsWith('.srt')) return '📝';
  if (filename.endsWith('.json')) return '📄';
  if (filename.endsWith('.txt')) return '📋';
  return '📁';
}

/**
 * Get human-readable file type label
 */
export function getFileTypeLabel(mimeType: string): string {
  if (mimeType.startsWith('video/')) return 'Video';
  if (mimeType.startsWith('audio/')) return 'Audio';
  if (mimeType.includes('json')) return 'JSON';
  if (mimeType.includes('text')) return 'Text';
  if (mimeType.includes('subtitle')) return 'Subtitle';
  return 'File';
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Format URL for display (hide sensitive parts)
 */
export function formatUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return colors.dim(`${parsed.hostname}${parsed.pathname}`);
  } catch {
    return colors.dim(truncateText(url, 40));
  }
}

/**
 * Create a summary box with border
 */
export function createSummaryBox(title: string, content: string[]): string {
  const maxWidth = Math.max(title.length, ...content.map(line => line.length)) + 4;
  const border = '─'.repeat(maxWidth);
  
  const lines = [
    `┌${border}┐`,
    `│ ${colors.bold(title)}${' '.repeat(maxWidth - title.length - 1)}│`,
    `├${border}┤`,
    ...content.map(line => `│ ${line}${' '.repeat(maxWidth - line.length - 1)}│`),
    `└${border}┘`,
  ];

  return lines.join('\n');
}

/**
 * Format error message with context
 */
export function formatError(message: string, details?: string, suggestion?: string): string {
  let output = `${logSymbols.error} ${colors.error('Error:')} ${message}`;
  
  if (details) {
    output += `\n${colors.dim('Details:')} ${details}`;
  }
  
  if (suggestion) {
    output += `\n${colors.warning('Suggestion:')} ${suggestion}`;
  }
  
  return output;
}

/**
 * Format success message with details
 */
export function formatSuccess(message: string, details?: string): string {
  let output = `${logSymbols.success} ${colors.success('Success:')} ${message}`;
  
  if (details) {
    output += `\n${colors.dim('Details:')} ${details}`;
  }
  
  return output;
}

/**
 * Format warning message
 */
export function formatWarning(message: string, details?: string): string {
  let output = `${logSymbols.warning} ${colors.warning('Warning:')} ${message}`;
  
  if (details) {
    output += `\n${colors.dim('Details:')} ${details}`;
  }
  
  return output;
}

/**
 * Format info message
 */
export function formatInfo(message: string, details?: string): string {
  let output = `${logSymbols.info} ${colors.info('Info:')} ${message}`;
  
  if (details) {
    output += `\n${colors.dim('Details:')} ${details}`;
  }
  
  return output;
}

/**
 * Create a loading spinner text
 */
export function createLoadingText(message: string, frame = 0): string {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  const spinner = frames[frame % frames.length];
  return `${colors.primary(spinner)} ${message}...`;
}

/**
 * Format API response for display
 */
export function formatApiResponse(response: any): string {
  if (response.success === false && response.error) {
    return formatError(response.error.message, response.error.details);
  }
  
  if (response.data) {
    return JSON.stringify(response.data, null, 2);
  }
  
  return JSON.stringify(response, null, 2);
}