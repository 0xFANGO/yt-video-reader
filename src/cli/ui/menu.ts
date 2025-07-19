import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import logSymbols from 'log-symbols';

/**
 * Menu option types
 */
export type MenuOption = 'process-video' | 'view-tasks' | 'browse-files' | 'settings' | 'exit';

/**
 * Main menu choices
 */
const MENU_CHOICES = [
  {
    name: `${chalk.cyan('🎬')} Process YouTube Video`,
    value: 'process-video' as const,
    description: 'Download, transcribe, and summarize a YouTube video',
  },
  {
    name: `${chalk.blue('📋')} View Tasks`,
    value: 'view-tasks' as const,
    description: 'Monitor active and completed processing tasks',
  },
  {
    name: `${chalk.green('📁')} Browse Files`,
    value: 'browse-files' as const,
    description: 'Browse and download generated transcripts and summaries',
  },
  {
    name: `${chalk.yellow('⚙️')} Settings`,
    value: 'settings' as const,
    description: 'Configure CLI preferences and processing options',
  },
  {
    name: `${chalk.red('🚪')} Exit`,
    value: 'exit' as const,
    description: 'Exit the CLI application',
  },
];

/**
 * Display welcome banner
 */
export function displayWelcomeBanner(): void {
  const banner = `
${chalk.bold.cyan('═══════════════════════════════════════════════════════')}
${chalk.bold.cyan('   🎥  YOUTUBE VIDEO PROCESSOR CLI  🎥')}
${chalk.bold.cyan('═══════════════════════════════════════════════════════')}
${chalk.dim('   AI-powered video transcription and summarization')}
${chalk.dim('   Process YouTube videos with Whisper.cpp & GPT-4')}
${chalk.bold.cyan('═══════════════════════════════════════════════════════')}
`;

  console.log(banner);
}

/**
 * Display connection status
 */
export function displayConnectionStatus(isConnected: boolean, serverInfo?: any): void {
  if (isConnected) {
    console.log(`${logSymbols.success} ${chalk.green('Connected to server')}`);
    
    if (serverInfo?.system) {
      console.log(`${chalk.dim('   Server:')} ${serverInfo.system.name} v${serverInfo.system.version}`);
      console.log(`${chalk.dim('   Status:')} ${chalk.green('Healthy')}`);
    }
  } else {
    console.log(`${logSymbols.error} ${chalk.red('Cannot connect to server')}`);
    console.log(`${chalk.dim('   Make sure the server is running:')} ${chalk.cyan('npm run dev')}`);
  }
  
  console.log(); // Empty line for spacing
}

/**
 * Show main menu and get user selection
 */
export async function showMainMenu(): Promise<MenuOption> {
  try {
    const choice = await select({
      message: 'What would you like to do?',
      choices: MENU_CHOICES,
      pageSize: 10,
      loop: false,
    });

    return choice;
  } catch (error) {
    // Handle Ctrl+C or ESC
    if (error instanceof Error && error.message.includes('User force closed')) {
      return 'exit';
    }
    throw error;
  }
}

/**
 * Display processing summary
 */
export function displayProcessingSummary(taskId: string, status: string): void {
  const statusIcon = status === 'completed' ? logSymbols.success : 
                    status === 'failed' ? logSymbols.error :
                    status === 'pending' ? logSymbols.info : '⏳';

  console.log(`
${chalk.bold('Processing Summary:')}
${chalk.dim('Task ID:')} ${chalk.cyan(taskId)}
${chalk.dim('Status:')} ${statusIcon} ${getStatusColor(status)(status)}
`);
}

/**
 * Get appropriate color for status
 */
function getStatusColor(status: string) {
  switch (status) {
    case 'completed':
      return chalk.green;
    case 'failed':
      return chalk.red;
    case 'pending':
    case 'downloading':
    case 'extracting':
    case 'separating':
    case 'transcribing':
    case 'summarizing':
      return chalk.yellow;
    default:
      return chalk.dim;
  }
}

/**
 * Display error message with proper formatting
 */
export function displayError(message: string, details?: string): void {
  console.log(`${logSymbols.error} ${chalk.red('Error:')} ${message}`);
  
  if (details) {
    console.log(`${chalk.dim('Details:')} ${details}`);
  }
  
  console.log(); // Empty line for spacing
}

/**
 * Display success message with proper formatting
 */
export function displaySuccess(message: string, details?: string): void {
  console.log(`${logSymbols.success} ${chalk.green('Success:')} ${message}`);
  
  if (details) {
    console.log(`${chalk.dim('Details:')} ${details}`);
  }
  
  console.log(); // Empty line for spacing
}

/**
 * Display info message with proper formatting
 */
export function displayInfo(message: string, details?: string): void {
  console.log(`${logSymbols.info} ${chalk.blue('Info:')} ${message}`);
  
  if (details) {
    console.log(`${chalk.dim('Details:')} ${details}`);
  }
  
  console.log(); // Empty line for spacing
}

/**
 * Display warning message with proper formatting
 */
export function displayWarning(message: string, details?: string): void {
  console.log(`${logSymbols.warning} ${chalk.yellow('Warning:')} ${message}`);
  
  if (details) {
    console.log(`${chalk.dim('Details:')} ${details}`);
  }
  
  console.log(); // Empty line for spacing
}

/**
 * Clear console and show header
 */
export function clearAndShowHeader(): void {
  console.clear();
  displayWelcomeBanner();
}

/**
 * Show loading indicator
 */
export function showLoading(message: string): void {
  process.stdout.write(`${chalk.dim('⏳')} ${message}...`);
}

/**
 * Hide loading indicator
 */
export function hideLoading(): void {
  process.stdout.write('\r\x1b[K'); // Clear the line
}

/**
 * Display separator line
 */
export function displaySeparator(): void {
  console.log(chalk.dim('─'.repeat(55)));
}