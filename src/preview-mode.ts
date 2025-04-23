import { glob } from 'fast-glob';
import { prompt } from 'prompts';
import chalk from 'chalk';
import boxen from 'boxen';
import dedent from 'dedent';
import fs from 'fs';
import path from 'path';
import { displayMessage } from './utils';
import { JsPackageManager, JsPackageManagerFactory } from '@storybook/cli';

const IMPORT_THRESHOLD = 10; // Number of imports that could trigger fallback mode
const SHARED_WRAPPER_KEYWORDS = ['wrapper', 'decorator', 'theme', 'provider'];

/**
 * Analyzes a preview file for potential issues
 */
const analyzePreviewFile = async (filePath: string): Promise<{
    totalImports: number;
    hasSharedWrappers: boolean;
    sharedWrapperImports: string[];
    staticImports: string[];
    dynamicImports: string[];
}> => {
    const content = fs.readFileSync(filePath, 'utf-8');
    const staticImports: string[] = [];
    const dynamicImports: string[] = [];
    const sharedWrapperImports: string[] = [];

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

    // Check for shared wrapper/theme imports
    [...staticImports, ...dynamicImports].forEach(imp => {
        if (SHARED_WRAPPER_KEYWORDS.some(keyword => 
            imp.toLowerCase().includes(keyword.toLowerCase())
        )) {
            sharedWrapperImports.push(imp);
        }
    });

    return {
        totalImports: staticImports.length + dynamicImports.length,
        hasSharedWrappers: sharedWrapperImports.length > 0,
        sharedWrapperImports,
        staticImports,
        dynamicImports
    };
};

/**
 * Preview mode for analyzing preview files
 */
export const previewMode = async () => {
    displayMessage('Analyzing preview files for potential issues', {
        title: '🔍 Preview Analysis Mode',
        borderColor: 'magenta'
    });

    const manager = JsPackageManagerFactory.getPackageManager() as JsPackageManager;
    const isMonoRepo = manager.isStorybookInMonorepo();

    // Find Storybook config directories
    const storybookDirs = await glob('**/.storybook', { 
        onlyDirectories: true,
        ignore: ['**/node_modules/**']
    });

    if (storybookDirs.length === 0) {
        displayMessage(
            'No Storybook configuration directories found. Please ensure you are in a Storybook project directory.',
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
                description: `Analyze preview in ${dir}`
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

    // Look for preview files in the .storybook directory
    const previewFiles = await glob('preview.{js,jsx,ts,tsx}', {
        ignore: ['**/node_modules/**'],
        cwd: selectedProject
    });

    if (previewFiles.length === 0) {
        displayMessage(
            'No preview files found in the selected project\'s .storybook directory.',
            { title: '⚠️ No Preview Found', borderColor: 'yellow' }
        );
        process.exit(1);
    }

    // Analyze each preview file
    const results = await Promise.all(
        previewFiles.map(async (file) => {
            const filePath = path.join(selectedProject, file);
            const analysis = await analyzePreviewFile(filePath);
            return { file, ...analysis };
        })
    );

    // Display results
    console.log(
        boxen(
            dedent`Preview Analysis Results:
            
            ${results.map(result => {
                const importWarning = result.totalImports > IMPORT_THRESHOLD 
                    ? `⚠️ High number of imports (${result.totalImports}) that could trigger fallback mode

📦 Why this matters:
TurboSnap treats .storybook/preview.js|ts as a global file that affects all stories.
Any change to a file imported here (or its transitive dependencies) will trigger a full rebuild of all stories — even those that are unrelated.

💡 Recommendations:
- Move frequently changing logic (ex. layout wrappers, dev-only toggles) into wrapper components and import them directly in specific stories that need them.
- Keep your preview file lean — only include stable global config like:
  - ThemeProviders
  - Global styles
  - i18n providers
  - Storybook decorators

✅ Doing this ensures TurboSnap only retests affected stories, keeping your builds faster and more focused.
`
                    : '✅ Import count is within acceptable range';
                
                const wrapperWarning = result.hasSharedWrappers
                    ? dedent`⚠️ Contains shared wrappers/themes:
                        ${result.sharedWrapperImports.map(imp => `- ${imp}`).join('\n                        ')}`
                    : '✅ No shared wrappers/themes detected';

                const importTypeWarning = result.dynamicImports.length > 0
                    ? `⚠️ Contains dynamic imports (${result.dynamicImports.length}):
                        ${result.dynamicImports.map(imp => `- ${imp}`).join('\n                        ')}`
                    : '✅ All imports are static';
                
                return `${chalk.cyan(result.file)}:
                Total Imports: ${chalk.yellow(result.totalImports)}
                ${importWarning}
                ${wrapperWarning}
                ${importTypeWarning}
                `;
            }).join('\n')}`,
            {
                title: '📊 Preview Analysis',
                padding: 1,
                borderColor: 'green',
                borderStyle: 'double',
            },
        ),
    );

    process.exit(0);
}; 