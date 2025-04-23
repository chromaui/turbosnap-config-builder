import { glob } from 'fast-glob';
import path from 'path';
import { prompt } from 'prompts';
import { displayMessage } from './utils';
import chalk from 'chalk';

interface StaticAssetsResult {
    projectAssets: string[];
    repoAssets: string[];
}

/**
 * Finds static assets in both project and repository root
 */
export const findStaticAssets = async (projectRoot: string, repoRoot: string): Promise<StaticAssetsResult> => {
    // Common static asset patterns
    const patterns = [
        '**/*.{png,jpg,jpeg,gif,svg,ico,webp}',
        '**/*.{woff,woff2,ttf,otf,eot}',
        '**/*.{css,scss,sass}',
    ];

    // Search for static assets in project root
    const projectAssets = await glob(patterns, {
        cwd: projectRoot,
        ignore: ['**/node_modules/**', '**/dist/**', '**/.storybook/**'],
        absolute: true,
    });

    // Search for static assets in repository root
    const repoAssets = await glob(patterns, {
        cwd: repoRoot,
        ignore: ['**/node_modules/**', '**/dist/**', '**/.storybook/**'],
        absolute: true,
    });

    return {
        projectAssets,
        repoAssets,
    };
};

/**
 * Prompts user to review and select assets
 */
const reviewAssets = async (assets: string[], baseDir: string, source: string): Promise<string[]> => {
    if (assets.length === 0) return [];

    const { reviewType } = await prompt({
        type: 'select',
        name: 'reviewType',
        message: `How would you like to review ${source} assets?`,
        choices: [
            { title: 'Review individual files', value: 'individual' },
            { title: 'Review by file path', value: 'path' },
        ],
    });

    if (reviewType === 'individual') {
        const { selectedAssets } = await prompt({
            type: 'multiselect',
            name: 'selectedAssets',
            message: 'Select assets to add:',
            choices: assets.map(asset => ({
                title: path.relative(baseDir, asset),
                value: asset,
                selected: true,
            })),
        });
        return selectedAssets;
    } else {
        // Group assets by directory
        const groupedAssets = assets.reduce((acc, asset) => {
            const dir = path.dirname(path.relative(baseDir, asset));
            if (!acc[dir]) {
                acc[dir] = [];
            }
            acc[dir].push(asset);
            return acc;
        }, {} as Record<string, string[]>);

        const { selectedPaths } = await prompt({
            type: 'multiselect',
            name: 'selectedPaths',
            message: 'Select directories to add:',
            choices: Object.entries(groupedAssets).map(([dir, files]) => ({
                title: `${dir} (${files.length} files)`,
                value: dir,
                selected: true,
            })),
        });

        return assets.filter(asset => 
            selectedPaths.some((dir: string) => 
                path.relative(baseDir, asset).startsWith(dir)
            )
        );
    }
};

/**
 * Prompts user to add static assets to externals configuration
 */
export const promptForStaticAssets = async (
    assets: StaticAssetsResult,
    projectRoot: string,
    repoRoot: string
): Promise<string[]> => {
    if (assets.projectAssets.length === 0 && assets.repoAssets.length === 0) {
        return [];
    }

    displayMessage(
        `Found ${chalk.cyan(assets.projectAssets.length)} static assets in your project and ${chalk.cyan(assets.repoAssets.length)} in the repository root.`,
        { title: '📦 Static Assets Found', borderColor: 'yellow' }
    );

    const { addStaticAssets } = await prompt({
        type: 'confirm',
        name: 'addStaticAssets',
        message: 'Would you like to add static assets to the externals configuration?',
        initial: true,
    });

    if (!addStaticAssets) {
        return [];
    }

    let selectedAssets: string[] = [];

    // Ask which level of assets to review
    const { assetLevel } = await prompt({
        type: 'select',
        name: 'assetLevel',
        message: 'Which assets would you like to review?',
        choices: [
            { title: `Project-level assets (${assets.projectAssets.length} files)`, value: 'project' },
            { title: `Repository root assets (${assets.repoAssets.length} files)`, value: 'repo' },
            { title: 'Both project and repository root assets', value: 'both' },
        ],
    });

    // Handle project assets
    if (assetLevel === 'project' || assetLevel === 'both') {
        if (assets.projectAssets.length > 0) {
            const projectSelected = await reviewAssets(assets.projectAssets, projectRoot, 'project');
            selectedAssets.push(...projectSelected);
        } else {
            displayMessage(
                'No project-level assets found.',
                { title: '⚠️ Warning', borderColor: 'yellow' }
            );
        }
    }

    // Handle repository assets
    if (assetLevel === 'repo' || assetLevel === 'both') {
        if (assets.repoAssets.length > 0) {
            const repoSelected = await reviewAssets(assets.repoAssets, repoRoot, 'repository');
            selectedAssets.push(...repoSelected);
        } else {
            displayMessage(
                'No repository-level assets found.',
                { title: '⚠️ Warning', borderColor: 'yellow' }
            );
        }
    }

    if (selectedAssets.length === 0) {
        return [];
    }

    const { assetType } = await prompt({
        type: 'select',
        name: 'assetType',
        message: 'How would you like to add the selected assets to externals?',
        choices: [
            { title: 'Individual file paths', value: 'individual' },
            { title: 'Glob patterns', value: 'glob' },
        ],
    });

    if (assetType === 'individual') {
        return selectedAssets.map(asset => path.relative(projectRoot, asset));
    } else {
        // Group assets by extension
        const groupedAssets = selectedAssets.reduce((acc, asset) => {
            const ext = path.extname(asset).slice(1);
            if (!acc[ext]) {
                acc[ext] = [];
            }
            acc[ext].push(asset);
            return acc;
        }, {} as Record<string, string[]>);

        // Create glob patterns for each extension
        return Object.entries(groupedAssets).map(([ext, files]) => {
            const commonPath = findCommonPath(files);
            return path.relative(projectRoot, `${commonPath}**/*.${ext}`);
        });
    }
};

/**
 * Finds the longest common path prefix among an array of paths
 */
const findCommonPath = (paths: string[]): string => {
    if (paths.length === 0) return '';
    
    const parts = paths.map(p => p.split(path.sep));
    const minLength = Math.min(...parts.map(p => p.length));
    
    let commonPath = '';
    for (let i = 0; i < minLength; i++) {
        const current = parts[0][i];
        if (parts.every(p => p[i] === current)) {
            commonPath += current + path.sep;
        } else {
            break;
        }
    }
    
    return commonPath;
}; 