import { ProjectMeta } from './types';
import { displayMessage } from './utils';
import { prompt } from 'prompts';
import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import dedent from 'dedent';

/**
 * Updates the package.json script to use the Chromatic config file
 */
export const updatePackageJsonScript = async (configPath: string, meta: ProjectMeta): Promise<{ path: string; content: any } | null> => {
    const packageJsonPath = path.join(meta.storybookBaseDir, 'package.json');
    if (!fs.existsSync(packageJsonPath)) {
        displayMessage(
            'No package.json found in the project directory.',
            { title: '⚠️ Warning', borderColor: 'yellow' }
        );
        return null;
    }

    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    const relativeConfigPath = path.relative(meta.storybookBaseDir, configPath);
    const configFlag = `--config-file '${relativeConfigPath}'`;

    // Find existing Chromatic scripts
    const chromaticScripts = Object.entries(packageJson.scripts || {})
        .filter(([name]) => name.toLowerCase().includes('chromatic'));

    if (chromaticScripts.length > 0) {
        displayMessage(
            `Found ${chalk.cyan(chromaticScripts.length)} Chromatic ${chromaticScripts.length === 1 ? 'script' : 'scripts'} in package.json.`,
            { title: '📝 Package.json Scripts', borderColor: 'magenta' }
        );

        let hasChanges = false;

        // Check each script for config file flag
        for (const [name, script] of chromaticScripts) {
            if (typeof script !== 'string') continue;

            const hasConfigFlag = script.includes('--config-file');
            if (!hasConfigFlag) {
                // Script exists but no config file flag - add it
                packageJson.scripts[name] = `${script} ${configFlag}`;
                hasChanges = true;
            } else {
                // Script has config file flag - display current and suggested values
                const currentConfigPath = script.match(/--config-file\s+'([^']+)'/)?.[1];
                displayMessage(
                    dedent`Current script "${name}":
                    ${chalk.yellow(script)}
                    
                    Suggested config file flag:
                    ${chalk.green(configFlag)}
                    
                    ${currentConfigPath !== relativeConfigPath ? 
                        chalk.yellow('⚠️ The config file paths are different. You may want to update your script.') : 
                        chalk.green('✅ The config file paths match.')}`,
                    { title: '📝 Script Details', borderColor: 'blue' }
                );
            }
        }

        if (hasChanges) {
            return {
                path: packageJsonPath,
                content: packageJson
            };
        }
    } else {
        // No Chromatic scripts found - add one
        const { addScript } = await prompt({
            type: 'confirm',
            name: 'addScript',
            message: 'Would you like to add a Chromatic script to package.json?',
            initial: true,
        });

        if (addScript) {
            const { scriptName } = await prompt({
                type: 'text',
                name: 'scriptName',
                message: 'What would you like to name the script?',
                initial: 'chromatic',
            });

            if (!packageJson.scripts) {
                packageJson.scripts = {};
            }

            packageJson.scripts[scriptName] = `chromatic ${configFlag}`;
            return {
                path: packageJsonPath,
                content: packageJson
            };
        }
    }

    return null;
}; 