import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock external dependencies using factory functions
vi.mock('fast-glob', () => ({
  glob: vi.fn()
}));

vi.mock('prompts', () => ({
  prompt: vi.fn()
}));

vi.mock('fs', () => ({
  default: {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn()
  }
}));

vi.mock('./storybook-resolver', () => ({
  JsPackageManagerFactory: {
    getPackageManager: vi.fn()
  },
  findConfigFile: vi.fn(),
  readConfig: vi.fn()
}));

vi.mock('./utils', () => ({
  displayMessage: vi.fn()
}));

vi.mock('./static-assets', () => ({
  findStaticAssets: vi.fn(),
  promptForStaticAssets: vi.fn()
}));

vi.mock('./config-management', () => ({
  createChromaticConfig: vi.fn(),
  updateChromaticConfig: vi.fn(),
  findChromaticConfig: vi.fn()
}));

vi.mock('./package-json', () => ({
  updatePackageJsonScript: vi.fn()
}));

vi.mock('./project-detection', () => ({
  buildProjectMeta: vi.fn()
}));

vi.mock('./analyze-mode', () => ({
  analyzeMode: vi.fn()
}));

vi.mock('./preview-mode', () => ({
  previewMode: vi.fn()
}));

describe('index', () => {
  const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const mockProcessExit = vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined) => {
    throw new Error(`process.exit called with code: ${code}`);
  });

  let originalArgv: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    originalArgv = process.argv;
    process.argv = ['node', 'index.js'];

    // Reset modules to ensure fresh imports
    vi.resetModules();
  });

  afterEach(() => {
    process.argv = originalArgv;
  });

  describe('main function - argument parsing', () => {
    it('should call analyzeMode when analyze argument is provided', async () => {
      process.argv = ['node', 'index.js', 'analyze'];

      const { analyzeMode } = await import('./analyze-mode');
      const mockAnalyzeMode = vi.mocked(analyzeMode);

      // Mock analyze mode to exit cleanly
      mockAnalyzeMode.mockImplementation(async () => {
        throw new Error('process.exit called with code: 0');
      });

      // Import and execute main
      try {
        const indexModule = await import('./index');
        await indexModule.main();
        expect.fail('Should have thrown process exit error');
      } catch (error) {
        expect(error.message).toContain('process.exit');
      }

      expect(mockAnalyzeMode).toHaveBeenCalled();
    });

    it('should call previewMode when preview argument is provided', async () => {
      process.argv = ['node', 'index.js', 'preview'];

      const { previewMode } = await import('./preview-mode');
      const mockPreviewMode = vi.mocked(previewMode);

      // Mock preview mode to exit cleanly
      mockPreviewMode.mockImplementation(async () => {
        throw new Error('process.exit called with code: 0');
      });

      // Import and execute main
      try {
        const indexModule = await import('./index');
        await indexModule.main();
        expect.fail('Should have thrown process exit error');
      } catch (error) {
        expect(error.message).toContain('process.exit');
      }

      expect(mockPreviewMode).toHaveBeenCalled();
    });

    it('should show help when help argument is provided', async () => {
      process.argv = ['node', 'index.js', 'help'];

      const { displayMessage } = await import('./utils');
      const mockDisplayMessage = vi.mocked(displayMessage);

      // Import and execute main
      try {
        const indexModule = await import('./index');
        await indexModule.main();
        expect.fail('Should have thrown process exit error');
      } catch (error) {
        expect(error.message).toContain('process.exit called with code: 0');
      }

      expect(mockDisplayMessage).toHaveBeenCalledWith(
        expect.stringContaining('Usage:'),
        { title: '❓ Help Mode', borderColor: 'yellow' }
      );
    });

    it('should handle short flag versions', async () => {
      const testCases = [
        { arg: '-h', expectCall: 'displayMessage' },
        { arg: '--help', expectCall: 'displayMessage' },
        { arg: '-a', expectCall: 'analyzeMode' },
        { arg: '--analyze', expectCall: 'analyzeMode' },
        { arg: '-p', expectCall: 'previewMode' },
        { arg: '--preview', expectCall: 'previewMode' }
      ];

      for (const { arg, expectCall } of testCases) {
        vi.resetModules();
        vi.clearAllMocks();
        process.argv = ['node', 'index.js', arg];

        if (expectCall === 'displayMessage') {
          const { displayMessage } = await import('./utils');
          vi.mocked(displayMessage);
        } else if (expectCall === 'analyzeMode') {
          const { analyzeMode } = await import('./analyze-mode');
          vi.mocked(analyzeMode).mockImplementation(async () => {
            throw new Error('process.exit called with code: 0');
          });
        } else if (expectCall === 'previewMode') {
          const { previewMode } = await import('./preview-mode');
          vi.mocked(previewMode).mockImplementation(async () => {
            throw new Error('process.exit called with code: 0');
          });
        }

        try {
          const indexModule = await import('./index');
          await indexModule.main();
          expect.fail(`Should have thrown process exit error for ${arg}`);
        } catch (error) {
          expect(error.message).toContain('process.exit');
        }
      }
    });

    it('should handle unknown commands', async () => {
      process.argv = ['node', 'index.js', 'unknown-command'];

      const { displayMessage } = await import('./utils');
      const mockDisplayMessage = vi.mocked(displayMessage);

      try {
        const indexModule = await import('./index');
        await indexModule.main();
        expect.fail('Should have thrown process exit error');
      } catch (error) {
        expect(error.message).toContain('process.exit called with code: 1');
      }

      expect(mockDisplayMessage).toHaveBeenCalledWith(
        'Unknown mode: unknown-command. Available modes: init (default), analyze, preview',
        { title: '❌ Error', borderColor: 'red' }
      );
    });
  });

  describe('init mode - basic flow', () => {
    it('should handle no Storybook directories found', async () => {
      process.argv = ['node', 'index.js', 'init'];

      const { glob } = await import('fast-glob');
      const mockGlob = vi.mocked(glob);
      mockGlob.mockResolvedValue([]);

      const { displayMessage } = await import('./utils');
      const mockDisplayMessage = vi.mocked(displayMessage);

      try {
        const indexModule = await import('./index');
        await indexModule.main();
        expect.fail('Should have thrown process exit error');
      } catch (error) {
        expect(error.message).toContain('process.exit called with code: 1');
      }

      expect(mockDisplayMessage).toHaveBeenCalledWith(
        'No Storybook configuration directories found. Please ensure you are in a Storybook project directory.',
        { title: '❌ No Storybook Config Found', borderColor: 'yellow' }
      );
    });

    it('should handle successful Storybook directory detection', async () => {
      process.argv = ['node', 'index.js'];  // Default to init mode

      const { glob } = await import('fast-glob');
      const mockGlob = vi.mocked(glob);
      mockGlob.mockResolvedValue(['.storybook']);

      const { prompt } = await import('prompts');
      const mockPrompt = vi.mocked(prompt);
      mockPrompt.mockResolvedValue({ selectedProject: 'exit' });

      const { displayMessage } = await import('./utils');
      const mockDisplayMessage = vi.mocked(displayMessage);

      try {
        const indexModule = await import('./index');
        await indexModule.main();
        expect.fail('Should have thrown process exit error');
      } catch (error) {
        expect(error.message).toContain('process.exit called with code: 0');
      }

      expect(mockGlob).toHaveBeenCalledWith('**/.storybook', {
        onlyDirectories: true,
        ignore: ['**/node_modules/**'],
      });

      expect(mockDisplayMessage).toHaveBeenCalledWith(
        'CLI tool for helping you configure Chromatic Turbosnap for your project',
        { title: '@chromaui/turbosnap-helper', borderColor: 'magenta' }
      );
    });

    it('should handle monorepo Storybook detection', async () => {
      process.argv = ['node', 'index.js', 'init'];

      const { glob } = await import('fast-glob');
      const mockGlob = vi.mocked(glob);
      mockGlob.mockResolvedValue([
        '.storybook',
        'packages/ui/.storybook',
        'apps/web/.storybook'
      ]);

      const { prompt } = await import('prompts');
      const mockPrompt = vi.mocked(prompt);
      mockPrompt.mockResolvedValue({ selectedProject: 'exit' });

      const { displayMessage } = await import('./utils');
      const mockDisplayMessage = vi.mocked(displayMessage);

      try {
        const indexModule = await import('./index');
        await indexModule.main();
        expect.fail('Should have thrown process exit error');
      } catch (error) {
        expect(error.message).toContain('process.exit called with code: 0');
      }

      expect(mockPrompt).toHaveBeenCalledWith({
        type: 'select',
        name: 'selectedProject',
        message: 'Which Storybook project would you like to configure?',
        choices: expect.arrayContaining([
          expect.objectContaining({
            title: '.storybook',
            value: '.storybook'
          }),
          expect.objectContaining({
            title: 'packages/ui/.storybook',
            value: 'packages/ui/.storybook'
          }),
          expect.objectContaining({
            title: 'apps/web/.storybook',
            value: 'apps/web/.storybook'
          }),
          expect.objectContaining({
            title: 'Exit',
            value: 'exit'
          })
        ])
      });
    });
  });

  describe('error handling', () => {
    it('should handle main execution errors', async () => {
      process.argv = ['node', 'index.js', 'analyze'];

      const { analyzeMode } = await import('./analyze-mode');
      const mockAnalyzeMode = vi.mocked(analyzeMode);
      mockAnalyzeMode.mockRejectedValue(new Error('Test error'));

      try {
        const indexModule = await import('./index');
        await indexModule.main();
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.message).toContain('Test error');
      }
    });

    it('should handle process exit gracefully', async () => {
      const { handleExit } = await import('./index');

      try {
        await handleExit();
        expect.fail('Should have thrown process exit error');
      } catch (error) {
        expect(error.message).toContain('process.exit called with code: 0');
      }

      const { displayMessage } = await import('./utils');
      const mockDisplayMessage = vi.mocked(displayMessage);

      expect(mockDisplayMessage).toHaveBeenCalledWith(
        'Configuration helper exited.',
        { title: '👋 Goodbye!', borderColor: 'blue' }
      );
    });
  });

  describe('configAction show', () => {
    it('should display all metadata when configAction is show', async () => {
      process.argv = ['node', 'index.js', 'init'];

      // Mock dependencies
      const { glob } = await import('fast-glob');
      const { prompt } = await import('prompts');
      const { buildProjectMeta } = await import('./project-detection');
      const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

      const mockGlob = vi.mocked(glob);
      const mockPrompt = vi.mocked(prompt);
      const mockBuildProjectMeta = vi.mocked(buildProjectMeta);

      // Setup mock data
      const mockMeta = {
        storybookBaseDir: './packages/ui',
        storybookConfigDir: './packages/ui/.storybook',
        storybookBuildDir: './packages/ui/storybook-static',
        packageManager: 'yarn',
        framework: '@storybook/react-vite',
        isMonoRepo: true,
        ciEnv: 'github',
        staticAssets: []
      };

      // Mock the flow: find Storybook, select project, build meta, show config
      mockGlob.mockResolvedValue(['packages/ui/.storybook']);
      mockPrompt
        .mockResolvedValueOnce({ selectedProject: 'packages/ui/.storybook' }) // Project selection
        .mockResolvedValueOnce({ configAction: 'show' }); // Config action selection

      mockBuildProjectMeta.mockResolvedValue(mockMeta);

      // Import and execute main
      try {
        const indexModule = await import('./index');
        await indexModule.main();
        expect.fail('Should have thrown process exit error');
      } catch (error) {
        expect(error.message).toContain('process.exit called with code: 0');
      }

      // Verify that all expected metadata is displayed in console output
      const logCalls = mockConsoleLog.mock.calls;
      const allOutput = logCalls.flat().join(' ');

      // Check that all the required metadata fields are present
      expect(allOutput).toContain('Base Directory:');
      expect(allOutput).toContain('./packages/ui');

      expect(allOutput).toContain('Config Directory:');
      expect(allOutput).toContain('./packages/ui/.storybook');

      expect(allOutput).toContain('Build Directory:');
      expect(allOutput).toContain('./packages/ui/storybook-static');

      expect(allOutput).toContain('Package Manager:');
      expect(allOutput).toContain('yarn');

      expect(allOutput).toContain('Framework:');
      expect(allOutput).toContain('@storybook/react-vite');

      // Verify the show configuration message structure
      expect(allOutput).toContain('Here are the recommended configuration values for your project:');
      expect(allOutput).toContain('You can use these values in your Chromatic config file.');

      // Ensure the prompt for configAction was called with correct choices including 'show'
      expect(mockPrompt).toHaveBeenCalledWith({
        type: 'select',
        name: 'configAction',
        message: 'What would you like to do with these configuration values?',
        choices: expect.arrayContaining([
          expect.objectContaining({
            title: 'Just show me the configuration values',
            value: 'show',
            description: 'Display the configuration values without creating/updating files'
          })
        ])
      });
    });

    it('should handle npm package manager and different framework in show mode', async () => {
      process.argv = ['node', 'index.js'];

      // Mock dependencies
      const { glob } = await import('fast-glob');
      const { prompt } = await import('prompts');
      const { buildProjectMeta } = await import('./project-detection');
      const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});

      const mockGlob = vi.mocked(glob);
      const mockPrompt = vi.mocked(prompt);
      const mockBuildProjectMeta = vi.mocked(buildProjectMeta);

      // Setup mock data with different values
      const mockMeta = {
        storybookBaseDir: './storybook',
        storybookConfigDir: './.storybook',
        storybookBuildDir: './storybook-static',
        packageManager: 'npm',
        framework: '@storybook/nextjs',
        isMonoRepo: false,
        ciEnv: 'github',
        staticAssets: []
      };

      mockGlob.mockResolvedValue(['.storybook']);
      mockPrompt
        .mockResolvedValueOnce({ selectedProject: '.storybook' })
        .mockResolvedValueOnce({ configAction: 'show' });

      mockBuildProjectMeta.mockResolvedValue(mockMeta);

      try {
        const indexModule = await import('./index');
        await indexModule.main();
        expect.fail('Should have thrown process exit error');
      } catch (error) {
        expect(error.message).toContain('process.exit called with code: 0');
      }

      const logCalls = mockConsoleLog.mock.calls;
      const allOutput = logCalls.flat().join(' ');

      // Verify different values are properly displayed
      expect(allOutput).toContain('./storybook');
      expect(allOutput).toContain('./.storybook');
      expect(allOutput).toContain('./storybook-static');
      expect(allOutput).toContain('npm');
      expect(allOutput).toContain('@storybook/nextjs');
    });
  });

  describe('module exports', () => {
    it('should export main function', async () => {
      const indexModule = await import('./index');
      expect(typeof indexModule.main).toBe('function');
    });

    it('should export handleExit function', async () => {
      const indexModule = await import('./index');
      expect(typeof indexModule.handleExit).toBe('function');
    });
  });
});