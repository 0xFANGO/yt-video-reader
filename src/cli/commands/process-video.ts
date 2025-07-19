import { input, select, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import logSymbols from 'log-symbols';
import { CLITRPCClient, handleTRPCError } from '../client.js';
import { CLIConfig } from '../utils/config.js';
import { monitorTaskProgress } from '../ui/progress.js';
import { displaySuccess, displayError, displayInfo, showLoading, hideLoading } from '../ui/menu.js';
import { isValidYouTubeUrl } from '../../utils/validation.js';

/**
 * Video processing options
 */
interface ProcessingOptions {
  language?: string;
  priority: 'low' | 'normal' | 'high';
}

/**
 * Available language options
 */
const LANGUAGE_OPTIONS = [
  { name: 'Auto-detect', value: 'auto' },
  { name: 'English', value: 'en' },
  { name: 'Spanish', value: 'es' },
  { name: 'French', value: 'fr' },
  { name: 'German', value: 'de' },
  { name: 'Italian', value: 'it' },
  { name: 'Portuguese', value: 'pt' },
  { name: 'Russian', value: 'ru' },
  { name: 'Japanese', value: 'ja' },
  { name: 'Korean', value: 'ko' },
  { name: 'Chinese (Simplified)', value: 'zh' },
];

/**
 * Priority options
 */
const PRIORITY_OPTIONS = [
  { name: 'Low (slower processing, lower queue priority)', value: 'low' },
  { name: 'Normal (balanced processing)', value: 'normal' },
  { name: 'High (faster processing, higher queue priority)', value: 'high' },
];

/**
 * Process YouTube video command
 */
export async function processVideoCommand(client: CLITRPCClient, config: CLIConfig): Promise<void> {
  try {
    console.log(chalk.bold.cyan('\n🎬 Process YouTube Video\n'));
    
    // Get YouTube URL
    const url = await getYouTubeUrl();
    
    // Get processing options
    const options = await getProcessingOptions(config);
    
    // Confirm processing
    const shouldProceed = await confirmProcessing(url, options);
    if (!shouldProceed) {
      displayInfo('Processing cancelled by user');
      return;
    }

    // Create task
    showLoading('Creating processing task');
    const task = await createTask(client, url, options);
    hideLoading();

    displaySuccess(`Task created successfully!`, `Task ID: ${task.taskId}`);
    
    // Ask if user wants to monitor progress
    const shouldMonitor = await askToMonitorProgress();
    
    if (shouldMonitor) {
      console.log('\n' + chalk.bold('📊 Monitoring Progress\n'));
      
      // Check if task is already in progress or wait for it to start
      console.log(chalk.dim('Waiting for task to start processing...'));
      
      await monitorTaskProgress(task.taskId, client, {
        enableAnimations: true,
        showETA: true,
        showPercentage: true,
      });
      
      // Show completion options
      await showCompletionOptions(client, task.taskId);
    } else {
      displayInfo(`You can check task progress later using: View Tasks > ${task.taskId}`);
    }

  } catch (error) {
    hideLoading();
    const errorMessage = error instanceof Error ? error.message : String(error);
    displayError('Failed to process video', errorMessage);
    
    // Provide helpful suggestions
    if (errorMessage.includes('connect')) {
      console.log(chalk.yellow('\n💡 Suggestion: Make sure the server is running with `npm run dev`'));
    } else if (errorMessage.includes('Invalid YouTube URL')) {
      console.log(chalk.yellow('\n💡 Suggestion: Make sure the URL is a valid YouTube video URL'));
    }
  }
}

/**
 * Get YouTube URL with validation
 */
async function getYouTubeUrl(): Promise<string> {
  return await input({
    message: 'Enter YouTube video URL:',
    validate: (url: string) => {
      if (!url.trim()) {
        return 'URL is required';
      }
      
      if (!isValidYouTubeUrl(url.trim())) {
        return 'Please enter a valid YouTube URL (e.g., https://www.youtube.com/watch?v=...)';
      }
      
      return true;
    },
    transformer: (url: string) => {
      // Show a preview of the URL
      if (url.length > 50) {
        return url.slice(0, 47) + '...';
      }
      return url;
    },
  });
}

/**
 * Get processing options
 */
async function getProcessingOptions(config: CLIConfig): Promise<ProcessingOptions> {
  console.log(chalk.dim('\n⚙️ Processing Options\n'));

  // Language selection
  const language = await select({
    message: 'Select transcription language:',
    choices: LANGUAGE_OPTIONS,
    default: config.defaultLanguage || 'auto',
  });

  // Priority selection
  const priority = await select({
    message: 'Select processing priority:',
    choices: PRIORITY_OPTIONS,
    default: config.defaultPriority || 'normal',
  }) as 'low' | 'normal' | 'high';

  const result: ProcessingOptions = {
    priority,
  };
  
  if (language !== 'auto') {
    result.language = language;
  }
  
  return result;
}

/**
 * Confirm processing with summary
 */
async function confirmProcessing(url: string, options: ProcessingOptions): Promise<boolean> {
  console.log(chalk.dim('\n📋 Processing Summary\n'));
  
  // Display summary
  console.log(`${chalk.cyan('URL:')} ${chalk.dim(url)}`);
  console.log(`${chalk.cyan('Language:')} ${chalk.dim(options.language || 'Auto-detect')}`);
  console.log(`${chalk.cyan('Priority:')} ${chalk.dim(options.priority)}`);
  console.log();

  // Estimate processing time
  const estimatedTime = getEstimatedProcessingTime(options.priority);
  console.log(chalk.yellow(`⏱️ Estimated processing time: ${estimatedTime}`));
  console.log();

  return await confirm({
    message: 'Start processing this video?',
    default: true,
  });
}

/**
 * Create processing task
 */
async function createTask(
  client: CLITRPCClient,
  url: string,
  options: ProcessingOptions
): Promise<{ taskId: string; status: string; message: string }> {
  try {
    const result = await client.tasks.create.mutate({
      link: url,
      options,
    });

    return result;
  } catch (error) {
    const errorMessage = handleTRPCError(error);
    throw new Error(`Failed to create task: ${errorMessage}`);
  }
}

/**
 * Ask if user wants to monitor progress
 */
async function askToMonitorProgress(): Promise<boolean> {
  return await confirm({
    message: 'Would you like to monitor progress in real-time?',
    default: true,
  });
}

/**
 * Show completion options
 */
async function showCompletionOptions(client: CLITRPCClient, taskId: string): Promise<void> {
  try {
    // Get final task status
    const status = await client.tasks.getStatus.query({ taskId });
    
    if (status.status === 'completed') {
      console.log(chalk.bold.green('\n✅ Processing Complete!\n'));
      
      // Show available files
      if (Object.keys(status.files).length > 0) {
        console.log(chalk.bold('📁 Generated Files:'));
        for (const [filename, filepath] of Object.entries(status.files)) {
          console.log(`  ${getFileIcon(filename)} ${chalk.cyan(filename)}`);
        }
        console.log();
      }

      // Ask what to do next
      const nextAction = await select({
        message: 'What would you like to do next?',
        choices: [
          { name: '📁 Browse generated files', value: 'browse' },
          { name: '📋 View task details', value: 'details' },
          { name: '🏠 Return to main menu', value: 'menu' },
          { name: '🚪 Exit CLI', value: 'exit' },
        ],
      });

      switch (nextAction) {
        case 'browse':
          // This would trigger the file browser
          displayInfo('File browser would be opened here');
          break;
        case 'details':
          await showTaskDetails(status);
          break;
        case 'menu':
          return;
        case 'exit':
          process.exit(0);
      }
    } else {
      console.log(chalk.bold.red('\n❌ Processing Failed\n'));
      
      if (status.error) {
        console.log(`${chalk.red('Error:')} ${status.error}`);
      }
      
      // Ask if user wants to retry
      const shouldRetry = await confirm({
        message: 'Would you like to retry this task?',
        default: false,
      });
      
      if (shouldRetry) {
        try {
          await client.tasks.retry.mutate({ taskId });
          displaySuccess('Task queued for retry');
        } catch (error) {
          displayError('Failed to retry task', handleTRPCError(error));
        }
      }
    }
  } catch (error) {
    displayError('Failed to get task status', handleTRPCError(error));
  }
}

/**
 * Show detailed task information
 */
async function showTaskDetails(status: any): Promise<void> {
  console.log(chalk.bold('\n📊 Task Details\n'));
  
  console.log(`${chalk.cyan('Task ID:')} ${status.taskId}`);
  console.log(`${chalk.cyan('Status:')} ${getStatusDisplay(status.status)}`);
  console.log(`${chalk.cyan('Progress:')} ${status.progress}%`);
  console.log(`${chalk.cyan('Created:')} ${new Date(status.createdAt).toLocaleString()}`);
  
  if (status.finishedAt) {
    console.log(`${chalk.cyan('Finished:')} ${new Date(status.finishedAt).toLocaleString()}`);
    
    // Calculate processing time
    const processingTime = new Date(status.finishedAt).getTime() - new Date(status.createdAt).getTime();
    const minutes = Math.floor(processingTime / 60000);
    const seconds = Math.floor((processingTime % 60000) / 1000);
    console.log(`${chalk.cyan('Duration:')} ${minutes}m ${seconds}s`);
  }
  
  if (status.videoTitle) {
    console.log(`${chalk.cyan('Video:')} ${status.videoTitle}`);
  }
  
  if (status.videoDuration) {
    console.log(`${chalk.cyan('Video Length:')} ${formatDuration(status.videoDuration)}`);
  }
  
  console.log();
}

/**
 * Get file icon for display
 */
function getFileIcon(filename: string): string {
  if (filename.endsWith('.mp4')) return '🎥';
  if (filename.endsWith('.wav') || filename.endsWith('.mp3')) return '🎵';
  if (filename.endsWith('.srt')) return '📝';
  if (filename.endsWith('.json')) return '📄';
  if (filename.endsWith('.txt')) return '📋';
  return '📁';
}

/**
 * Get status display with color
 */
function getStatusDisplay(status: string): string {
  const statusColors: Record<string, any> = {
    completed: chalk.green,
    failed: chalk.red,
    pending: chalk.blue,
    downloading: chalk.yellow,
    extracting: chalk.yellow,
    separating: chalk.yellow,
    transcribing: chalk.yellow,
    summarizing: chalk.yellow,
  };
  
  const colorFn = statusColors[status] || chalk.dim;
  const icon = status === 'completed' ? logSymbols.success : 
               status === 'failed' ? logSymbols.error : '⏳';
  
  return `${icon} ${colorFn(status)}`;
}

/**
 * Format duration in human readable format
 */
function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  } else {
    return `${secs}s`;
  }
}

/**
 * Get estimated processing time
 */
function getEstimatedProcessingTime(priority: string): string {
  const baseTime = '2-4 minutes'; // Base estimate for typical video
  
  switch (priority) {
    case 'high':
      return `${baseTime} (faster processing)`;
    case 'low':
      return `${baseTime} (may take longer due to lower priority)`;
    default:
      return baseTime;
  }
}