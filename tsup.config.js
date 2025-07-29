import { defineConfig } from 'tsup';

export default defineConfig((options) => [
    {
        entry: ['src/index.ts'],
        outDir: './bin',
        splitting: false,
        minify: !options.watch,
        format: ['cjs'],
        treeshake: true,
        target: 'node16',
        clean: true,
        platform: 'node',
        // Adding these as external dependencies to avoid bundling them in the output
        external: [
            'storybook/internal/common',
            'storybook/internal/csf-tools',
            'storybook'
        ],
        esbuildOptions(options) {
            options.conditions = ['module'];
        },
    },
]);