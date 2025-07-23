/**
 * @fileoverview CLI tool for configuring Chromatic Turbosnap for Storybook projects.
 * This utility helps users set up and manage Chromatic configuration files,
 * detect static assets, and update package.json scripts.
 */
import { JsPackageManager, JsPackageManagerFactory } from 'storybook/internal/common';
import { findConfigFile } from 'storybook/internal/common';
import { readConfig } from 'storybook/internal/csf-tools';
import { glob } from 'fast-glob';
import { prompt } from 'prompts';
import boxen from 'boxen';
import chalk from 'chalk';
import dedent from 'dedent';
import fs from 'fs';
import path from 'path';
import { ChromaticConfig } from './types';
import { displayMessage } from './utils';
import { findStaticAssets, promptForStaticAssets } from './static-assets';
import { createChromaticConfig, updateChromaticConfig, findChromaticConfig } from './config-management';
import { updatePackageJsonScript } from './package-json';
import { buildProjectMeta } from './project-detection';
import { minimatch } from 'minimatch';
import { analyzeMode } from './analyze-mode';
import { previewMode } from './preview-mode';

interface ConfigState {
    configPath?: string;
    config?: ChromaticConfig;
}

const configState: ConfigState = {};

/**
 * Handles exit with confirmation for unsaved changes
 */
const handleExit = async (): Promise<void> => {
    displayMessage('Configuration helper exited.', {
        title: '👋 Goodbye!',
        borderColor: 'blue',
    });
    process.exit(0);
};

/**
 * Initialize Chromatic configuration
 */
const initMode = async () => {
    displayMessage('CLI tool for helping you configure Chromatic Turbosnap for your project', {
        title: '@chromaui/turbosnap-helper',
        borderColor: 'magenta',
    });

    const manager = JsPackageManagerFactory.getPackageManager() as JsPackageManager;

    const storybookDirs = await glob('**/.storybook', {
        onlyDirectories: true,
        ignore: ['**/node_modules/**'],
    });

    if (storybookDirs.length === 0) {
        displayMessage(
            'No Storybook configuration directories found. Please ensure you are in a Storybook project directory.',
            { title: '❌ No Storybook Config Found', borderColor: 'yellow' },
        );
        process.exit(1);
    }

    // Show all found Storybook projects and let user select one
    displayMessage(
        `I found ${chalk.cyan(storybookDirs.length)} Storybook ${storybookDirs.length === 1 ? 'project' : 'projects'}.`,
        { title: '📚 Storybook Projects', borderColor: 'magenta' },
    );

    const { selectedProject } = await prompt({
        type: 'select',
        name: 'selectedProject',
        message: 'Which Storybook project would you like to configure?',
        choices: [
            ...storybookDirs.map((dir) => ({
                title: dir,
                value: dir,
                description: `Configure Chromatic for ${dir}`,
            })),
            {
                title: 'Exit',
                value: 'exit',
                description: 'Exit the configuration helper',
            },
        ],
    });

    if (selectedProject === 'exit') {
        await handleExit();
    }

    // Process the selected Storybook project
    displayMessage(`Processing Storybook configuration in ${chalk.cyan(selectedProject)}`, {
        title: '📝 Storybook Project',
        borderColor: 'magenta',
    });

    const mainConfigPath = findConfigFile('main', selectedProject);
    const mainConfig = await readConfig(mainConfigPath);
    const meta = await buildProjectMeta(manager, mainConfig, selectedProject, '');

    // Check for .git directory
    const gitDir = path.join(process.cwd(), '.git');
    const hasGit = fs.existsSync(gitDir);

    console.log(
        boxen(
            dedent`📙 Storybook Base Directory: ${chalk.cyan(meta.storybookBaseDir)}
        📂 Storybook Config Directory: ${chalk.cyan(meta.storybookConfigDir)}
        📦 Storybook Build Directory: ${chalk.cyan(meta.storybookBuildDir)}
        🧰 Package Manager: ${chalk.green(meta.packageManager)}
        📝 Framework: ${chalk.green(meta.framework)}
        ${hasGit ? '✅ Git repository found' : '⚠️ No git repository found'}`,
            {
                title: '📝 Here are your project details',
                titleAlignment: 'center',
                padding: 1,
                borderColor: 'green',
                borderStyle: 'double',
            },
        ),
    );

    const { configAction } = await prompt({
        type: 'select',
        name: 'configAction',
        message: 'What would you like to do with these configuration values?',
        choices: [
            {
                title: 'Just show me the configuration values',
                value: 'show',
                description: 'Display the configuration values without creating/updating files',
            },
            {
                title: 'Help me create/update a config file',
                value: 'create',
                description: 'Create or update a Chromatic config file with these values',
            },
            {
                title: 'Exit',
                value: 'exit',
                description: 'Exit the configuration helper',
            },
        ],
    });

    if (configAction === 'exit') {
        await handleExit();
    }

    if (configAction === 'show') {
        console.log(
            boxen(
                dedent`Here are the recommended configuration values for your project:
                Base Directory: ${chalk.cyan(meta.storybookBaseDir)}
                Config Directory: ${chalk.cyan(meta.storybookConfigDir)}
                Build Directory: ${chalk.cyan(meta.storybookBuildDir)}
                Package Manager: ${chalk.green(meta.packageManager)}
                Framework: ${chalk.green(meta.framework)}
                
                You can use these values in your Chromatic config file.`,
                {
                    title: '📝 Configuration Values',
                    titleAlignment: 'center',
                    padding: 1,
                    borderColor: 'green',
                    borderStyle: 'double',
                },
            ),
        );
        process.exit(0);
    }

    const existingConfig = await findChromaticConfig(selectedProject);
    let finalConfig;

    if (existingConfig) {
        const { updateConfig } = await prompt({
            type: 'confirm',
            name: 'updateConfig',
            message: 'Would you like to update the existing config file with the current Storybook settings?',
            initial: true,
        });

        if (updateConfig) {
            finalConfig = await updateChromaticConfig(existingConfig.path, existingConfig.config, meta);
            configState.config = finalConfig.config;
            configState.configPath = finalConfig.path;
        } else {
            // If user doesn't want to update, use the existing config
            finalConfig = existingConfig;
            configState.configPath = finalConfig.path;
            configState.config = finalConfig.config;
        }
    } else {
        finalConfig = await createChromaticConfig(meta);
        configState.configPath = finalConfig.path;
        configState.config = finalConfig.config;
    }

    // Check for static assets
    const staticAssets = await findStaticAssets(meta.storybookBaseDir, process.cwd());
    if (staticAssets.projectAssets.length > 0 || staticAssets.repoAssets.length > 0) {
        const externals = await promptForStaticAssets(staticAssets, meta.storybookBaseDir, process.cwd());
        if (externals.length > 0) {
            // Get existing externals from the config
            const existingExternals = finalConfig.config.externals || [];

            // Create a new array to store the updated externals
            const newExternals: string[] = [];
            const removedPaths: string[] = [];
            const addedPatterns: string[] = [];

            // First, process existing externals
            existingExternals.forEach((existingPath) => {
                // Check if this existing path is matched by any new pattern
                const matchingPattern = externals.find((newPattern) => {
                    // If the existing path is a specific file
                    if (!existingPath.includes('*') && !existingPath.includes('?')) {
                        // Check if this specific file would be matched by the new pattern
                        return minimatch(existingPath, newPattern);
                    }
                    // If the existing path is a glob pattern
                    // Check if the new pattern would match the same files
                    return minimatch(existingPath, newPattern) || minimatch(newPattern, existingPath);
                });

                if (matchingPattern) {
                    removedPaths.push(existingPath);
                    // Add the matching pattern if it's not already in newExternals
                    if (!newExternals.includes(matchingPattern)) {
                        newExternals.push(matchingPattern);
                        addedPatterns.push(matchingPattern);
                    }
                } else {
                    newExternals.push(existingPath);
                }
            });

            // Then add any remaining new patterns that aren't already covered
            externals.forEach((newPattern) => {
                if (!newExternals.includes(newPattern)) {
                    newExternals.push(newPattern);
                    addedPatterns.push(newPattern);
                }
            });

            // Update the config with new externals while preserving all other options
            const updatedConfig = {
                // Explicitly preserve all existing properties
                ...Object.fromEntries(Object.entries(finalConfig.config).filter(([key]) => key !== 'externals')),
                // Update only the externals
                externals: newExternals,
            } as ChromaticConfig;

            // Write the updated config
            fs.writeFileSync(finalConfig.path, JSON.stringify(updatedConfig, null, 2));
            configState.config = updatedConfig;
            finalConfig.config = updatedConfig;

            // Display changes made
            if (removedPaths.length > 0) {
                displayMessage(
                    `Removed paths that are now covered by new patterns:\n${removedPaths
                        .map((p) => `  - ${p}`)
                        .join('\n')}`,
                    { title: '📝 Externals Updated', borderColor: 'yellow' },
                );
            }
            if (addedPatterns.length > 0) {
                displayMessage(`Added new patterns:\n${addedPatterns.map((p) => `  - ${p}`).join('\n')}`, {
                    title: '📝 Externals Updated',
                    borderColor: 'green',
                });
            }
            if (removedPaths.length === 0 && addedPatterns.length === 0) {
                displayMessage('No changes were made to externals as all patterns were already covered.', {
                    title: '📝 Externals Checked',
                    borderColor: 'blue',
                });
            }

            // Verify all options are preserved
            const originalKeys = Object.keys(finalConfig.config);
            const updatedKeys = Object.keys(updatedConfig);
            const missingKeys = originalKeys.filter((key) => !updatedKeys.includes(key));
            if (missingKeys.length > 0) {
                displayMessage(
                    `Warning: Some configuration options were not preserved:\n${missingKeys
                        .map((k) => `  - ${k}`)
                        .join('\n')}`,
                    { title: '🚨 Config Warning', borderColor: 'yellow' },
                );
            }
        }
    }

    const { updateScript } = await prompt({
        type: 'confirm',
        name: 'updateScript',
        message: 'Would you like to update the package.json script to use this config file?',
        initial: true,
    });

    if (updateScript) {
        const packageJsonChanges = await updatePackageJsonScript(finalConfig.path, meta);
        if (packageJsonChanges) {
            fs.writeFileSync(packageJsonChanges.path, JSON.stringify(packageJsonChanges.content, null, 2));
            displayMessage(
                `Updated package.json with Chromatic script using config file: ${path.relative(
                    process.cwd(),
                    finalConfig.path,
                )}`,
                { title: '📝 Package.json Updated', borderColor: 'green' },
            );
        }
    }

    // Ask if user wants to configure another project
    if (storybookDirs.length > 1) {
        const { configureAnother } = await prompt({
            type: 'confirm',
            name: 'configureAnother',
            message: 'Would you like to configure another Storybook project?',
            initial: true,
        });

        if (configureAnother) {
            // Remove the current project from the list
            const remainingProjects = storybookDirs.filter((dir) => dir !== selectedProject);

            const { nextProject } = await prompt({
                type: 'select',
                name: 'nextProject',
                message: 'Which Storybook project would you like to configure next?',
                choices: [
                    ...remainingProjects.map((dir) => ({
                        title: dir,
                        value: dir,
                        description: `Configure Chromatic for ${dir}`,
                    })),
                    {
                        title: 'Exit',
                        value: 'exit',
                        description: 'Exit the configuration helper',
                    },
                ],
            });

            if (nextProject === 'exit') {
                await handleExit();
            }
        } else {
            await handleExit();
        }
    } else {
        await handleExit();
    }
};

/**
 * Main function that handles mode selection and execution
 */
const main = async () => {
    // Get the mode from command line arguments
    const mode = process.argv[2] || 'init';

    switch (mode) {
        case 'init':
            await initMode();
            break;
        case 'analyze':
            await analyzeMode();
            break;
        case 'preview':
            await previewMode();
            break;
        default:
            displayMessage(`Unknown mode: ${mode}. Available modes: init (default), analyze, preview`, {
                title: '❌ Error',
                borderColor: 'red',
            });
            process.exit(1);
    }
};

// Handle process termination
process.on('SIGINT', async () => {
    await handleExit();
});

// Execute the main function
main()
    .then(() => {
        process.exit(0);
    })
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
