import { PackageManagerName } from '@storybook/cli';
import { ConfigFile } from '@storybook/csf-tools';
import boxen from 'boxen';
import chalk from 'chalk';
import dedent from 'dedent';
import { ProjectMeta } from './types';

/**
 * Normalizes package manager name to standard format
 */
export const normalizeManagerName = (managerName: PackageManagerName) =>
    managerName.startsWith('yarn') ? 'yarn' : managerName;

/**
 * Extracts framework information from Storybook main config
 */
export const pluckFrameworkFromRawContents = (mainConfig: ConfigFile): string => {
    const frameworkNode = mainConfig.getFieldNode(['framework']);
    const { start, end } = frameworkNode;
    const frameworkContents = mainConfig._code.slice(start, end);
    const frameworkMatch = frameworkContents.match(/(@storybook\/[^\"]+)/);
    return frameworkMatch?.[1];
};

/**
 * Displays a message in a box with consistent styling
 */
export const displayMessage = (message: string, options: { title: string; borderColor?: string } = { title: '', borderColor: 'blue' }) => {
    console.log(
        boxen(
            message,
            {
                title: options.title,
                padding: 1,
                borderColor: options.borderColor,
                borderStyle: 'double',
            },
        ),
    );
    console.log('\n');
};

/**
 * Exits the program with a goodbye message
 */
export const exitWithMessage = (message: string = 'Configuration helper exited. No changes were made.') => {
    displayMessage(message, { title: '👋 Goodbye!', borderColor: 'blue' });
    process.exit(0);
};

/**
 * Displays project metadata in a formatted box
 */
export const displayProjectMeta = (meta: ProjectMeta) => {
    displayMessage(
        dedent`📙 Storybook Base Directory: ${chalk.cyan(meta.storybookBaseDir)}
        📂 Storybook Config Directory: ${chalk.cyan(meta.storybookConfigDir)}
        📦 Storybook Build Directory: ${chalk.cyan(meta.storybookBuildDir)}
        🧰 Package Manager: ${chalk.green(meta.packageManager)}
        📝 Framework: ${chalk.green(meta.framework)}`,
        {
            title: '📝 Here are your project details',
            borderColor: 'green',
        },
    );
}; 