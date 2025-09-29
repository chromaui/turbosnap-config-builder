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