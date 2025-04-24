import { glob } from 'fast-glob';
import { prompt } from 'prompts';
import chalk from 'chalk';
import boxen from 'boxen';
import dedent from 'dedent';
import fs from 'fs';
import path from 'path';
import { displayMessage } from './utils';

/**
 * Analyzes a story file for import types
 */
const analyzeStoryFile = async (filePath: string): Promise<{ 
    staticImports: string[]; 
    dynamicImports: string[]; 
    componentFile?: string;
    componentAnalysis?: { staticImports: string[]; dynamicImports: string[] };
}> => {
    const content = fs.readFileSync(filePath, 'utf-8');
    let componentFile: string | undefined;

    // Get imports from analyzeFile
    const { staticImports, dynamicImports } = await analyzeFile(filePath);

    // Hack to try to find the component file using the meta.component property
    const componentMatch = content.match(/component:\s*([^,}\n]+)/);
    if (componentMatch) {
        const componentName = componentMatch[1].trim();
        // Find the import statement for this component
        const componentImportMatch = content.match(new RegExp(`import\\s+{[^}]*\\b${componentName}\\b[^}]*}\\s+from\\s+['"]([^'"]+)['"]`));
        
        if (componentImportMatch) {
            const importPath = componentImportMatch[1];
            const storyDir = path.dirname(filePath);
            const possibleComponentPaths = [
                path.join(storyDir, `${importPath}.{js,jsx,ts,tsx}`),
                path.join(storyDir, `${importPath}/index.{js,jsx,ts,tsx}`),
            ];

            for (const pattern of possibleComponentPaths) {
                const matches = await glob(pattern, { 
                    ignore: ['**/node_modules/**'],
                    cwd: process.cwd()
                });
                if (matches.length > 0) {
                    componentFile = matches[0];
                    break;
                }
            }
        }
    }

    let componentAnalysis;
    if (componentFile) {
        componentAnalysis = await analyzeFile(componentFile);
    }

    return { staticImports, dynamicImports, componentFile, componentAnalysis };
};

const analyzeFile = async (filePath: string): Promise<{ staticImports: string[]; dynamicImports: string[] }> => {
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
                { title: '📚 Story Files', borderColor: 'magenta', titleAlignment: 'center' }
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
            { title: '❌ No Storybook Config Found', borderColor: 'yellow' }
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
            { title: '❌ No Stories Found', borderColor: 'yellow' }
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
    const filesWithDynamicImports = results.filter(result => 
        result.dynamicImports.length > 0 || 
        (result.componentAnalysis && result.componentAnalysis.dynamicImports.length > 0)
    );

    if (filesWithDynamicImports.length === 0) {
        console.log(
            boxen(
                '✅ No files with dynamic imports found!',
                {
                    title: '📊 Import Analysis',
                    titleAlignment: 'center',
                    padding: 1,
                    borderColor: 'green',
                    borderStyle: 'double',
                },
            ),
        );
        return;
    }

    // Group files by type
    const storyFiles = filesWithDynamicImports.filter(r => r.dynamicImports.length > 0);
    const componentFiles = filesWithDynamicImports.filter(r => 
        r.componentAnalysis && r.componentAnalysis.dynamicImports.length > 0
    );

    let output = 'Analysis Results:\n\n';

    if (storyFiles.length > 0) {
        output += `${chalk.bold('Story Files with Dynamic Imports:')}\n`;
        output += storyFiles.map(result => {
            return `${chalk.cyan(result.file)}:
            Static Imports: ${chalk.green(result.staticImports.length)}
            Dynamic Imports: ${chalk.yellow(result.dynamicImports.length)}`;
        }).join('\n');
        output += '\n\n';
        output += `🚨 Using dynamic imports in stories can result in missed changes or rebuilds

If your story file is relying on dynamic imports, TurboSnap won't know when these imports
have changed. In some cases, TurboSnap may be unable to trace the changes to any story files
and will fallback to a full rebuild.`;
        output += '\n\n\n';
    }

    if (componentFiles.length > 0) {
        output += `${chalk.bold('Component Files with Dynamic Imports:')}\n`;
        output += componentFiles.map(result => {
            return `${chalk.cyan(result.componentFile)}:
            Static Imports: ${chalk.green(result.componentAnalysis.staticImports.length)}
            Dynamic Imports: ${chalk.yellow(result.componentAnalysis.dynamicImports.length)}`;
        }).join('\n');
        output += '\n\n';
        output += `🚨 Using dynamic imports in components can result in missed changes
        
Regressions from dynamically imported files could go untested, reducing your coverage.
If the dynamically loaded components affect layout or style, consider changing the import
to a static import or flagging it with --externals to ensure changes are tested.`;
    }

    console.log(
        boxen(
            output,
            {
                title: '📊 Import Analysis',
                titleAlignment: 'center',
                padding: 1,
                borderColor: 'yellow',
                borderStyle: 'double',
            },
        ),
    );

    // Show summary
    const totalStoryStatic = results.reduce((sum, r) => sum + r.staticImports.length, 0);
    const totalStoryDynamic = results.reduce((sum, r) => sum + r.dynamicImports.length, 0);
    const totalComponentStatic = results.reduce((sum, r) => 
        sum + (r.componentAnalysis ? r.componentAnalysis.staticImports.length : 0), 0);
    const totalComponentDynamic = results.reduce((sum, r) => 
        sum + (r.componentAnalysis ? r.componentAnalysis.dynamicImports.length : 0), 0);

    console.log(
        boxen(
            dedent`Summary:
            Total Files Analyzed: ${chalk.cyan(results.length)}
            
            Story Files:
            Total Static Imports: ${chalk.green(totalStoryStatic)}
            Total Dynamic Imports: ${chalk.yellow(totalStoryDynamic)}
            Files with Dynamic Imports: ${chalk.yellow(storyFiles.length)}
            
            Component Files:
            Total Static Imports: ${chalk.green(totalComponentStatic)}
            Total Dynamic Imports: ${chalk.yellow(totalComponentDynamic)}
            Files with Dynamic Imports: ${chalk.yellow(componentFiles.length)}
            
            ${(totalStoryDynamic + totalComponentDynamic) > 0 ? 
                dedent`🚨 Some files use dynamic imports which may affect Turbosnap

                TurboSnap does not follow runtime logic.
                TurboSnap relies on statically tracing imports to generate optimized snapshots.
                Using dynamic imports may result in missed visual changes or, in some cases,
                TurboSnap may fallback to full rebuilds when it can't determine impacted stories.
                
                🎯 For an optimized TurboSnap build, stick with static imports.` : 
                '✅ All files use static imports'}`,
            {
                title: '📊 Summary',
                titleAlignment: 'center',
                padding: 1,
                borderColor: 'green',
                borderStyle: 'double',
            },
        ),
    );
}; 