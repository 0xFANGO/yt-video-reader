import { input, select } from '@inquirer/prompts';
import chalk from 'chalk';
import { CLITRPCClient, handleTRPCError } from '../client.js';
import { displaySuccess, displayError, displayInfo } from '../ui/menu.js';
import { createFileTable } from '../utils/formatters.js';

/**
 * Browse files command - displays file browser interface
 */
export async function browseFilesCommand(client: CLITRPCClient): Promise<void> {
  try {
    console.log(chalk.bold.cyan('\n📁 File Browser\n'));
    
    // Get task ID from user
    const taskId = await input({
      message: 'Enter task ID to browse files:',
      validate: (input: string) => {
        if (!input.trim()) {
          return 'Task ID is required';
        }
        return true;
      },
    });

    // Get task files
    const result = await client.tasks.getFiles.query({ taskId: taskId.trim() });
    
    if (result.files.length === 0) {
      displayInfo('No files found for this task');
      return;
    }

    // Display files table
    const table = createFileTable(result.files);
    console.log(table.toString());
    
    displaySuccess(`Found ${result.files.length} files for task ${taskId}`);
    
  } catch (error) {
    displayError('Failed to browse files', handleTRPCError(error));
  }
}