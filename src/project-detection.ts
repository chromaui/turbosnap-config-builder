import { glob } from 'fast-glob';
import { prompt } from 'prompts';
import { ProjectMeta } from './types';
import { normalizeManagerName, pluckFrameworkFromRawContents, displayMessage, exitWithMessage } from './utils';
import { findStaticAssets } from './static-assets';
import chalk from 'chalk';

/**
 * Finds all Storybook configuration directories in the project
 */
export const getStorybookConfigPath = async (): Promise<string> => {
    const storybookDirectories = await glob('**/.storybook', {
        onlyDirectories: true,
        ignore: ['**/node_modules/**'],
    });

    if (storybookDirectories.length === 0) {
        displayMessage(
            'No Storybook configuration directories found. Please ensure you are in a Storybook project directory.',
            { title: '❌ No Storybook Config Found', borderColor: 'yellow' },
        );
        process.exit(1);
    }

    if (storybookDirectories.length === 1) {
        return storybookDirectories[0];
    }

    displayMessage(
        `I found ${chalk.cyan.bold(
            storybookDirectories.length,
        )} Storybook configuration directories. Please select which Storybook you'd like help with.`,
        { title: '💬 I need your help!', borderColor: 'yellow' },
    );

    const { configDir } = await prompt({
        type: 'select',
        name: 'configDir',
        message: 'Which directory is your Storybook config in?',
        choices: [...storybookDirectories.map((dir) => ({ title: dir, value: dir })), { title: 'Exit', value: 'exit' }],
    });

    if (configDir === 'exit') {
        exitWithMessage();
    }

    return configDir;
};

/**
 * Builds project metadata from Storybook configuration
 */
export const buildProjectMeta = async (
    packageManager: any,
    mainConfig: any,
    configDir: string,
    ciEnv: string,
): Promise<ProjectMeta> => {
    // framework detection using three fallback methods
    const frameworkValue =
        mainConfig.getSafeFieldValue(['framework']) || // looks for field named framework in main SB config
        pluckFrameworkFromRawContents(mainConfig) || // extracts patterns like @storybook/ from raw config contents
        mainConfig.getNameFromPath(['framework']); // get framework name from path structure; last resort, other two should cover

    const projectRoot = process.cwd();
    const storybookBaseDir = `./${configDir}`.replace('/.storybook', '');

    // adding projectRoot twice to fix linter errors for staticAssets
    const staticAssetsResult = await findStaticAssets(projectRoot, projectRoot);
    const staticAssets = [...staticAssetsResult.projectAssets, ...staticAssetsResult.repoAssets];

    return {
        storybookBaseDir,
        storybookConfigDir: `./${configDir}`,
        storybookBuildDir: `./${mainConfig.getSafeFieldValue(['buildDir']) || 'storybook-static'}`,
        packageManager: normalizeManagerName(packageManager.type),
        isMonoRepo: packageManager.isStorybookInMonorepo(),
        framework: frameworkValue,
        ciEnv,
        staticAssets,
    };
};
