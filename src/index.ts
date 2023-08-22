import { JsPackageManagerFactory, PackageManagerName } from '@storybook/cli';
import { findConfigFile } from '@storybook/core-common';
import { readConfig } from '@storybook/csf-tools';
import { glob } from 'fast-glob';
import { readFile } from 'fs/promises';
import { prompt } from 'prompts';

const normalizeManagerName = (managerName: PackageManagerName) =>
    managerName.startsWith('yarn') ? 'yarn' : managerName;

// Should run from project root
const buildConfig = async () => {
    /*
        Needed data:
          - [x] Package Manager
          - [x] Is a monorepo
          - [x] Storybook framework
          - [ ] CI environment
    */
    const manager = JsPackageManagerFactory.getPackageManager();

    const managerName = normalizeManagerName(manager.type);
    const isMonoRepo = manager.isStorybookInMonorepo();

    const storybookDirectories = await glob('**/.storybook', { onlyDirectories: true });

    const configDir = storybookDirectories[0];

    const mainConfigPath = findConfigFile('main', configDir);
    const mainConfig = await readConfig(mainConfigPath);
    const framework = mainConfig.getFieldNode(['framework']);

    let frameworkValue = mainConfig.getSafeFieldValue(['framework']);

    if (!frameworkValue) {
        const frameworkNode = mainConfig.getFieldNode(['framework']);
        const { start, end } = frameworkNode;

        const rawContents = await readFile(mainConfigPath, 'utf-8');

        const frameworkContents = rawContents.slice(start, end);

        const frameworkMatch = frameworkContents.match(/(@storybook\/[^\"]+)/);

        frameworkValue = frameworkMatch?.[1];
    }

    const { ciEnv } = await prompt({
        type: 'select',
        name: 'ciEnv',
        message: 'What CI environment are you using?',
        choices: [
            { title: 'Azure Pipelines', value: 'azure' },
            { title: 'Bitbucket Pipelines', value: 'bitbucket' },
            { title: 'CircleCI', value: 'circleci' },
            { title: 'GitHub Actions', value: 'github' },
            { title: 'GitLab CI', value: 'gitlab' },
            { title: 'Jenkins', value: 'jenkins' },
            { title: 'Travis CI', value: 'travis' },
            { title: 'Other', value: 'other' },
        ],
    });

    console.table({
        packageManager: managerName,
        isMonoRepo,
        framework: frameworkValue,
        ciEnv,
    });
};

buildConfig()
    .then(() => {
        process.exit(0);
    })
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
