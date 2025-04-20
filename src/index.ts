import { JsPackageManager, JsPackageManagerFactory, PackageManagerName } from '@storybook/cli';
import { findConfigFile } from '@storybook/core-common';
import { ConfigFile, readConfig } from '@storybook/csf-tools';
import { glob } from 'fast-glob';
import { prompt } from 'prompts';
import boxen from 'boxen';
import chalk from 'chalk';
import dedent from 'dedent';
import fs from 'fs';
import path from 'path';

const normalizeManagerName = (managerName: PackageManagerName) =>
    managerName.startsWith('yarn') ? 'yarn' : managerName;

const pluckFrameworkFromRawContents = (mainConfig: ConfigFile): string => {
    const frameworkNode = mainConfig.getFieldNode(['framework']);
    const { start, end } = frameworkNode;

    const frameworkContents = mainConfig._code.slice(start, end);

    const frameworkMatch = frameworkContents.match(/(@storybook\/[^\"]+)/);

    return frameworkMatch?.[1];
};

const getStorybookConfigPath = async (): Promise<string> => {
    const storybookDirectories = await glob('**/.storybook', { 
        onlyDirectories: true,
        ignore: ['**/node_modules/**']
    });

    if (storybookDirectories.length === 0) {
        console.log(
            boxen(
                'No Storybook configuration directories found. Please ensure you are in a Storybook project directory.',
                {
                    title: '⚠️ No Storybook Config Found',
                    padding: 1,
                    borderColor: 'yellow',
                    borderStyle: 'double',
                },
            ),
        );
        process.exit(1);
    }

    if (storybookDirectories.length === 1) {
        return storybookDirectories[0];
    }

    console.log(
        boxen(
            `I found multiple ${chalk.cyan.bold(
                '.storybook',
            )} directories. Please select which Storybook you'd like help with. `,
            {
                title: '💬 I need your help!!',
                padding: 1,
                borderStyle: 'double',
                borderColor: 'yellow',
            },
        ),
    );
    console.log('\n');

    const { configDir } = await prompt({
        type: 'select',
        name: 'configDir',
        message: 'Which directory is your Storybook config in?',
        choices: [
            ...storybookDirectories.map((dir) => ({ title: dir, value: dir })),
            { title: 'Exit', value: 'exit' }
        ],
    });

    if (configDir === 'exit') {
        console.log(
            boxen(
                'Configuration helper exited. No changes were made.',
                {
                    title: '👋 Goodbye!',
                    padding: 1,
                    borderColor: 'blue',
                    borderStyle: 'double',
                },
            ),
        );
        process.exit(0);
    }

    return configDir;
};

interface ChromaticConfig {
    $schema?: string;
    projectId?: string;
    storybookBaseDir?: string;
    storybookConfigDir?: string;
    storybookBuildDir?: string;
    externals?: string[];
    [key: string]: any;
}

const findStaticAssets = async (): Promise<string[]> => {
    const staticAssetPatterns = [
        '**/*.{png,jpg,jpeg,gif,svg,ico,webp}',
        '**/*.{woff,woff2,ttf,otf,eot}',
        '**/*.{css,scss,sass,less}',
    ];

    const assets = await glob(staticAssetPatterns, {
        ignore: [
            '**/node_modules/**',
            '**/dist/**',
            '**/build/**',
            '**/.storybook/**',
            '**/storybook-static/**',
        ],
    });

    return assets;
};

interface ProjectMeta {
    storybookBaseDir: string;
    storybookConfigDir: string;
    storybookBuildDir: string;
    packageManager: string;
    isMonoRepo: boolean;
    framework: string;
    ciEnv: string;
    staticAssets: string[];
}

const buildProjectMeta = async (
    packageManager: JsPackageManager,
    mainConfig: ConfigFile,
    configDir: string,
    ciEnv: string,
): Promise<ProjectMeta> => {
    let frameworkValue = mainConfig.getSafeFieldValue(['framework']);

    frameworkValue = !frameworkValue
        ? pluckFrameworkFromRawContents(mainConfig)
        : mainConfig.getNameFromPath(['framework']);

    // Get the build directory from main.js config
    const buildDir = mainConfig.getSafeFieldValue(['buildDir']) || 'storybook-static';

    // Find static assets
    const staticAssets = await findStaticAssets();

    return {
        storybookBaseDir: `./${configDir}`.replace('/.storybook', ''),
        storybookConfigDir: `./${configDir}`,
        storybookBuildDir: `./${buildDir}`,
        packageManager: normalizeManagerName(packageManager.type),
        isMonoRepo: packageManager.isStorybookInMonorepo(),
        framework: frameworkValue,
        ciEnv,
        staticAssets,
    };
};

const findChromaticConfig = async (storybookDir: string): Promise<{ path: string; config: ChromaticConfig } | null> => {
    console.log(
        boxen(
            `Searching for config files in ${chalk.cyan(storybookDir)}`,
            {
                title: '🔍 Searching for Config',
                padding: 1,
                borderStyle: 'double',
                borderColor: 'magenta',
            },
        ),
    );
    console.log('\n');

    // First check for config files in the Storybook base directory
    const configFiles = await glob('**/*.config.{js,json}', { 
        ignore: ['**/node_modules/**'],
        cwd: storybookDir,
        absolute: true
    });

    // Also check for chromatic.config.json specifically in the Storybook base directory
    const chromaticConfigPath = path.join(storybookDir, 'chromatic.config.json');
    if (fs.existsSync(chromaticConfigPath) && !configFiles.includes(chromaticConfigPath)) {
        configFiles.push(chromaticConfigPath);
    }

    // Check for config files in the project root (one level up from Storybook dir)
    const projectRoot = path.dirname(storybookDir);
    const projectConfigFiles = await glob('**/*.config.{js,json}', {
        ignore: ['**/node_modules/**'],
        cwd: projectRoot,
        absolute: true
    });

    // Add project root config files to the list
    configFiles.push(...projectConfigFiles);
    
    if (configFiles.length > 0) {
        console.log(
            boxen(
                `I found ${chalk.cyan(configFiles.length)} config ${configFiles.length === 1 ? 'file' : 'files'} in your project.`,
                {
                    title: '📝 Config Files Found',
                    padding: 1,
                    borderStyle: 'double',
                    borderColor: 'green',
                },
            ),
        );
        console.log('\n');

        const { useExisting } = await prompt({
            type: 'confirm',
            name: 'useExisting',
            message: 'Would you like to use one of these existing config files?',
            initial: true,
        });

        if (!useExisting) {
            return null;
        }

        const { configFile } = await prompt({
            type: 'select',
            name: 'configFile',
            message: 'Which config file would you like to use?',
            choices: configFiles.map((file) => ({ 
                title: path.relative(process.cwd(), file),
                value: file 
            })),
        });

        const configContent = fs.readFileSync(configFile, 'utf-8');
        const config = JSON.parse(configContent);

        console.log(
            boxen(
                `Selected config file: ${chalk.cyan(path.relative(process.cwd(), configFile))}`,
                {
                    title: '✅ Config Selected',
                    padding: 1,
                    borderStyle: 'double',
                    borderColor: 'green',
                },
            ),
        );
        console.log('\n');

        return { path: configFile, config };
    }

    // If no config file found, check package.json for --config-file flag
    try {
        const packageJsonPath = path.join(storybookDir, 'package.json');
        if (fs.existsSync(packageJsonPath)) {
            const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8');
            const packageJson = JSON.parse(packageJsonContent);
            const chromaticScript = packageJson.scripts?.chromatic;

            if (chromaticScript) {
                // Look for --config-file flag in the script
                const configFileMatch = chromaticScript.match(/--config-file\s+([^\s]+)/);
                if (configFileMatch) {
                    const configPath = path.resolve(storybookDir, configFileMatch[1]);
                    if (fs.existsSync(configPath)) {
                        console.log(
                            boxen(
                                `Found config file referenced in package.json: ${chalk.cyan(configFileMatch[1])}`,
                                {
                                    title: '📝 Config File Found',
                                    padding: 1,
                                    borderStyle: 'double',
                                    borderColor: 'green',
                                },
                            ),
                        );
                        console.log('\n');

                        const { useReferenced } = await prompt({
                            type: 'confirm',
                            name: 'useReferenced',
                            message: `Would you like to use the config file referenced in package.json (${configFileMatch[1]})?`,
                            initial: true,
                        });

                        if (useReferenced) {
                            const configContent = fs.readFileSync(configPath, 'utf-8');
                            const config = JSON.parse(configContent);
                            return { path: configPath, config };
                        }
                    } else {
                        console.log(
                            boxen(
                                `Config file ${chalk.cyan(configFileMatch[1])} referenced in package.json does not exist.`,
                                {
                                    title: '⚠️ Warning',
                                    padding: 1,
                                    borderColor: 'yellow',
                                    borderStyle: 'double',
                                },
                            ),
                        );
                        console.log('\n');
                    }
                }
            }
        }
    } catch (error) {
        // If there's an error reading package.json or the config file, just return null
        console.log(
            boxen(
                'Could not read package.json or the referenced config file.',
                {
                    title: '⚠️ Warning',
                    padding: 1,
                    borderColor: 'yellow',
                    borderStyle: 'double',
                },
            ),
        );
        console.log('\n');
    }

    return null;
};

const createChromaticConfig = async (meta: ProjectMeta) => {
    console.log(
        boxen(
            `I'll help you create a Chromatic config file with your Storybook settings.`,
            {
                title: '📝 Creating Chromatic Config',
                padding: 1,
                borderStyle: 'double',
                borderColor: 'magenta',
            },
        ),
    );
    console.log('\n');

    // Check for existing config files in the Storybook base directory
    const existingConfigs = await glob('**/chromatic.config.{js,json}', {
        ignore: ['**/node_modules/**'],
        cwd: meta.storybookBaseDir
    });

    let projectId = '';
    let existingConfig: ChromaticConfig | null = null;
    let configPath = '';

    if (existingConfigs.length > 0) {
        console.log(
            boxen(
                `I found ${chalk.cyan(existingConfigs.length)} existing Chromatic config ${existingConfigs.length === 1 ? 'file' : 'files'} in your Storybook project.`,
                {
                    title: '📝 Existing Config Found',
                    padding: 1,
                    borderStyle: 'double',
                    borderColor: 'yellow',
                },
            ),
        );
        console.log('\n');

        const { useExisting } = await prompt({
            type: 'confirm',
            name: 'useExisting',
            message: 'Would you like to update one of these existing config files instead of creating a new one?',
            initial: true,
        });

        if (useExisting) {
            const { selectedConfig } = await prompt({
                type: 'select',
                name: 'selectedConfig',
                message: 'Which config file would you like to update?',
                choices: existingConfigs.map((file) => ({ title: file, value: file })),
            });

            configPath = path.join(meta.storybookBaseDir, selectedConfig);
            const configContent = fs.readFileSync(configPath, 'utf-8');
            existingConfig = JSON.parse(configContent);

            // If the existing config has a project ID, use it
            if (existingConfig.projectId) {
                projectId = existingConfig.projectId.replace('Project:', '');
            }
        }
    }

    // If we're updating an existing config, use updateChromaticConfig
    if (existingConfig) {
        return await updateChromaticConfig(configPath, existingConfig, meta);
    }

    // Only prompt for project ID if we don't have an existing config
    const { projectId: newProjectId } = await prompt({
        type: 'text',
        name: 'projectId',
        message: 'What is your Chromatic project ID? Hint: locate your project ID in the URL of your Chromatic project. (chromatic.com/builds?appId=...)',
    });

    if (!newProjectId) {
        console.log(
            boxen(
                'No project ID provided. Configuration helper exited.',
                {
                    title: '👋 Goodbye!',
                    padding: 1,
                    borderColor: 'blue',
                    borderStyle: 'double',
                },
            ),
        );
        process.exit(0);
    }

    projectId = newProjectId;

    // Use Storybook base directory as default location
    const projectRoot = process.cwd();
    const defaultConfigPath = path.join(meta.storybookBaseDir, 'chromatic.config.json');
    const relativeDefaultPath = path.relative(projectRoot, defaultConfigPath);

    const { configLocation } = await prompt({
        type: 'select',
        name: 'configLocation',
        message: 'Where would you like to place the config file?',
        choices: [
            { title: `Storybook base directory (${relativeDefaultPath})`, value: 'base' },
            { title: 'Custom location', value: 'custom' },
            { title: 'Exit', value: 'exit' }
        ],
    });

    if (configLocation === 'exit') {
        console.log(
            boxen(
                'Configuration helper exited. No changes were made.',
                {
                    title: '👋 Goodbye!',
                    padding: 1,
                    borderColor: 'blue',
                    borderStyle: 'double',
                },
            ),
        );
        process.exit(0);
    }

    configPath = defaultConfigPath;
    if (configLocation === 'custom') {
        const { customPath } = await prompt({
            type: 'text',
            name: 'customPath',
            message: 'Enter the path for the config file (relative to project root):',
            initial: relativeDefaultPath,
        });

        if (!customPath) {
            console.log(
                boxen(
                    'No path provided. Configuration helper exited.',
                    {
                        title: '👋 Goodbye!',
                        padding: 1,
                        borderColor: 'blue',
                        borderStyle: 'double',
                    },
                ),
            );
            process.exit(0);
        }

        configPath = path.join(projectRoot, customPath);
    }

    const config: ChromaticConfig = {
        $schema: 'https://www.chromatic.com/config-file.schema.json',
        projectId: `Project:${projectId}`,
        storybookBaseDir: meta.storybookBaseDir,
        storybookConfigDir: meta.storybookConfigDir,
        storybookBuildDir: meta.storybookBuildDir,
    };

    // Ask about adding static assets to externals
    if (meta.staticAssets.length > 0) {
        console.log(
            boxen(
                `I found ${chalk.cyan(meta.staticAssets.length)} static assets in your project.`,
                {
                    title: '📦 Static Assets',
                    padding: 1,
                    borderStyle: 'double',
                    borderColor: 'magenta',
                },
            ),
        );
        console.log('\n');

        const { updateExternals } = await prompt({
            type: 'confirm',
            name: 'updateExternals',
            message: 'Would you like to update the externals configuration with these assets?',
            initial: true,
        });

        if (updateExternals) {
            const { selectionMode } = await prompt({
                type: 'select',
                name: 'selectionMode',
                message: 'How would you like to select assets to add?',
                choices: [
                    { title: 'Add all assets', value: 'all' },
                    { title: 'Add none', value: 'none' },
                    { title: 'Select individual assets', value: 'individual' },
                ],
            });

            let selectedAssets: string[] = [];
            if (selectionMode === 'all') {
                selectedAssets = meta.staticAssets;
            } else if (selectionMode === 'individual') {
                const { showDetails } = await prompt({
                    type: 'confirm',
                    name: 'showDetails',
                    message: 'Would you like to see file details (size, type) when selecting files?',
                    initial: true,
                });

                const { showPaths } = await prompt({
                    type: 'confirm',
                    name: 'showPaths',
                    message: 'Would you like to see files grouped by path?',
                    initial: true,
                });

                if (showPaths) {
                    // Group files by directory
                    const filesByDir = meta.staticAssets.reduce((acc, asset) => {
                        const dir = path.dirname(asset);
                        if (!acc[dir]) {
                            acc[dir] = [];
                        }
                        acc[dir].push(asset);
                        return acc;
                    }, {} as Record<string, string[]>);

                    const { assets } = await prompt({
                        type: 'multiselect',
                        name: 'assets',
                        message: 'Select paths to add to externals:',
                        choices: Object.entries(filesByDir).map(([dir, files]) => {
                            const title = showDetails 
                                ? `${dir} (${files.length} files)`
                                : `${dir} (${files.length} files)`;
                            return {
                                title,
                                value: dir,
                                selected: true,
                                description: showDetails 
                                    ? files.map(file => `${path.basename(file)} (${path.extname(file).slice(1)}, ${(fs.statSync(file).size / 1024).toFixed(1)}KB)`).join('\n')
                                    : files.map(file => path.basename(file)).join('\n')
                            };
                        }),
                    });

                    // Flatten the selected directories back into individual files
                    selectedAssets = assets.flatMap((dir: string) => filesByDir[dir]);
                } else {
                    const { assets } = await prompt({
                        type: 'multiselect',
                        name: 'assets',
                        message: 'Select individual files to add to externals:',
                        choices: meta.staticAssets.map(asset => {
                            const title = showDetails 
                                ? `${asset} (${path.extname(asset).slice(1)}, ${(fs.statSync(asset).size / 1024).toFixed(1)}KB)`
                                : asset;
                            return {
                                title,
                                value: asset,
                                selected: true
                            };
                        }),
                    });
                    selectedAssets = assets;
                }
            }

            if (selectedAssets.length > 0) {
                const { useGlob } = await prompt({
                    type: 'confirm',
                    name: 'useGlob',
                    message: 'Would you like to use glob patterns instead of individual file paths?',
                    initial: true,
                });

                let newExternals: string[];
                if (useGlob) {
                    // Group files by extension and create glob patterns
                    const patterns = new Set<string>();
                    selectedAssets.forEach(asset => {
                        const ext = path.extname(asset);
                        const dir = path.dirname(asset);
                        patterns.add(`${dir}/**/*${ext}`);
                    });
                    newExternals = Array.from(patterns);
                } else {
                    newExternals = selectedAssets;
                }

                config.externals = newExternals;

                // Show what will be added to externals
                console.log(
                    boxen(
                        dedent`The following will be added to externals:
                    ${newExternals.map(ext => `- ${chalk.cyan(ext)}`).join('\n')}`,
                        {
                            title: '📦 Externals Update',
                            padding: 1,
                            borderStyle: 'double',
                            borderColor: 'yellow',
                        },
                    ),
                );
                console.log('\n');

                const { confirmExternals } = await prompt({
                    type: 'confirm',
                    name: 'confirmExternals',
                    message: 'Do you want to proceed with these externals changes?',
                    initial: true,
                });

                if (!confirmExternals) {
                    delete config.externals;
                }
            }
        }
    }

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    return { path: configPath, config };
};

const updateChromaticConfig = async (configPath: string, existingConfig: ChromaticConfig, meta: ProjectMeta) => {
    const { shouldUpdate } = await prompt({
        type: 'confirm',
        name: 'shouldUpdate',
        message: 'Would you like to update the existing Chromatic config with the Storybook settings?',
        initial: true,
    });

    if (!shouldUpdate) {
        console.log(
            boxen(
                'No changes were made to the configuration file.',
                {
                    title: '👋 Goodbye!',
                    padding: 1,
                    borderColor: 'blue',
                    borderStyle: 'double',
                },
            ),
        );
        process.exit(0);
    }

    // Show what will be updated
    console.log(
        boxen(
            dedent`The following settings will be updated in ${chalk.cyan(configPath)}:
        Base Directory: ${chalk.cyan(meta.storybookBaseDir)}
        Config Directory: ${chalk.cyan(meta.storybookConfigDir)}
        Build Directory: ${chalk.cyan(meta.storybookBuildDir)}`,
            {
                title: '📝 Configuration Changes',
                padding: 1,
                borderStyle: 'double',
                borderColor: 'yellow',
            },
        ),
    );
    console.log('\n');

    const { confirmUpdate } = await prompt({
        type: 'confirm',
        name: 'confirmUpdate',
        message: 'Do you want to proceed with these changes?',
        initial: true,
    });

    if (!confirmUpdate) {
        console.log(
            boxen(
                'No changes were made to the configuration file.',
                {
                    title: '⚠️ Update Cancelled',
                    padding: 1,
                    borderColor: 'yellow',
                    borderStyle: 'double',
                },
            ),
        );
        console.log('\n');
        return { path: configPath, config: existingConfig };
    }

    // Preserve all existing config values and only update the Storybook-specific ones
    const updatedConfig = {
        ...existingConfig,
        storybookBaseDir: meta.storybookBaseDir,
        storybookConfigDir: meta.storybookConfigDir,
        storybookBuildDir: meta.storybookBuildDir,
    };

    // Ask about updating externals if static assets are found
    if (meta.staticAssets.length > 0) {
        console.log(
            boxen(
                `I found ${chalk.cyan(meta.staticAssets.length)} static assets in your project.`,
                {
                    title: '📦 Static Assets',
                    padding: 1,
                    borderStyle: 'double',
                    borderColor: 'magenta',
                },
            ),
        );
        console.log('\n');

        const { updateExternals } = await prompt({
            type: 'confirm',
            name: 'updateExternals',
            message: 'Would you like to update the externals configuration with these assets?',
            initial: true,
        });

        if (updateExternals) {
            const { selectionMode } = await prompt({
                type: 'select',
                name: 'selectionMode',
                message: 'How would you like to select assets to add?',
                choices: [
                    { title: 'Add all assets', value: 'all' },
                    { title: 'Add none', value: 'none' },
                    { title: 'Select individual assets', value: 'individual' },
                ],
            });

            let selectedAssets: string[] = [];
            if (selectionMode === 'all') {
                selectedAssets = meta.staticAssets;
            } else if (selectionMode === 'individual') {
                const { showDetails } = await prompt({
                    type: 'confirm',
                    name: 'showDetails',
                    message: 'Would you like to see file details (size, type) when selecting files?',
                    initial: true,
                });

                const { showPaths } = await prompt({
                    type: 'confirm',
                    name: 'showPaths',
                    message: 'Would you like to see files grouped by path?',
                    initial: true,
                });

                if (showPaths) {
                    // Group files by directory
                    const filesByDir = meta.staticAssets.reduce((acc, asset) => {
                        const dir = path.dirname(asset);
                        if (!acc[dir]) {
                            acc[dir] = [];
                        }
                        acc[dir].push(asset);
                        return acc;
                    }, {} as Record<string, string[]>);

                    const { assets } = await prompt({
                        type: 'multiselect',
                        name: 'assets',
                        message: 'Select paths to add to externals:',
                        choices: Object.entries(filesByDir).map(([dir, files]) => {
                            const title = showDetails 
                                ? `${dir} (${files.length} files)`
                                : `${dir} (${files.length} files)`;
                            return {
                                title,
                                value: dir,
                                selected: true,
                                description: showDetails 
                                    ? files.map(file => `${path.basename(file)} (${path.extname(file).slice(1)}, ${(fs.statSync(file).size / 1024).toFixed(1)}KB)`).join('\n')
                                    : files.map(file => path.basename(file)).join('\n')
                            };
                        }),
                    });

                    // Flatten the selected directories back into individual files
                    selectedAssets = assets.flatMap((dir: string) => filesByDir[dir]);
                } else {
                    const { assets } = await prompt({
                        type: 'multiselect',
                        name: 'assets',
                        message: 'Select individual files to add to externals:',
                        choices: meta.staticAssets.map(asset => {
                            const title = showDetails 
                                ? `${asset} (${path.extname(asset).slice(1)}, ${(fs.statSync(asset).size / 1024).toFixed(1)}KB)`
                                : asset;
                            return {
                                title,
                                value: asset,
                                selected: true
                            };
                        }),
                    });
                    selectedAssets = assets;
                }
            }

            if (selectedAssets.length > 0) {
                const { useGlob } = await prompt({
                    type: 'confirm',
                    name: 'useGlob',
                    message: 'Would you like to use glob patterns instead of individual file paths?',
                    initial: true,
                });

                let newExternals: string[];
                if (useGlob) {
                    // Group files by extension and create glob patterns
                    const patterns = new Set<string>();
                    selectedAssets.forEach(asset => {
                        const ext = path.extname(asset);
                        const dir = path.dirname(asset);
                        patterns.add(`${dir}/**/*${ext}`);
                    });
                    newExternals = Array.from(patterns);
                } else {
                    newExternals = selectedAssets;
                }

                // Preserve existing externals that don't match the new patterns
                const existingExternals = existingConfig.externals || [];
                const preservedExternals = existingExternals.filter(existing => {
                    if (useGlob) {
                        // If using globs, preserve existing patterns that don't match any of our new patterns
                        return !newExternals.some(newPattern => {
                            const newDir = path.dirname(newPattern);
                            return existing.startsWith(newDir);
                        });
                    } else {
                        // If using individual files, preserve existing entries that aren't in our new list
                        return !newExternals.includes(existing);
                    }
                });

                updatedConfig.externals = [...preservedExternals, ...newExternals];

                // Show what will be added to externals
                console.log(
                    boxen(
                        dedent`The following will be added to externals:
                    ${newExternals.map(ext => `- ${chalk.cyan(ext)}`).join('\n')}
                    
                    The following existing externals will be preserved:
                    ${preservedExternals.length > 0 ? preservedExternals.map(ext => `- ${chalk.green(ext)}`).join('\n') : 'None'}`,
                        {
                            title: '📦 Externals Update',
                            padding: 1,
                            borderStyle: 'double',
                            borderColor: 'yellow',
                        },
                    ),
                );
                console.log('\n');

                const { confirmExternals } = await prompt({
                    type: 'confirm',
                    name: 'confirmExternals',
                    message: 'Do you want to proceed with these externals changes?',
                    initial: true,
                });

                if (!confirmExternals) {
                    updatedConfig.externals = existingExternals;
                }
            }
        }
    }

    fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
    return { path: configPath, config: updatedConfig };
};

const updatePackageJsonScript = async (configPath: string, meta: ProjectMeta) => {
    try {
        // Find the package.json in the Storybook base directory
        const packageJsonPath = path.join(meta.storybookBaseDir, 'package.json');
        
        // If package.json doesn't exist in the Storybook base directory, try the project root
        const rootPackageJsonPath = './package.json';
        const finalPackageJsonPath = fs.existsSync(packageJsonPath) ? packageJsonPath : rootPackageJsonPath;
        
        const packageJsonContent = fs.readFileSync(finalPackageJsonPath, 'utf-8');
        const packageJson = JSON.parse(packageJsonContent);

        // Only update the script if the config file is not at the Storybook base directory
        const projectRoot = process.cwd();
        const configAtBase = path.resolve(configPath) === path.join(projectRoot, meta.storybookBaseDir, 'chromatic.config.json');

        if (!configAtBase) {
            const chromaticScript = packageJson.scripts?.chromatic;
            const relativeConfigPath = path.relative(path.dirname(finalPackageJsonPath), configPath);
            const expectedScript = `chromatic --config-file ${relativeConfigPath}`;
            
            if (!chromaticScript) {
                console.log(
                    boxen(
                        'No "chromatic" script found in package.json.',
                        {
                            title: '⚠️ No Script Found',
                            padding: 1,
                            borderColor: 'yellow',
                            borderStyle: 'double',
                        },
                    ),
                );
                console.log('\n');

                const { addScript } = await prompt({
                    type: 'confirm',
                    name: 'addScript',
                    message: 'Would you like to add a "chromatic" script to package.json?',
                    initial: true,
                });

                if (!addScript) {
                    console.log(
                        boxen(
                            'No changes were made to package.json.',
                            {
                                title: '⚠️ Update Cancelled',
                                padding: 1,
                                borderColor: 'yellow',
                                borderStyle: 'double',
                            },
                        ),
                    );
                    console.log('\n');
                    return;
                }

                packageJson.scripts = {
                    ...packageJson.scripts,
                    chromatic: expectedScript,
                };

                fs.writeFileSync(finalPackageJsonPath, JSON.stringify(packageJson, null, 2));

                console.log(
                    boxen(
                        `📦 Added the "chromatic" script to package.json with --config-file flag`,
                        {
                            title: '✅ Success!',
                            padding: 1,
                            borderColor: 'green',
                            borderStyle: 'double',
                        },
                    ),
                );
                console.log('\n');
            } else {
                // Check if the script already matches what we want
                if (chromaticScript === expectedScript) {
                    console.log(
                        boxen(
                            `The "chromatic" script in package.json already matches the expected configuration.`,
                            {
                                title: 'ℹ️ Script Up to Date',
                                padding: 1,
                                borderColor: 'blue',
                                borderStyle: 'double',
                            },
                        ),
                    );
                    console.log('\n');
                    return;
                }

                // Show what will be updated
                console.log(
                    boxen(
                        dedent`The following change will be made to package.json:
                        Current script: ${chalk.cyan(chromaticScript)}
                        Updated script: ${chalk.green(expectedScript)}`,
                        {
                            title: '📝 Package.json Update',
                            padding: 1,
                            borderStyle: 'double',
                            borderColor: 'yellow',
                        },
                    ),
                );
                console.log('\n');

                const { confirmUpdate } = await prompt({
                    type: 'confirm',
                    name: 'confirmUpdate',
                    message: 'Do you want to proceed with updating the chromatic script?',
                    initial: true,
                });

                if (!confirmUpdate) {
                    console.log(
                        boxen(
                            'No changes were made to package.json.',
                            {
                                title: '⚠️ Update Cancelled',
                                padding: 1,
                                borderColor: 'yellow',
                                borderStyle: 'double',
                            },
                        ),
                    );
                    console.log('\n');
                    return;
                }

                packageJson.scripts = {
                    ...packageJson.scripts,
                    chromatic: expectedScript,
                };

                fs.writeFileSync(finalPackageJsonPath, JSON.stringify(packageJson, null, 2));

                console.log(
                    boxen(
                        `📦 Updated the "chromatic" script in package.json with --config-file flag`,
                        {
                            title: '✅ Success!',
                            padding: 1,
                            borderColor: 'green',
                            borderStyle: 'double',
                        },
                    ),
                );
                console.log('\n');
            }
        }
    } catch (error) {
        console.log(
            boxen(
                `⚠️ Could not update package.json. Please manually add --config-file ${path.relative(process.cwd(), configPath)} to your chromatic script.`,
                {
                    title: 'Warning',
                    padding: 1,
                    borderColor: 'yellow',
                    borderStyle: 'double',
                },
            ),
        );
        console.log('\n');
    }
};

// Should run from project root
const buildConfig = async () => {
    console.log(
        boxen('CLI tool for helping you configure Chromatic Turbosnap for your project', {
            title: '@chromaui/turbosnap-helper',
            titleAlignment: 'center',
            textAlignment: 'center',
            padding: 1,
            borderStyle: 'double',
            borderColor: 'magenta',
        }),
    );
    console.log('\n');

    const manager = JsPackageManagerFactory.getPackageManager();
    const isMonoRepo = manager.isStorybookInMonorepo();

    const storybookDirs = await glob('**/.storybook', { 
        onlyDirectories: true,
        ignore: ['**/node_modules/**']
    });

    if (storybookDirs.length === 0) {
        console.log(
            boxen(
                'No Storybook configuration directories found. Please ensure you are in a Storybook project directory.',
                {
                    title: '⚠️ No Storybook Config Found',
                    padding: 1,
                    borderColor: 'yellow',
                    borderStyle: 'double',
                },
            ),
        );
        process.exit(1);
    }

    // Show all found Storybook projects and let user select one
    console.log(
        boxen(
            `I found ${chalk.cyan(storybookDirs.length)} Storybook ${storybookDirs.length === 1 ? 'project' : 'projects'}.`,
            {
                title: '📚 Storybook Projects',
                padding: 1,
                borderStyle: 'double',
                borderColor: 'magenta',
            },
        ),
    );
    console.log('\n');

    const { selectedProject } = await prompt({
        type: 'select',
        name: 'selectedProject',
        message: 'Which Storybook project would you like to configure?',
        choices: [
            ...storybookDirs.map((dir) => ({ 
                title: dir,
                value: dir,
                description: `Configure Chromatic for ${dir}`
            })),
            { 
                title: 'Exit',
                value: 'exit',
                description: 'Exit the configuration helper'
            }
        ],
    });

    if (selectedProject === 'exit') {
        console.log(
            boxen(
                'Configuration helper exited. No changes were made.',
                {
                    title: '👋 Goodbye!',
                    padding: 1,
                    borderColor: 'blue',
                    borderStyle: 'double',
                },
            ),
        );
        process.exit(0);
    }

    // Process the selected Storybook project
    console.log(
        boxen(
            `Processing Storybook configuration in ${chalk.cyan(selectedProject)}`,
            {
                title: '📝 Storybook Project',
                padding: 1,
                borderStyle: 'double',
                borderColor: 'magenta',
            },
        ),
    );
    console.log('\n');

    const mainConfigPath = findConfigFile('main', selectedProject);
    const mainConfig = await readConfig(mainConfigPath);

    const meta = await buildProjectMeta(manager, mainConfig, selectedProject, '');

    console.log(
        boxen(
            dedent`📙 Storybook Base Directory: ${chalk.cyan(meta.storybookBaseDir)}
        📂 Storybook Config Directory: ${chalk.cyan(meta.storybookConfigDir)}
        📦 Storybook Build Directory: ${chalk.cyan(meta.storybookBuildDir)}
        🧰 Package Manager: ${chalk.green(meta.packageManager)}
        📝 Framework: ${chalk.green(meta.framework)}`,
            {
                title: '📝 Here are your project details',
                padding: 1,
                borderColor: 'green',
                borderStyle: 'double',
            },
        ),
    );

    const chromaticConfig = await findChromaticConfig(selectedProject);
    let finalConfig;

    if (chromaticConfig) {
        finalConfig = await updateChromaticConfig(chromaticConfig.path, chromaticConfig.config, meta);
    } else {
        finalConfig = await createChromaticConfig(meta);
    }

    console.log(
        boxen(
            dedent`✅ Chromatic config ${chalk.cyan(path.relative(process.cwd(), finalConfig.path))} has been ${chromaticConfig ? 'updated' : 'created'} with:
        Project ID: ${chalk.cyan(finalConfig.config.projectId)}
        Base Directory: ${chalk.cyan(finalConfig.config.storybookBaseDir)}
        Config Directory: ${chalk.cyan(finalConfig.config.storybookConfigDir)}
        Build Directory: ${chalk.cyan(finalConfig.config.storybookBuildDir)}`,
            {
                title: '🎉 Success!',
                padding: 1,
                borderColor: 'green',
                borderStyle: 'double',
            },
        ),
    );

    await updatePackageJsonScript(finalConfig.path, meta);

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
            const remainingProjects = storybookDirs.filter(dir => dir !== selectedProject);
            
            const { nextProject } = await prompt({
                type: 'select',
                name: 'nextProject',
                message: 'Which Storybook project would you like to configure next?',
                choices: [
                    ...remainingProjects.map((dir) => ({ 
                        title: dir,
                        value: dir,
                        description: `Configure Chromatic for ${dir}`
                    })),
                    { 
                        title: 'Exit',
                        value: 'exit',
                        description: 'Exit the configuration helper'
                    }
                ],
            });

            if (nextProject !== 'exit') {
                // Recursively call buildConfig with the next project
                await buildConfig();
            }
        }
    }
};

buildConfig()
    .then(() => {
        process.exit(0);
    })
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
