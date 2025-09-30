import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { updatePackageJsonScript } from './package-json';
import { ProjectMeta } from './types';
import fs from 'fs';
import path from 'path';

// Mock dependencies
vi.mock('fs');
vi.mock('prompts', () => ({
  prompt: vi.fn()
}));
vi.mock('./utils', () => ({
  displayMessage: vi.fn()
}));

const mockFs = vi.mocked(fs);

describe('package-json', () => {
  const mockMeta: ProjectMeta = {
    storybookBaseDir: './packages/ui',
    storybookConfigDir: './packages/ui/.storybook',
    storybookBuildDir: './packages/ui/storybook-static',
    packageManager: 'npm',
    isMonoRepo: true,
    framework: '@storybook/react-vite',
    ciEnv: 'github',
    staticAssets: []
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock path.join and path.relative
    vi.spyOn(path, 'join').mockImplementation((...args) => args.join('/'));
    vi.spyOn(path, 'relative').mockImplementation((from, to) => {
      // Simple mock implementation
      if (to.includes('chromatic.config.json')) {
        return 'chromatic.config.json';
      }
      return to;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('updatePackageJsonScript', () => {
    it('should return null when package.json does not exist', async () => {
      const { displayMessage } = await import('./utils');
      const mockDisplayMessage = vi.mocked(displayMessage);

      mockFs.existsSync.mockReturnValue(false);

      const result = await updatePackageJsonScript('./chromatic.config.json', mockMeta);

      expect(result).toBeNull();
      expect(mockDisplayMessage).toHaveBeenCalledWith(
        'No package.json found in the project directory.',
        { title: '🚨 Warning', borderColor: 'yellow' }
      );
    });

    it('should add config flag to existing Chromatic script without config', async () => {
      const mockPackageJson = {
        scripts: {
          chromatic: 'chromatic --exit-zero-on-changes'
        }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockPackageJson));

      const result = await updatePackageJsonScript('./chromatic.config.json', mockMeta);

      expect(result).toEqual({
        path: './packages/ui/package.json',
        content: {
          scripts: {
            chromatic: "chromatic --exit-zero-on-changes --config-file 'chromatic.config.json'"
          }
        }
      });
    });

    it('should not modify script when config file paths match', async () => {
      const { displayMessage } = await import('./utils');
      const mockDisplayMessage = vi.mocked(displayMessage);

      const mockPackageJson = {
        scripts: {
          chromatic: "chromatic --config-file 'chromatic.config.json'"
        }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockPackageJson));

      const result = await updatePackageJsonScript('./chromatic.config.json', mockMeta);

      expect(result).toBeNull();
      expect(mockDisplayMessage).toHaveBeenCalledWith(
        expect.stringContaining('The config file paths match'),
        { title: '📝 Script Details', borderColor: 'blue' }
      );
    });

    it('should prompt for update when config file paths differ', async () => {
      const { prompt } = await import('prompts');
      const { displayMessage } = await import('./utils');
      const mockPrompt = vi.mocked(prompt);
      const mockDisplayMessage = vi.mocked(displayMessage);

      const mockPackageJson = {
        scripts: {
          chromatic: "chromatic --config-file 'old-config.json'"
        }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockPackageJson));
      mockPrompt.mockResolvedValue({ updateExistingScripts: true });

      const result = await updatePackageJsonScript('./chromatic.config.json', mockMeta);

      expect(result).toEqual({
        path: './packages/ui/package.json',
        content: {
          scripts: {
            chromatic: "chromatic --config-file 'chromatic.config.json'"
          }
        }
      });

      expect(mockDisplayMessage).toHaveBeenCalledWith(
        expect.stringContaining('The config file paths are different'),
        { title: '📝 Script Details', borderColor: 'blue' }
      );
    });

    it('should handle multiple Chromatic scripts', async () => {
      const mockPackageJson = {
        scripts: {
          chromatic: 'chromatic',
          'chromatic:ci': 'chromatic --exit-zero-on-changes',
          'test:chromatic': 'chromatic --skip dependabot/**'
        }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockPackageJson));

      const result = await updatePackageJsonScript('./chromatic.config.json', mockMeta);

      expect(result?.content.scripts).toEqual({
        chromatic: "chromatic --config-file 'chromatic.config.json'",
        'chromatic:ci': "chromatic --exit-zero-on-changes --config-file 'chromatic.config.json'",
        'test:chromatic': "chromatic --skip dependabot/** --config-file 'chromatic.config.json'"
      });
    });

    it('should add new script when no Chromatic scripts exist', async () => {
      const { prompt } = await import('prompts');
      const mockPrompt = vi.mocked(prompt);

      const mockPackageJson = {
        scripts: {
          build: 'next build',
          dev: 'next dev'
        }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockPackageJson));
      mockPrompt
        .mockResolvedValueOnce({ addScript: true })
        .mockResolvedValueOnce({ scriptName: 'chromatic' });

      const result = await updatePackageJsonScript('./chromatic.config.json', mockMeta);

      expect(result).toEqual({
        path: './packages/ui/package.json',
        content: {
          scripts: {
            build: 'next build',
            dev: 'next dev',
            chromatic: "chromatic --config-file 'chromatic.config.json'"
          }
        }
      });
    });

    it('should handle package.json without scripts section', async () => {
      const { prompt } = await import('prompts');
      const mockPrompt = vi.mocked(prompt);

      const mockPackageJson = {
        name: 'test-package',
        version: '1.0.0'
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockPackageJson));
      mockPrompt
        .mockResolvedValueOnce({ addScript: true })
        .mockResolvedValueOnce({ scriptName: 'test-chromatic' });

      const result = await updatePackageJsonScript('./chromatic.config.json', mockMeta);

      expect(result).toEqual({
        path: './packages/ui/package.json',
        content: {
          name: 'test-package',
          version: '1.0.0',
          scripts: {
            'test-chromatic': "chromatic --config-file 'chromatic.config.json'"
          }
        }
      });
    });

    it('should return null when user declines to add script', async () => {
      const { prompt } = await import('prompts');
      const mockPrompt = vi.mocked(prompt);

      const mockPackageJson = {
        scripts: {
          build: 'next build'
        }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockPackageJson));
      mockPrompt.mockResolvedValue({ addScript: false });

      const result = await updatePackageJsonScript('./chromatic.config.json', mockMeta);

      expect(result).toBeNull();
    });

    it('should return null when user declines to update existing scripts', async () => {
      const { prompt } = await import('prompts');
      const mockPrompt = vi.mocked(prompt);

      const mockPackageJson = {
        scripts: {
          chromatic: "chromatic --config-file 'old-config.json'"
        }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockPackageJson));
      mockPrompt.mockResolvedValue({ updateExistingScripts: false });

      const result = await updatePackageJsonScript('./chromatic.config.json', mockMeta);

      expect(result).toBeNull();
    });

    it('should handle prompt errors gracefully', async () => {
      const { prompt } = await import('prompts');
      const mockPrompt = vi.mocked(prompt);

      const mockPackageJson = {
        scripts: {
          chromatic: "chromatic --config-file 'old-config.json'"
        }
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockPackageJson));
      mockPrompt.mockRejectedValue(new Error('Prompt interrupted'));

      const result = await updatePackageJsonScript('./chromatic.config.json', mockMeta);

      expect(result).toBeNull();
    });
  });
});