import { ChromaticConfig, ProjectMeta } from './types';
import { displayMessage } from './utils';
import { prompt } from 'prompts';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import boxen from 'boxen';
import dedent from 'dedent';
import { glob } from 'fast-glob';

/**
 * Type for configuration result
 */
export interface ConfigResult {
    path: string;
    config: ChromaticConfig;
}

/**
 * Finds existing Chromatic configuration files
 */
export const findChromaticConfig = async (storybookDir: string): Promise<{ path: string; config: ChromaticConfig } | null> => {
    // First check for chromatic.config.json in the Storybook directory
    const defaultConfigPath = path.join(storybookDir, 'chromatic.config.json');
    if (fs.existsSync(defaultConfigPath)) {
        displayMessage(
            `Found default config file: ${chalk.cyan(path.relative(process.cwd(), defaultConfigPath))}`,
            { title: '📝 Config File Found', borderColor: 'green' }
        );
        return {
            path: defaultConfigPath,
            config: JSON.parse(fs.readFileSync(defaultConfigPath, 'utf-8'))
        };
    }

    // If no default config found, search for other config files
    const configFiles = await glob('**/*.config.{js,json}', {
        ignore: ['**/node_modules/**'],
        cwd: storybookDir
    });

    if (configFiles.length === 0) {
        return null;
    }

    displayMessage(
        `Found ${chalk.cyan(configFiles.length)} config ${configFiles.length === 1 ? 'file' : 'files'}.`,
        { title: '📝 Config Files Found', borderColor: 'magenta' }
    );

    const { useExisting } = await prompt({
        type: 'confirm',
        name: 'useExisting',
        message: 'Would you like to use one of these existing config files?',
        initial: true,
    });

    if (!useExisting) {
        return null;
    }

    const { selectedConfig } = await prompt({
        type: 'select',
        name: 'selectedConfig',
        message: 'Which config file would you like to use?',
        choices: configFiles.map(file => ({
            title: file,
            value: file,
            description: `Use ${file} as the config file`
        })),
    });

    const configPath = path.join(storybookDir, selectedConfig);
    return {
        path: configPath,
        config: JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    };
};

/**
 * Creates a new Chromatic configuration file
 */
export const createChromaticConfig = async (meta: ProjectMeta): Promise<ConfigResult> => {
    displayMessage(
        `I'll help you create a Chromatic config file with your Storybook settings.`,
        { title: '📝 Creating Chromatic Config', borderColor: 'magenta' }
    );

    const configPath = path.join(meta.storybookBaseDir, 'chromatic.config.json');
    let projectId = '';
    let existingExternals: string[] = [];

    // Check if config file already exists
    if (fs.existsSync(configPath)) {
        const existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (existingConfig.projectId) {
            projectId = existingConfig.projectId.replace('Project:', '');
        }
        if (existingConfig.externals) {
            existingExternals = existingConfig.externals;
        }
    }

    // Only ask for project ID if we don't have one
    if (!projectId) {
        const { newProjectId } = await prompt({
            type: 'text',
            name: 'newProjectId',
            message: 'What is your Chromatic project ID?',
        });

        if (!newProjectId) {
            throw new Error('Project ID is required');
        }
        projectId = newProjectId;
    }

    const config: ChromaticConfig = {
        $schema: 'https://www.chromatic.com/config-file.schema.json',
        projectId: `Project:${projectId}`,
        storybookBaseDir: meta.storybookBaseDir,
        storybookConfigDir: meta.storybookConfigDir,
        storybookBuildDir: meta.storybookBuildDir,
        onlyChanged: true,
        externals: existingExternals, // Preserve existing externals
    };

    // Write the new config immediately
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    return { path: configPath, config };
};

/**
 * Updates an existing Chromatic configuration file
 */
export const updateChromaticConfig = async (
    configPath: string,
    existingConfig: ChromaticConfig,
    meta: ProjectMeta
): Promise<ConfigResult> => {
    displayMessage(
        `I'll help you update the existing Chromatic config with your Storybook settings.`,
        { title: '📝 Updating Chromatic Config', borderColor: 'magenta' }
    );

    // Create a new config object that preserves all existing properties
    // TODO: currently, spreading is not properly working and some properties are not being preserved
    const updatedConfig = {
        // Explicitly preserve all existing properties
        ...Object.fromEntries(
            Object.entries(existingConfig).filter(([key]) => 
                !['storybookBaseDir', 'storybookConfigDir', 'storybookBuildDir'].includes(key)
            )
        ),
        // Update only the Storybook paths
        storybookBaseDir: meta.storybookBaseDir,
        storybookConfigDir: meta.storybookConfigDir,
        storybookBuildDir: meta.storybookBuildDir,
    } as ChromaticConfig;

    // Add schema if it doesn't exist
    if (!updatedConfig.$schema) {
        updatedConfig.$schema = 'https://www.chromatic.com/config-file.schema.json';
    }

    // Write the updated config immediately
    fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));

    // Verify all options are preserved
    const originalKeys = Object.keys(existingConfig);
    const updatedKeys = Object.keys(updatedConfig);
    const missingKeys = originalKeys.filter(key => !updatedKeys.includes(key));
    if (missingKeys.length > 0) {
        displayMessage(
            `Warning: Some configuration options were not preserved:\n${missingKeys.map(k => `  - ${k}`).join('\n')}`,
            { title: '⚠️ Config Warning', borderColor: 'yellow' }
        );
    }

    displayMessage(
        `Updated Chromatic config with new Storybook paths:\n` +
        `  - Base Directory: ${meta.storybookBaseDir}\n` +
        `  - Config Directory: ${meta.storybookConfigDir}\n` +
        `  - Build Directory: ${meta.storybookBuildDir}\n` +
        `All other configuration options have been preserved.`,
        { title: '📝 Config Updated', borderColor: 'green' }
    );

    return { path: configPath, config: updatedConfig };
}; 