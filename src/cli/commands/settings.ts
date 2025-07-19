import { select, input, confirm } from '@inquirer/prompts';
import chalk from 'chalk';
import { CLIConfig, loadConfig, saveConfig, resetConfig, validateConfig } from '../utils/config.js';
import { displaySuccess, displayError, displayInfo } from '../ui/menu.js';

/**
 * Settings command - manage CLI configuration
 */
export async function settingsCommand(): Promise<void> {
  try {
    console.log(chalk.bold.cyan('\n⚙️ Settings Management\n'));
    
    const action = await select({
      message: 'What would you like to do?',
      choices: [
        { name: '👀 View current settings', value: 'view' },
        { name: '✏️ Edit settings', value: 'edit' },
        { name: '🔄 Reset to defaults', value: 'reset' },
        { name: '🔙 Back to main menu', value: 'back' },
      ],
    });

    switch (action) {
      case 'view':
        await viewSettings();
        break;
      case 'edit':
        await editSettings();
        break;
      case 'reset':
        await resetSettings();
        break;
      case 'back':
        return;
    }
    
  } catch (error) {
    displayError('Settings error', error instanceof Error ? error.message : String(error));
  }
}

/**
 * View current settings
 */
async function viewSettings(): Promise<void> {
  const config = await loadConfig();
  
  console.log(chalk.bold('\n📋 Current Settings\n'));
  
  console.log(`${chalk.cyan('API Base URL:')} ${config.apiBaseUrl}`);
  console.log(`${chalk.cyan('Default Language:')} ${config.defaultLanguage}`);
  console.log(`${chalk.cyan('Default Priority:')} ${config.defaultPriority}`);
  console.log(`${chalk.cyan('Max Concurrent Tasks:')} ${config.maxConcurrentTasks}`);
  console.log(`${chalk.cyan('Auto Open Files:')} ${config.autoOpenFiles ? 'Yes' : 'No'}`);
  console.log(`${chalk.cyan('Progress Animations:')} ${config.progressAnimations ? 'Yes' : 'No'}`);
  console.log(`${chalk.cyan('Theme:')} ${config.theme}`);
  console.log(`${chalk.cyan('Show Timestamps:')} ${config.showTimestamps ? 'Yes' : 'No'}`);
  console.log(`${chalk.cyan('Retry Attempts:')} ${config.retryAttempts}`);
  console.log(`${chalk.cyan('Request Timeout:')} ${config.requestTimeout}ms`);
  
  console.log();
}

/**
 * Edit settings
 */
async function editSettings(): Promise<void> {
  const config = await loadConfig();
  
  const setting = await select({
    message: 'Which setting would you like to change?',
    choices: [
      { name: 'API Base URL', value: 'apiBaseUrl' },
      { name: 'Default Language', value: 'defaultLanguage' },
      { name: 'Default Priority', value: 'defaultPriority' },
      { name: 'Max Concurrent Tasks', value: 'maxConcurrentTasks' },
      { name: 'Auto Open Files', value: 'autoOpenFiles' },
      { name: 'Progress Animations', value: 'progressAnimations' },
      { name: 'Theme', value: 'theme' },
      { name: 'Show Timestamps', value: 'showTimestamps' },
      { name: 'Retry Attempts', value: 'retryAttempts' },
      { name: 'Request Timeout', value: 'requestTimeout' },
    ],
  });

  const newConfig = { ...config };

  switch (setting) {
    case 'apiBaseUrl':
      newConfig.apiBaseUrl = await input({
        message: 'Enter API Base URL:',
        default: config.apiBaseUrl,
        validate: (input) => input.trim() ? true : 'URL is required',
      });
      break;

    case 'defaultLanguage':
      newConfig.defaultLanguage = await input({
        message: 'Enter default language:',
        default: config.defaultLanguage,
      });
      break;

    case 'defaultPriority':
      newConfig.defaultPriority = await select({
        message: 'Select default priority:',
        choices: [
          { name: 'Low', value: 'low' },
          { name: 'Normal', value: 'normal' },
          { name: 'High', value: 'high' },
        ],
        default: config.defaultPriority,
      }) as 'low' | 'normal' | 'high';
      break;

    case 'maxConcurrentTasks':
      const maxTasks = await input({
        message: 'Enter max concurrent tasks (1-10):',
        default: config.maxConcurrentTasks.toString(),
        validate: (input) => {
          const num = parseInt(input);
          return (num >= 1 && num <= 10) ? true : 'Must be between 1 and 10';
        },
      });
      newConfig.maxConcurrentTasks = parseInt(maxTasks);
      break;

    case 'autoOpenFiles':
      newConfig.autoOpenFiles = await confirm({
        message: 'Auto open files after processing?',
        default: config.autoOpenFiles,
      });
      break;

    case 'progressAnimations':
      newConfig.progressAnimations = await confirm({
        message: 'Enable progress animations?',
        default: config.progressAnimations,
      });
      break;

    case 'theme':
      newConfig.theme = await select({
        message: 'Select theme:',
        choices: [
          { name: 'Light', value: 'light' },
          { name: 'Dark', value: 'dark' },
          { name: 'Auto', value: 'auto' },
        ],
        default: config.theme,
      }) as 'light' | 'dark' | 'auto';
      break;

    case 'showTimestamps':
      newConfig.showTimestamps = await confirm({
        message: 'Show timestamps in output?',
        default: config.showTimestamps,
      });
      break;

    case 'retryAttempts':
      const retries = await input({
        message: 'Enter retry attempts (1-5):',
        default: config.retryAttempts.toString(),
        validate: (input) => {
          const num = parseInt(input);
          return (num >= 1 && num <= 5) ? true : 'Must be between 1 and 5';
        },
      });
      newConfig.retryAttempts = parseInt(retries);
      break;

    case 'requestTimeout':
      const timeout = await input({
        message: 'Enter request timeout in milliseconds (5000-60000):',
        default: config.requestTimeout.toString(),
        validate: (input) => {
          const num = parseInt(input);
          return (num >= 5000 && num <= 60000) ? true : 'Must be between 5000 and 60000';
        },
      });
      newConfig.requestTimeout = parseInt(timeout);
      break;
  }

  // Validate and save the new configuration
  const validation = validateConfig(newConfig);
  if (!validation.isValid) {
    displayError('Invalid configuration', validation.errors.join(', '));
    return;
  }

  await saveConfig(newConfig);
  displaySuccess('Settings saved successfully');
}

/**
 * Reset settings to defaults
 */
async function resetSettings(): Promise<void> {
  const shouldReset = await confirm({
    message: 'Are you sure you want to reset all settings to defaults?',
    default: false,
  });

  if (shouldReset) {
    await resetConfig();
    displaySuccess('Settings reset to defaults');
  } else {
    displayInfo('Reset cancelled');
  }
}