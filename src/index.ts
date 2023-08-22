import { JsPackageManager, JsPackageManagerFactory, PackageManagerName } from '@storybook/cli';
import { findConfigFile } from '@storybook/core-common';
import { ConfigFile, readConfig } from '@storybook/csf-tools';
import { glob } from 'fast-glob';
import { prompt } from 'prompts';
import boxen from 'boxen';
import chalk from 'chalk';
import dedent from 'dedent';

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

const buildProjectMeta = (
    packageManager: JsPackageManager,
    mainConfig: ConfigFile,
    configDir: string,
    ciEnv: string,
) => {
    let frameworkValue = mainConfig.getSafeFieldValue(['framework']);

    frameworkValue = !frameworkValue
        ? pluckFrameworkFromRawContents(mainConfig)
        : mainConfig.getNameFromPath(['framework']);

    return {
        storybookBaseDir: `./${configDir}`.replace('/.storybook', ''),
        storybookConfigDir: `./${configDir}`,
        packageManager: normalizeManagerName(packageManager.type),
        isMonoRepo: packageManager.isStorybookInMonorepo(),
        framework: frameworkValue,
        ciEnv,
    };
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

    // TODO: Ask for CI Env to format turbosnap output
    // const { ciEnv } = await prompt({
    //     type: 'select',
    //     name: 'ciEnv',
    //     message: 'What CI environment are you using?',
    //     choices: [
    //         { title: 'Azure Pipelines', value: 'azure' },
    //         { title: 'Bitbucket Pipelines', value: 'bitbucket' },
    //         { title: 'CircleCI', value: 'circleci' },
    //         { title: 'GitHub Actions', value: 'github' },
    //         { title: 'GitLab CI', value: 'gitlab' },
    //         { title: 'Jenkins', value: 'jenkins' },
    //         { title: 'Travis CI', value: 'travis' },
    //         { title: 'Other', value: 'other' },
    //     ],
    // });

    const meta = buildProjectMeta(manager, mainConfig, configDir, '');

    console.log(
        boxen(
            dedent`📙 Storybook Base Directory: ${chalk.cyan(meta.storybookBaseDir)}
        📂 Storybook Config Directory: ${chalk.cyan(meta.storybookConfigDir)}
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
};

buildConfig()
    .then(() => {
        process.exit(0);
    })
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
