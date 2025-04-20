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
    const storybookDirectories = await glob('**/.storybook', { onlyDirectories: true });

    if (storybookDirectories.length === 1) {
        return storybookDirectories[0];
    }

    console.log(
        boxen(
            `I found multiple ${chalk.cyan.bold(
                '.storybook',
            )} directories. Please select which Storybook you'd like help with. `,
            {
                title: '💬 I need your help!',
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
        choices: storybookDirectories.map((dir) => ({ title: dir, value: dir })),
    });

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

const findChromaticConfig = async (): Promise<{ path: string; config: ChromaticConfig } | null> => {
    const configFiles = await glob('**/chromatic.config.{js,json}', { ignore: ['**/node_modules/**'] });
    
    if (configFiles.length === 0) {
        return null;
    }

    if (configFiles.length === 1) {
        const configPath = configFiles[0];
        const configContent = fs.readFileSync(configPath, 'utf-8');
        const config = JSON.parse(configContent);
        return { path: configPath, config };
    }

    console.log(
        boxen(
            `I found multiple Chromatic config files. Please select which one you'd like to use.`,
            {
                title: '💬 I need your help!',
                padding: 1,
                borderStyle: 'double',
                borderColor: 'yellow',
            },
        ),
    );
    console.log('\n');

    const { configFile } = await prompt({
        type: 'select',
        name: 'configFile',
        message: 'Which Chromatic config file would you like to use?',
        choices: configFiles.map((file) => ({ title: file, value: file })),
    });

    const configContent = fs.readFileSync(configFile, 'utf-8');
    const config = JSON.parse(configContent);
    return { path: configFile, config };
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

    const { projectId } = await prompt({
        type: 'text',
        name: 'projectId',
        message: 'What is your Chromatic project ID? (format: Project:<ID>)',
        validate: (value: string) => value.startsWith('Project:') || 'Project ID must start with "Project:"',
    });

    const { customPath } = await prompt({
        type: 'confirm',
        name: 'customPath',
        message: 'Would you like to use a custom path for the config file?',
        initial: false,
    });

    let configPath = './chromatic.config.json';
    if (customPath) {
        const { path } = await prompt({
            type: 'text',
            name: 'path',
            message: 'Enter the path for the config file:',
            initial: './chromatic.config.json',
        });
        configPath = path;
    }

    const config: ChromaticConfig = {
        $schema: 'https://www.chromatic.com/config-file.schema.json',
        projectId,
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

        const { addExternals } = await prompt({
            type: 'confirm',
            name: 'addExternals',
            message: 'Would you like to add these assets to the externals configuration?',
            initial: true,
        });

        if (addExternals) {
            const { useGlob } = await prompt({
                type: 'confirm',
                name: 'useGlob',
                message: 'Would you like to use glob patterns instead of individual file paths?',
                initial: true,
            });

            if (useGlob) {
                // Group files by extension and create glob patterns
                const patterns = new Set<string>();
                meta.staticAssets.forEach(asset => {
                    const ext = path.extname(asset);
                    const dir = path.dirname(asset);
                    patterns.add(`${dir}/**/*${ext}`);
                });
                config.externals = Array.from(patterns);
            } else {
                config.externals = meta.staticAssets;
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

    if (shouldUpdate) {
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
                const { useGlob } = await prompt({
                    type: 'confirm',
                    name: 'useGlob',
                    message: 'Would you like to use glob patterns instead of individual file paths?',
                    initial: true,
                });

                if (useGlob) {
                    // Group files by extension and create glob patterns
                    const patterns = new Set<string>();
                    meta.staticAssets.forEach(asset => {
                        const ext = path.extname(asset);
                        const dir = path.dirname(asset);
                        patterns.add(`${dir}/**/*${ext}`);
                    });
                    updatedConfig.externals = Array.from(patterns);
                } else {
                    updatedConfig.externals = meta.staticAssets;
                }

                // Show what will be added to externals
                console.log(
                    boxen(
                        dedent`The following will be added to externals:
                    ${updatedConfig.externals.map(ext => `- ${chalk.cyan(ext)}`).join('\n')}`,
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
                    message: 'Do you want to proceed with adding these to externals?',
                    initial: true,
                });

                if (!confirmExternals) {
                    delete updatedConfig.externals;
                }
            }
        }

        fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2));
        return { path: configPath, config: updatedConfig };
    }

    return { path: configPath, config: existingConfig };
};

const updatePackageJsonScript = async (configPath: string) => {
    try {
        const packageJsonPath = './package.json';
        const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8');
        const packageJson = JSON.parse(packageJsonContent);

        // If the config path is not the default, update the chromatic script
        if (configPath !== './chromatic.config.json') {
            const chromaticScript = packageJson.scripts?.chromatic || 'chromatic';
            
            // Split the script into command and flags
            const [command, ...flags] = chromaticScript.split(/\s+/);
            
            // Find and update or add the config-file flag
            const existingConfigFileIndex = flags.findIndex((flag: string) => flag.startsWith('--config-file'));
            
            if (existingConfigFileIndex !== -1) {
                // Replace the existing config-file flag and its value
                flags[existingConfigFileIndex] = '--config-file';
                flags[existingConfigFileIndex + 1] = configPath;
            } else {
                // Add the new config-file flag
                flags.push('--config-file', configPath);
            }
            
            // Reconstruct the script
            const updatedScript = [command, ...flags].join(' ');

            // Show what will be updated
            console.log(
                boxen(
                    dedent`The following change will be made to package.json:
                    Current script: ${chalk.cyan(chromaticScript)}
                    Updated script: ${chalk.green(updatedScript)}`,
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
                chromatic: updatedScript,
            };

            fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));

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
    } catch (error) {
        console.log(
            boxen(
                `⚠️ Could not update package.json. Please manually add --config-file ${configPath} to your chromatic script.`,
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

    const configDir = await getStorybookConfigPath();
    const mainConfigPath = findConfigFile('main', configDir);
    const mainConfig = await readConfig(mainConfigPath);

    const meta = await buildProjectMeta(manager, mainConfig, configDir, '');

    console.log(
        boxen(
            dedent`📙 Storybook Base Directory: ${chalk.cyan(meta.storybookBaseDir)}
        📂 Storybook Config Directory: ${chalk.cyan(meta.storybookConfigDir)}
        📦 Storybook Build Directory: ${chalk.cyan(meta.storybookBuildDir)}
        🧰 Package Manager: ${chalk.green(meta.packageManager)}
        📝 Framework: ${meta.framework}`,
            {
                title: '📝 Here are your project details',
                padding: 1,
                borderColor: 'green',
                borderStyle: 'double',
            },
        ),
    );

    const chromaticConfig = await findChromaticConfig();
    let finalConfig;

    if (chromaticConfig) {
        finalConfig = await updateChromaticConfig(chromaticConfig.path, chromaticConfig.config, meta);
    } else {
        finalConfig = await createChromaticConfig(meta);
    }

    console.log(
        boxen(
            dedent`✅ Chromatic config ${chalk.cyan(finalConfig.path)} has been ${chromaticConfig ? 'updated' : 'created'} with:
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

    await updatePackageJsonScript(finalConfig.path);
};

buildConfig()
    .then(() => {
        process.exit(0);
    })
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
