import { glob } from 'fast-glob';
import { prompt } from 'prompts';
import chalk from 'chalk';
import boxen from 'boxen';
import dedent from 'dedent';
import fs from 'fs';
import path from 'path';
import { displayMessage } from './utils';
import { JsPackageManager, JsPackageManagerFactory } from '@storybook/cli';

/**
 * Analyzes a story file for import types
 */
const analyzeStoryFile = async (filePath: string): Promise<{ staticImports: string[]; dynamicImports: string[] }> => {
    const content = fs.readFileSync(filePath, 'utf-8');
    const staticImports: string[] = [];
    const dynamicImports: string[] = [];

    // Match static imports (import ... from ...)
    const staticImportRegex = /import\s+(?:{[^}]*}|[^;]+)\s+from\s+['"]([^'"]+)['"]/g;
    let match;
    while ((match = staticImportRegex.exec(content)) !== null) {
        staticImports.push(match[1]);
    }

    // Match dynamic imports (import(), require())
    const dynamicImportRegex = /(?:import\(|require\(|await\s+import\()\s*['"]([^'"]+)['"]/g;
    while ((match = dynamicImportRegex.exec(content)) !== null) {
        dynamicImports.push(match[1]);
    }

    return { staticImports, dynamicImports };
};

/**
 * Analyze mode for checking story files
 */
export const analyzeMode = async () => {
    displayMessage('Analyzing story files for import types', {
        title: '🔍 Analysis Mode',
        borderColor: 'magenta'
    });

    const manager = JsPackageManagerFactory.getPackageManager() as JsPackageManager;
    const isMonoRepo = manager.isStorybookInMonorepo();

    console.log('Current working directory:', process.cwd());

    // First, try to find Storybook config directories
    const storybookDirs = await glob('**/.storybook', { 
        onlyDirectories: true,
        ignore: ['**/node_modules/**']
    });

    console.log('Found Storybook directories:', storybookDirs);

    // If no Storybook config found, try to find story files directly
    if (storybookDirs.length === 0) {
        console.log('No Storybook directories found, looking for story files directly...');
        const storyFiles = await glob('**/*.stories.{js,jsx,ts,tsx}', {
            ignore: ['**/node_modules/**'],
            cwd: process.cwd()
        });

        console.log('Found story files:', storyFiles);

        if (storyFiles.length > 0) {
            displayMessage(
                `Found ${chalk.cyan(storyFiles.length)} story ${storyFiles.length === 1 ? 'file' : 'files'} directly.`,
                { title: '📚 Story Files', borderColor: 'magenta' }
            );

            // Analyze each story file
            const results = await Promise.all(
                storyFiles.map(async (file) => {
                    const filePath = path.join(process.cwd(), file);
                    console.log('Analyzing file:', filePath);
                    const analysis = await analyzeStoryFile(filePath);
                    return { file, ...analysis };
                })
            );

            displayResults(results);
            process.exit(0);
        }

        displayMessage(
            'No Storybook configuration directories or story files found. Please ensure you are in a Storybook project directory.',
            { title: '⚠️ No Storybook Config Found', borderColor: 'yellow' }
        );
        process.exit(1);
    }

    // Show all found Storybook projects and let user select one
    displayMessage(
        `I found ${chalk.cyan(storybookDirs.length)} Storybook ${storybookDirs.length === 1 ? 'project' : 'projects'}.`,
        { title: '📚 Storybook Projects', borderColor: 'magenta' }
    );

    const { selectedProject } = await prompt({
        type: 'select',
        name: 'selectedProject',
        message: 'Which Storybook project would you like to analyze?',
        choices: [
            ...storybookDirs.map((dir) => ({ 
                title: dir,
                value: dir,
                description: `Analyze stories in ${dir}`
            })),
            { 
                title: 'Exit',
                value: 'exit',
                description: 'Exit the analyzer'
            }
        ],
    });

    if (selectedProject === 'exit') {
        process.exit(0);
    }

    // Get the project root directory (parent of .storybook)
    const projectRoot = path.dirname(selectedProject);

    // Find all story files in the project root
    const projectStoryFiles = await glob('**/*.stories.{js,jsx,ts,tsx}', {
        ignore: ['**/node_modules/**'],
        cwd: projectRoot
    });

    console.log('Found story files in project:', projectStoryFiles);

    if (projectStoryFiles.length === 0) {
        displayMessage(
            'No story files found in the selected project.',
            { title: '⚠️ No Stories Found', borderColor: 'yellow' }
        );
        process.exit(1);
    }

    displayMessage(
        `Found ${chalk.cyan(projectStoryFiles.length)} story ${projectStoryFiles.length === 1 ? 'file' : 'files'} to analyze.`,
        { title: '📚 Story Files', borderColor: 'magenta' }
    );

    // Analyze each story file
    const results = await Promise.all(
        projectStoryFiles.map(async (file) => {
            const filePath = path.join(projectRoot, file);
            console.log('Analyzing file:', filePath);
            const analysis = await analyzeStoryFile(filePath);
            return { file, ...analysis };
        })
    );

    displayResults(results);
    process.exit(0);
};

const displayResults = (results: any[]) => {
    // Display results
    console.log(
        boxen(
            dedent`Analysis Results:
            
            ${results.map(result => {
                const staticCount = result.staticImports.length;
                const dynamicCount = result.dynamicImports.length;
                return `${chalk.cyan(result.file)}:
                Static Imports: ${chalk.green(staticCount)}
                Dynamic Imports: ${chalk.yellow(dynamicCount)}
                ${dynamicCount > 0 ? '⚠️ Contains dynamic imports' : '✅ All imports are static'}
                `;
            }).join('\n')}`,
            {
                title: '📊 Import Analysis',
                padding: 1,
                borderColor: 'green',
                borderStyle: 'double',
            },
        ),
    );

    // Show summary
    const totalStatic = results.reduce((sum, r) => sum + r.staticImports.length, 0);
    const totalDynamic = results.reduce((sum, r) => sum + r.dynamicImports.length, 0);
    const filesWithDynamic = results.filter(r => r.dynamicImports.length > 0).length;

    console.log(
        boxen(
            dedent`Summary:
            Total Files Analyzed: ${chalk.cyan(results.length)}
            Total Static Imports: ${chalk.green(totalStatic)}
            Total Dynamic Imports: ${chalk.yellow(totalDynamic)}
            Files with Dynamic Imports: ${chalk.yellow(filesWithDynamic)}
            ${filesWithDynamic > 0 ? '⚠️ Some files use dynamic imports which may affect Turbosnap' : '✅ All files use static imports'}`,
            {
                title: '📊 Summary',
                padding: 1,
                borderColor: 'green',
                borderStyle: 'double',
            },
        ),
    );
}; 