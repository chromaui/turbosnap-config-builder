import { describe, it, expect, vi, beforeEach } from 'vitest';
import { findChromaticConfig, createChromaticConfig, updateChromaticConfig } from './config-management';
import { ProjectMeta, ChromaticConfig } from './types';
import fs from 'fs';
import path from 'path';

// Mock modules
vi.mock('fs');
vi.mock('fast-glob', () => ({
  glob: vi.fn()
}));
vi.mock('prompts', () => ({
  prompt: vi.fn()
}));
vi.mock('./utils', () => ({
  displayMessage: vi.fn()
}));

const mockFs = vi.mocked(fs);

describe('config-management', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mock path functions
    vi.spyOn(path, 'join').mockImplementation((...args) => args.join('/'));
    vi.spyOn(path, 'relative').mockImplementation((from, to) => to);
  });

  describe('findChromaticConfig', () => {
    it('should find default config file when it exists in project root (priority location)', async () => {
      const { displayMessage } = await import('./utils');
      const mockConfig: ChromaticConfig = {
        projectId: 'Project:test123',
        storybookBaseDir: './storybook'
      };

      // Mock existsSync to return true for project root, false for .storybook
      mockFs.existsSync.mockImplementation((filePath: string) => {
        return filePath.toString().includes('chromatic.config.json') && filePath.toString().includes('/chromatic.config.json');
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      // Mock process.cwd to return a known path
      vi.spyOn(process, 'cwd').mockReturnValue('/test/project');

      const result = await findChromaticConfig('./.storybook');

      expect(result).toEqual({
        path: '/test/project/chromatic.config.json',
        config: mockConfig
      });
      expect(mockFs.existsSync).toHaveBeenCalledWith('/test/project/chromatic.config.json');
      expect(displayMessage).toHaveBeenCalledWith(
        expect.stringContaining('Found default config file'),
        { title: '📝 Config File Found', borderColor: 'green' }
      );
    });

    it('should find default config file in .storybook directory when not in project root', async () => {
      const { displayMessage } = await import('./utils');
      const mockConfig: ChromaticConfig = {
        projectId: 'Project:test456',
        storybookBaseDir: './storybook'
      };

      // Mock existsSync to return false for project root, true for .storybook
      mockFs.existsSync.mockImplementation((filePath: string) => {
        return filePath.toString().includes('.storybook/chromatic.config.json');
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const result = await findChromaticConfig('./.storybook');

      expect(result).toEqual({
        path: './.storybook/chromatic.config.json',
        config: mockConfig
      });
      expect(displayMessage).toHaveBeenCalledWith(
        expect.stringContaining('Found default config file'),
        { title: '📝 Config File Found', borderColor: 'green' }
      );
    });

    it('should find default config file in monorepo structure', async () => {
      const mockConfig: ChromaticConfig = {
        projectId: 'Project:monorepo123',
        storybookBaseDir: './packages/ui'
      };

      // Mock existsSync to return false for project root, true for monorepo storybook directory
      mockFs.existsSync.mockImplementation((filePath: string) => {
        return filePath.toString().includes('packages/ui/.storybook/chromatic.config.json');
      });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const result = await findChromaticConfig('packages/ui/.storybook');

      expect(result).toEqual({
        path: 'packages/ui/.storybook/chromatic.config.json',
        config: mockConfig
      });
    });

    it('should return null when no config files exist', async () => {
      const { glob } = await import('fast-glob');

      mockFs.existsSync.mockReturnValue(false);
      vi.mocked(glob).mockResolvedValue([]);

      const result = await findChromaticConfig('./.storybook');

      expect(result).toBeNull();
    });

    it('should handle config files found by glob search', async () => {
      const { glob } = await import('fast-glob');
      const { prompt } = await import('prompts');
      const { displayMessage } = await import('./utils');
      const mockConfig: ChromaticConfig = {
        projectId: 'Project:test123',
        storybookBaseDir: './storybook'
      };

      mockFs.existsSync.mockReturnValue(false);
      vi.mocked(glob).mockResolvedValue(['custom.config.json']);
      vi.mocked(prompt)
        .mockResolvedValueOnce({ useExisting: true })
        .mockResolvedValueOnce({ selectedConfig: 'custom.config.json' });
      mockFs.readFileSync.mockReturnValue(JSON.stringify(mockConfig));

      const result = await findChromaticConfig('./.storybook');

      expect(result).toEqual({
        path: './.storybook/custom.config.json',
        config: mockConfig
      });
      expect(displayMessage).toHaveBeenCalledWith(
        expect.stringMatching(/Found.*1.*config file\./),
        { title: '📝 Config Files Found', borderColor: 'magenta' }
      );
    });

    it('should return null when user declines to use existing config', async () => {
      const { glob } = await import('fast-glob');
      const { prompt } = await import('prompts');

      mockFs.existsSync.mockReturnValue(false);
      vi.mocked(glob).mockResolvedValue(['custom.config.json']);
      vi.mocked(prompt).mockResolvedValue({ useExisting: false });

      const result = await findChromaticConfig('./.storybook');

      expect(result).toBeNull();
    });
  });

  describe('createChromaticConfig', () => {
    const mockMeta: ProjectMeta = {
      storybookBaseDir: './storybook',
      storybookConfigDir: './.storybook',
      storybookBuildDir: './storybook-static',
      packageManager: 'npm',
      isMonoRepo: false,
      framework: '@storybook/react-vite',
      ciEnv: 'github',
      staticAssets: []
    };

    it('should create new config file', async () => {
      const { prompt } = await import('prompts');

      mockFs.existsSync.mockReturnValue(false);
      vi.mocked(prompt).mockResolvedValue({ newProjectId: 'test123' });

      const result = await createChromaticConfig(mockMeta);

      expect(result.config).toEqual({
        $schema: 'https://www.chromatic.com/config-file.schema.json',
        projectId: 'Project:test123',
        storybookBaseDir: './storybook',
        storybookConfigDir: './.storybook',
        storybookBuildDir: './storybook-static',
        onlyChanged: true,
      });
      expect(mockFs.writeFileSync).toHaveBeenCalled();
      expect(result.path).toBe('./storybook/chromatic.config.json');
    });

    it('should create new config file for monorepo', async () => {
      const { prompt } = await import('prompts');

      const monorepoMeta: ProjectMeta = {
        storybookBaseDir: './packages/ui',
        storybookConfigDir: './packages/ui/.storybook',
        storybookBuildDir: './packages/ui/storybook-static',
        packageManager: 'yarn',
        isMonoRepo: true,
        framework: '@storybook/nextjs',
        ciEnv: 'github',
        staticAssets: []
      };

      mockFs.existsSync.mockReturnValue(false);
      vi.mocked(prompt).mockResolvedValue({ newProjectId: 'monorepo456' });

      const result = await createChromaticConfig(monorepoMeta);

      expect(result.config).toEqual({
        $schema: 'https://www.chromatic.com/config-file.schema.json',
        projectId: 'Project:monorepo456',
        storybookBaseDir: './packages/ui',
        storybookConfigDir: './packages/ui/.storybook',
        storybookBuildDir: './packages/ui/storybook-static',
        onlyChanged: true,
      });
      expect(result.path).toBe('./packages/ui/chromatic.config.json');
    });

    it('should preserve existing config when updating', async () => {
      const { prompt } = await import('prompts');
      const existingConfig: ChromaticConfig = {
        projectId: 'Project:existing123',
        externals: ['static/**'],
        customField: 'customValue'
      };

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(JSON.stringify(existingConfig));
      vi.mocked(prompt).mockResolvedValue({ newProjectId: '' });

      const result = await createChromaticConfig(mockMeta);

      expect(result.config).toEqual({
        projectId: 'Project:existing123',
        externals: ['static/**'],
        customField: 'customValue',
        $schema: 'https://www.chromatic.com/config-file.schema.json',
        storybookBaseDir: './storybook',
        storybookConfigDir: './.storybook',
        storybookBuildDir: './storybook-static',
        onlyChanged: true,
      });
    });

    it('should throw error when no project ID is provided', async () => {
      const { prompt } = await import('prompts');

      mockFs.existsSync.mockReturnValue(false);
      vi.mocked(prompt).mockResolvedValue({ newProjectId: '' });

      await expect(createChromaticConfig(mockMeta)).rejects.toThrow('Project ID is required');
    });
  });

  describe('updateChromaticConfig', () => {
    const mockMeta: ProjectMeta = {
      storybookBaseDir: './storybook-new',
      storybookConfigDir: './.storybook-new',
      storybookBuildDir: './storybook-static-new',
      packageManager: 'pnpm',
      isMonoRepo: true,
      framework: '@storybook/nextjs',
      ciEnv: 'github',
      staticAssets: []
    };

    it('should update existing config with new meta', async () => {
      const { displayMessage } = await import('./utils');
      const existingConfig: ChromaticConfig = {
        projectId: 'Project:test123',
        $schema: 'https://www.chromatic.com/config-file.schema.json',
        storybookBaseDir: './old-storybook',
        storybookConfigDir: './.old-storybook',
        storybookBuildDir: './old-storybook-static',
        externals: ['static/**'],
        onlyChanged: true,
        customField: 'customValue'
      };

      const result = await updateChromaticConfig(
        './chromatic.config.json',
        existingConfig,
        mockMeta
      );

      expect(result.config).toEqual({
        projectId: 'Project:test123',
        $schema: 'https://www.chromatic.com/config-file.schema.json',
        storybookBaseDir: './storybook-new',
        storybookConfigDir: './.storybook-new',
        storybookBuildDir: './storybook-static-new',
        externals: ['static/**'],
        onlyChanged: true,
        customField: 'customValue'
      });

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        './chromatic.config.json',
        JSON.stringify(result.config, null, 2)
      );

      expect(displayMessage).toHaveBeenCalledWith(
        expect.stringContaining('Updated Chromatic config with new Storybook paths'),
        { title: '📝 Config Updated', borderColor: 'green' }
      );
    });

    it('should update monorepo config preserving all options', async () => {
      const monorepoMeta: ProjectMeta = {
        storybookBaseDir: './apps/web',
        storybookConfigDir: './apps/web/.storybook',
        storybookBuildDir: './apps/web/dist',
        packageManager: 'yarn',
        isMonoRepo: true,
        framework: '@storybook/angular',
        ciEnv: 'gitlab',
        staticAssets: []
      };

      const existingConfig: ChromaticConfig = {
        projectId: 'Project:monorepo123',
        zip: true,
        uploadBuild: true,
        exitZeroOnChanges: true,
        exitOnceUploaded: true,
        allowConsoleErrors: false,
        debug: true,
        diagnostics: false,
        fileHashing: true,
        forceRebuild: false,
        interactive: false,
        junitReport: './results.xml',
        list: false,
        logFile: './chromatic.log',
        skip: 'dependabot/**',
        externals: ['public/**'],
        onlyChanged: true,
      };

      const result = await updateChromaticConfig(
        './chromatic.config.json',
        existingConfig,
        monorepoMeta
      );

      // Check that all original properties are preserved
      expect(result.config.zip).toBe(true);
      expect(result.config.uploadBuild).toBe(true);
      expect(result.config.exitZeroOnChanges).toBe(true);
      expect(result.config.externals).toEqual(['public/**']);
      expect(result.config.skip).toBe('dependabot/**');

      // Check that Storybook paths are updated
      expect(result.config.storybookBaseDir).toBe('./apps/web');
      expect(result.config.storybookConfigDir).toBe('./apps/web/.storybook');
      expect(result.config.storybookBuildDir).toBe('./apps/web/dist');
    });
  });
});