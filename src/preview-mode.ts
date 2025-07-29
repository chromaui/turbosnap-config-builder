import { glob } from 'fast-glob';
import { prompt } from 'prompts';
import chalk from 'chalk';
import boxen from 'boxen';
import dedent from 'dedent';
import fs from 'fs';
import path from 'path';
import { displayMessage } from './utils';

const IMPORT_THRESHOLD = 10; // Number of imports that could trigger fallback mode
const SHARED_WRAPPER_KEYWORDS = ['wrapper', 'decorator', 'theme', 'provider'];

/**
 * Analyzes a preview file for potential issues
 */
const analyzePreviewFile = async (filePath: string, initialRootDir: string): Promise<{
    totalImports: number;
    hasSharedWrappers: boolean;
    sharedWrapperImports: string[];
    staticImports: string[];
    dynamicImports: string[];
    isMonorepo: boolean;
    file: string;
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

    // Match dynamic imports using import(), require(), or await import() syntax
    // This captures the module path from expressions like:
    // import('./foo'), require('./foo'), or await import('./foo')
    const dynamicImportRegex = /(?:import\(|require\(|await\s+import\()\s*['"]([^'"]+)['"]/g;
    while ((match = dynamicImportRegex.exec(content)) !== null) {
        dynamicImports.push(match[1]);
    }

    // Check for imports that may be shared wrappers or theme providers
    // This looks for imports containing keywords like 'wrapper', 'decorator', 'theme', 'provider'
    // These are common patterns that could indicate shared UI context providers or decorators
    // that may need special handling in preview.js
    [...staticImports, ...dynamicImports].forEach(imp => {
        if (SHARED_WRAPPER_KEYWORDS.some(keyword => 
            imp.toLowerCase().includes(keyword.toLowerCase())
        )) {
            sharedWrapperImports.push(imp);
        }
    });

    // Check if this is in a monorepo by looking for package.json in parent directories
    const isMonorepo = (() => {
        let currentDir = initialRootDir;
        const packageJsonPath = path.join(currentDir, 'package.json');
        console.log(`Checking for package.json at: ${packageJsonPath}`);
        
        if (fs.existsSync(packageJsonPath)) {
            try {
                const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
                console.log(`Found package.json with workspaces:`, packageJson.workspaces);
                return packageJson.workspaces !== undefined;
            } catch (error) {
                console.error(`Error reading package.json at ${packageJsonPath}:`, error);
            }
        }
        return false;
    })();

    return {
        totalImports: staticImports.length + dynamicImports.length,
        hasSharedWrappers: sharedWrapperImports.length > 0,
        sharedWrapperImports,
        staticImports,
        dynamicImports,
        isMonorepo,
        file: path.basename(filePath)
    };
};

/**
 * Preview mode for analyzing preview files
 */
export const previewMode = async () => {
    // Store the initial root directory before any directory changes
    const initialRootDir = process.cwd();
    
    displayMessage('Analyzing preview files for potential issues', {
        title: '🔍 Preview Analysis Mode',
        borderColor: 'magenta'
    });

    // Find Storybook config directories
    const storybookDirs = await glob('**/.storybook', { 
        onlyDirectories: true,
        ignore: ['**/node_modules/**']
    });

    if (storybookDirs.length === 0) {
        displayMessage(
            'No Storybook configuration directories found. Please ensure you are in a Storybook project directory.',
            { title: '🚨 No Storybook Config Found', borderColor: 'yellow' }
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
            { title: '🚨 No Preview Found', borderColor: 'yellow' }
        );
        process.exit(1);
    }

    // Analyze each preview file
    const results = await Promise.all(
        previewFiles.map(async (file) => {
            const filePath = path.join(selectedProject, file);
            const analysis = await analyzePreviewFile(filePath, initialRootDir);
            return { file, ...analysis };
        })
    );

    // Display results
    // Results are displayed in nested boxens to make the output more readable
    // Using dedent to ensure we can break the string into multiple lines
    // Use alerts opposed to warnings to avoid boxen breaking the output
    console.log(
        boxen(
            dedent`Preview Analysis Results:
            
            ${results.map(result => {
                const monorepoWarning = result.isMonorepo
                    ? boxen(
                        dedent`🚨 Monorepo detected - be careful with shared imports in preview files

📦 Why this matters:
In a monorepo, preview files often pull in shared packages (like @org/theme, @org/ui, etc.).
These packages are often:
- under active development
- tightly coupled to other packages
- shared across apps and Storybooks

💥 Any change to a file imported in a preview file - even deep within a shared package - triggers
TurboSnap to fallback and rebuild all stories.

💡 Recommendations:
- Consider creating local preview files per project, rather than a single root preview
- Keep preview limited to stable, shared visual config (themes, styles, etc.)
- Avoid importing high-churn shared code (utils, dev mocks, layouts)
- Import shared wrappers in story-level decorators, not preview file

✅ This helps maintain consistency and reduces maintenance overhead across packages`,
                        {
                            title: '🚨 Monorepo Configuration Warning',
                            titleAlignment: 'center',
                            padding: 1,
                            borderColor: 'yellow',
                            borderStyle: 'doubleSingle',
                            margin: { top: 1, bottom: 1 }
                        }
                    )
                    : '';
                const importWarning = result.totalImports > IMPORT_THRESHOLD 
                    ? boxen(
                        dedent`🚨 High number of imports (${result.totalImports}) that could trigger fallback mode (full rebuild)

📦 Why this matters:
TurboSnap treats .storybook/preview.js|ts as a global file that affects all stories.
Any change to a file imported here (or its transitive dependencies) will trigger 
a full rebuild of all stories — even those that are unrelated.

💥 More imports = more chances that a small change (ex. a utility tweak or CSS update) 
will cause all stories to be retested, even when most aren't affected.

💡 Recommendations:
- Limit your preview file to stable, foundational setup:
  - ThemeProvider
  - GlobalStyles
  - i18n setup
- Move layout components, feature flags, mock handlers, or experimental decorators into specific 
  stories instead of preview-level config.
- Consider consolidating redundant CSS or utility imports if possible

✅ Doing this ensures TurboSnap only retests affected stories, keeping your builds faster and more focused.`,
                        {
                            title: '🚨 Import Count Warning',
                            titleAlignment: 'center',
                            padding: 1,
                            borderColor: 'red',
                            borderStyle: 'doubleSingle',
                            margin: { top: 1, bottom: 1 }
                        }
                    )
                    : boxen('✅ Import count is within acceptable range', {
                        padding: 1,
                        borderColor: 'green',
                        borderStyle: 'doubleSingle',
                        margin: { top: 1, bottom: 1 }
                    });
                
                const wrapperWarning = result.hasSharedWrappers
                    ? boxen(
                        dedent`🚨 Contains shared wrappers/themes:
                        ${result.sharedWrapperImports.map(imp => `- ${imp}`).join('\n                        ')}

📦 Why this matters:
TurboSnap treats .storybook/preview.js|ts as a global file that affects all stories.
Any change to a file imported here (or its transitive dependencies) will trigger 
a full rebuild of all stories — even those that are unrelated.        
                        
🎯 Best Practice:
- Keep stable wrappers like ThemeProvider, i18n, or GlobalStyles in the preview file.
- Move wrappers that are:
  - still under development
  - feature-flag dependent
  - layout-specific
  - frequently changing (ex. toggles, responsive containers)
...into individual stories or decorators.`,
                        {
                            title: '🚨 Shared Wrappers Warning',
                            titleAlignment: 'center',
                            padding: 1,
                            borderColor: 'yellow',
                            borderStyle: 'doubleSingle',
                            margin: { top: 1, bottom: 1 }
                        }
                    )
                    : boxen('✅ No shared wrappers/themes detected', {
                        padding: 1,
                        borderColor: 'green',
                        borderStyle: 'doubleSingle',
                        margin: { top: 1, bottom: 1 }
                    });

                const importTypeWarning = result.dynamicImports.length > 0
                    ? boxen(
                        dedent`🚨 Contains dynamic imports (${result.dynamicImports.length}):
                        ${result.dynamicImports.map(imp => `- ${imp}`).join('\n                        ')}
                        
📦 Why this matters:
TurboSnap analyzes static imports in your preview file to determine which stories are affected by a change. 
Dynamic imports (import() or require() with variables or conditions):
- Cannot be reliably traced in the build dependency graph
- May prevent TurboSnap from detecting changes correctly
- Can result in missed visual changes or unexpected full rebuilds

💡 Recommendations:
- If dynamic behavior is essential, move the logic into story-level decorators 
  or within the component itself, not the preview file.
- Convert dynamic imports to static imports where possible:
  ❌ const ThemeProvider = require('../themes/default/ThemeProvider');
  ✅ import { ThemeProvider } from '../themes/default/ThemeProvider';`,
                        {
                            title: '🚨 Dynamic Imports Warning',
                            titleAlignment: 'center',
                            padding: 1,
                            borderColor: 'magenta',
                            borderStyle: 'doubleSingle',
                            margin: { top: 1, bottom: 1 }
                        }
                    )
                    : boxen('✅ All imports are static', {
                        padding: 1,
                        borderColor: 'green',
                        borderStyle: 'doubleSingle',
                        margin: { top: 1, bottom: 1 }
                    });
                
                return `${chalk.cyan(result.file)}:
                Total Imports: ${chalk.yellow(result.totalImports)}
                ${monorepoWarning}
                ${importWarning}
                ${wrapperWarning}
                ${importTypeWarning}
                `;
            }).join('\n')}`,
            {
                title: '📊 Preview Analysis',
                titleAlignment: 'center',
                padding: 1,
                borderColor: 'green',
                borderStyle: 'singleDouble',
            },
        ),
    );

    process.exit(0);
}; 