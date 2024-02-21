module.exports = {
    baseBranch: 'main',
    labels: [
        {
            name: 'documentation',
            releaseType: 'none',
        },
        { releaseType: 'major', name: 'major' },
        { releaseType: 'minor', name: 'minor' },
        { releaseType: 'patch', name: 'path' },
    ],
    prereleaseBranches: ['next', 'prerelease'],
};
