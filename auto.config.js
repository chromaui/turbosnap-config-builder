module.exports = {
    baseBranch: 'main',
    labels: [
        {
            name: 'documentation',
            releaseType: 'none',
        },
        { releaseType: 'major', name: 'Version: Major' },
        { releaseType: 'minor', name: 'Version: Minor' },
        { releaseType: 'patch', name: 'Version: Patch' },
    ],
    prereleaseBranches: ['next', 'prerelease'],
    versionBranches: true,
};
