import { select } from '@inquirer/prompts';
import chalk from 'chalk';
import { CLITRPCClient, handleTRPCError } from '../client.js';
import { displaySuccess, displayError, displayInfo } from '../ui/menu.js';
import { createTaskTable, formatTimestamp } from '../utils/formatters.js';

/**
 * View tasks command - displays task management interface
 */
export async function viewTasksCommand(client: CLITRPCClient): Promise<void> {
  try {
    console.log(chalk.bold.cyan('\n📋 Task Management\n'));
    
    // Get task statistics
    const stats = await client.tasks.getStats.query();
    
    // Display task statistics
    displayTaskStats(stats);
    
    // For now, show placeholder message
    displayInfo('Task list display would be implemented here');
    displayInfo(`Total tasks: ${stats.totalTasks || 0}`);
    displayInfo(`Active tasks: ${stats.activeTasks || 0}`);
    displayInfo(`Completed tasks: ${stats.completedTasks || 0}`);
    
  } catch (error) {
    displayError('Failed to load tasks', handleTRPCError(error));
  }
}

/**
 * Display task statistics
 */
function displayTaskStats(stats: any): void {
  console.log(chalk.bold('📊 Task Statistics\n'));
  
  console.log(`${chalk.cyan('Total Tasks:')} ${stats.totalTasks || 0}`);
  console.log(`${chalk.green('Completed:')} ${stats.completedTasks || 0}`);
  console.log(`${chalk.red('Failed:')} ${stats.failedTasks || 0}`);
  console.log(`${chalk.yellow('Active:')} ${stats.activeTasks || 0}`);
  console.log(`${chalk.blue('Queued:')} ${stats.queueSize || 0}`);
  
  console.log();
}