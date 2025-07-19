import chalk from 'chalk';
import logSymbols from 'log-symbols';
import { createTRPCClient, testConnection, CLITRPCClient } from './client.js';
import { loadConfig, CLIConfig } from './utils/config.js';
import { 
  displayWelcomeBanner, 
  displayConnectionStatus, 
  showMainMenu, 
  clearAndShowHeader,
  displayError,
  displayInfo,
  MenuOption
} from './ui/menu.js';
import { processVideoCommand } from './commands/process-video.js';
import { viewTasksCommand } from './commands/view-tasks.js';
import { browseFilesCommand } from './commands/browse-files.js';
import { settingsCommand } from './commands/settings.js';

/**
 * CLI Application class
 */
class CLIApplication {
  private client: CLITRPCClient;
  private config: CLIConfig;
  private isRunning = false;

  constructor() {
    this.client = createTRPCClient();
    this.config = {} as CLIConfig; // Will be loaded in initialize()
  }

  /**
   * Initialize the CLI application
   */
  async initialize(): Promise<void> {
    try {
      // Load configuration
      this.config = await loadConfig();
      
      // Create client with config
      this.client = createTRPCClient({
        apiBaseUrl: this.config.apiBaseUrl,
        timeout: this.config.requestTimeout,
        retries: this.config.retryAttempts,
      });

      // Test server connection
      const connectionResult = await testConnection(this.client);
      
      // Display welcome banner and connection status
      displayWelcomeBanner();
      displayConnectionStatus(connectionResult.isConnected, connectionResult.serverInfo);

      if (!connectionResult.isConnected) {
        displayError(
          'Cannot connect to the YouTube Video Processor server',
          connectionResult.error
        );
        
        displayInfo('Please make sure the server is running:');
        console.log(chalk.cyan('  npm run dev\n'));
        
        const shouldContinueOffline = await this.askToContinueOffline();
        if (!shouldContinueOffline) {
          process.exit(1);
        }
      }

    } catch (error) {
      displayError(
        'Failed to initialize CLI application',
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  }

  /**
   * Start the main CLI loop
   */
  async start(): Promise<void> {
    this.isRunning = true;

    try {
      while (this.isRunning) {
        const choice = await showMainMenu();
        await this.handleMenuChoice(choice);
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes('User force closed')) {
        // User pressed Ctrl+C, exit gracefully
        this.displayGoodbye();
        process.exit(0);
      }
      
      displayError(
        'An unexpected error occurred',
        error instanceof Error ? error.message : String(error)
      );
      process.exit(1);
    }
  }

  /**
   * Handle menu choice selection
   */
  private async handleMenuChoice(choice: MenuOption): Promise<void> {
    try {
      switch (choice) {
        case 'process-video':
          await processVideoCommand(this.client, this.config);
          break;

        case 'view-tasks':
          await this.handleViewTasks();
          break;

        case 'browse-files':
          await this.handleBrowseFiles();
          break;

        case 'settings':
          await this.handleSettings();
          break;

        case 'exit':
          this.isRunning = false;
          this.displayGoodbye();
          break;

        default:
          displayError('Invalid menu choice');
      }

      // If not exiting, wait for user input before showing menu again
      if (this.isRunning && choice !== 'exit') {
        await this.waitForContinue();
      }

    } catch (error) {
      displayError(
        'Failed to execute command',
        error instanceof Error ? error.message : String(error)
      );
      await this.waitForContinue();
    }
  }

  /**
   * Handle view tasks command
   */
  private async handleViewTasks(): Promise<void> {
    await viewTasksCommand(this.client);
  }

  /**
   * Handle browse files command
   */
  private async handleBrowseFiles(): Promise<void> {
    await browseFilesCommand(this.client);
  }

  /**
   * Handle settings command
   */
  private async handleSettings(): Promise<void> {
    await settingsCommand();
    // Reload config after settings change
    this.config = await loadConfig();
    this.client = createTRPCClient({
      apiBaseUrl: this.config.apiBaseUrl,
      timeout: this.config.requestTimeout,
      retries: this.config.retryAttempts,
    });
  }

  /**
   * Ask user if they want to continue offline
   */
  private async askToContinueOffline(): Promise<boolean> {
    try {
      const { confirm } = await import('@inquirer/prompts');
      return await confirm({
        message: 'Continue in offline mode? (limited functionality)',
        default: false,
      });
    } catch {
      return false;
    }
  }

  /**
   * Wait for user to press Enter to continue
   */
  private async waitForContinue(): Promise<void> {
    try {
      const { input } = await import('@inquirer/prompts');
      await input({
        message: 'Press Enter to continue...',
        transformer: () => '', // Hide the input
      });
      
      // Clear screen and show header again
      clearAndShowHeader();
    } catch {
      // User pressed Ctrl+C, let it bubble up
      throw new Error('User force closed');
    }
  }

  /**
   * Display goodbye message
   */
  displayGoodbye(): void {
    console.log(`\n${logSymbols.success} ${chalk.green('Thank you for using YouTube Video Processor CLI!')}`);
    console.log(chalk.dim('Have a great day! 👋\n'));
  }

  /**
   * Handle graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.isRunning = false;
    // Any cleanup logic would go here
  }
}

/**
 * Main CLI entry point
 */
export async function main(): Promise<void> {
  const app = new CLIApplication();

  // Setup signal handlers for graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n'); // New line after ^C
    await app.shutdown();
    app.displayGoodbye();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await app.shutdown();
    process.exit(0);
  });

  // Initialize and start the application
  await app.initialize();
  await app.start();
}

/**
 * CLI Error handler
 */
export function handleCLIError(error: unknown): void {
  console.error('\n' + chalk.red('❌ Fatal Error:'));
  
  if (error instanceof Error) {
    console.error(chalk.red(`   ${error.message}`));
    
    // Show stack trace in development
    if (process.env.NODE_ENV === 'development') {
      console.error(chalk.dim('\nStack trace:'));
      console.error(chalk.dim(error.stack));
    }
  } else {
    console.error(chalk.red(`   ${String(error)}`));
  }

  console.error('\n' + chalk.yellow('💡 Troubleshooting tips:'));
  console.error(chalk.yellow('   • Make sure the server is running: npm run dev'));
  console.error(chalk.yellow('   • Check your network connection'));
  console.error(chalk.yellow('   • Verify the server URL in settings'));
  console.error(chalk.yellow('   • Try running with NODE_ENV=development for more details'));
  console.error();

  process.exit(1);
}

/**
 * Export types for use in other modules
 */
export type { CLIConfig } from './utils/config.js';
export type { CLITRPCClient } from './client.js';