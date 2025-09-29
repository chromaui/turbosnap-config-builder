import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getStorybookConfigPath, buildProjectMeta } from './project-detection';
import { ProjectMeta } from './types';
import { glob } from 'fast-glob';
import { prompt } from 'prompts';
import { displayMessage, exitWithMessage, normalizeManagerName, pluckFrameworkFromRawContents } from './utils';
import { findStaticAssets } from './static-assets';

// Mock modules at the top level without using variables
vi.mock('fast-glob', () => ({
  glob: vi.fn()
}));

vi.mock('prompts', () => ({
  prompt: vi.fn()
}));

vi.mock('./utils', () => ({
  displayMessage: vi.fn(),
  exitWithMessage: vi.fn(),
  normalizeManagerName: vi.fn(),
  pluckFrameworkFromRawContents: vi.fn()
}));

vi.mock('./static-assets', () => ({
  findStaticAssets: vi.fn()
}));

const mockProcessExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
  throw new Error(`process.exit unexpectedly called with "${code}"`);
});

describe('project-detection', () => {
  beforeEach(() => {
    // Only clear mock call history, don't reset implementations
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue('/test/project');

    // Clear the process.exit mock calls but keep its implementation
    mockProcessExit.mockClear();
  });

  afterEach(() => {
    // Don't restore mockProcessExit as it's used across tests
    // vi.restoreAllMocks();
  });

  describe('getStorybookConfigPath', () => {
    it('should return single Storybook directory when only one exists', async () => {
      vi.mocked(glob).mockResolvedValueOnce(['.storybook']);

      const result = await getStorybookConfigPath();

      expect(result).toBe('.storybook');
      expect(glob).toHaveBeenCalledWith('**/.storybook', {
        onlyDirectories: true,
        ignore: ['**/node_modules/**'],
      });
    });

    it('should return single Storybook directory for monorepo structure', async () => {
      vi.mocked(glob).mockResolvedValueOnce(['packages/ui/.storybook']);

      const result = await getStorybookConfigPath();

      expect(result).toBe('packages/ui/.storybook');
    });

    it('should exit when no Storybook directories found', async () => {
      vi.mocked(glob).mockResolvedValueOnce([]);

      await expect(getStorybookConfigPath()).rejects.toThrow(/process\.exit unexpectedly called/);

      expect(displayMessage).toHaveBeenCalledWith(
        'No Storybook configuration directories found. Please ensure you are in a Storybook project directory.',
        { title: '❌ No Storybook Config Found', borderColor: 'yellow' }
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should prompt user when multiple Storybook directories found', async () => {
      // Clear all mocks to ensure clean state
      vi.clearAllMocks();

      // Set up mocks with explicit return values
      vi.mocked(glob).mockResolvedValueOnce(['app1/.storybook', 'app2/.storybook']);
      vi.mocked(prompt).mockResolvedValueOnce({ configDir: 'app1/.storybook' });
      vi.mocked(displayMessage).mockImplementation(() => {});

      const result = await getStorybookConfigPath();

      // Basic assertions
      expect(result).toBe('app1/.storybook');
      expect(displayMessage).toHaveBeenCalled();

      // Verify the message content with chalk formatting
      expect(displayMessage).toHaveBeenCalledWith(
        expect.stringMatching(/I found.*2.*Storybook configuration directories. Please select which Storybook you'd like help with\./),
        { title: '💬 I need your help!', borderColor: 'yellow' }
      );
    });

    it('should handle monorepo with multiple packages', async () => {
      // Clear all mocks to ensure clean state
      vi.clearAllMocks();

      // Set up specific mocks for this test
      vi.mocked(glob).mockResolvedValueOnce([
        'packages/ui/.storybook',
        'packages/components/.storybook',
        'apps/web/.storybook'
      ]);
      vi.mocked(prompt).mockResolvedValueOnce({ configDir: 'packages/ui/.storybook' });
      vi.mocked(displayMessage).mockImplementation(() => {});

      const result = await getStorybookConfigPath();

      expect(result).toBe('packages/ui/.storybook');

      // Verify displayMessage was called with correct parameters with chalk formatting
      expect(displayMessage).toHaveBeenCalled();
      expect(displayMessage).toHaveBeenCalledWith(
        expect.stringMatching(/I found.*3.*Storybook configuration directories. Please select which Storybook you'd like help with\./),
        { title: '💬 I need your help!', borderColor: 'yellow' }
      );
    });

    it('should exit when user chooses exit option', async () => {
      vi.mocked(glob).mockResolvedValueOnce(['app1/.storybook', 'app2/.storybook']);
      vi.mocked(prompt).mockResolvedValueOnce({ configDir: 'exit' });
      vi.mocked(exitWithMessage).mockImplementation(() => {
        throw new Error('exitWithMessage called');
      });

      await expect(getStorybookConfigPath()).rejects.toThrow('exitWithMessage called');

      expect(exitWithMessage).toHaveBeenCalled();
    });
  });

  describe('buildProjectMeta', () => {
    const mockPackageManager = {
      type: 'npm@8.19.2',
      isStorybookInMonorepo: vi.fn().mockReturnValue(false)
    };

    const mockMainConfig = {
      getSafeFieldValue: vi.fn(),
      getNameFromPath: vi.fn()
    };

    beforeEach(() => {
      mockMainConfig.getSafeFieldValue.mockClear();
      mockMainConfig.getNameFromPath.mockClear();
      mockPackageManager.isStorybookInMonorepo.mockClear();

      // Reset to default return value
      mockPackageManager.isStorybookInMonorepo.mockReturnValue(false);
    });

    it('should build project meta for standard project', async () => {
      mockMainConfig.getSafeFieldValue
        .mockReturnValueOnce('@storybook/react-vite') // framework
        .mockReturnValueOnce('dist'); // buildDir

      vi.mocked(findStaticAssets).mockResolvedValue({
        projectAssets: ['/project/assets/logo.png'],
        repoAssets: ['/project/public/favicon.ico']
      });

      vi.mocked(normalizeManagerName).mockReturnValue('npm');

      const result = await buildProjectMeta(
        mockPackageManager,
        mockMainConfig,
        '.storybook',
        'github'
      );

      const expectedMeta: ProjectMeta = {
        storybookBaseDir: '.',
        storybookConfigDir: './.storybook',
        storybookBuildDir: './dist',
        packageManager: 'npm',
        isMonoRepo: false,
        framework: '@storybook/react-vite',
        ciEnv: 'github',
        staticAssets: ['/project/assets/logo.png', '/project/public/favicon.ico']
      };

      expect(result).toEqual(expectedMeta);
    });

    it('should build project meta for monorepo structure', async () => {
      mockMainConfig.getSafeFieldValue
        .mockReturnValueOnce('@storybook/nextjs') // framework
        .mockReturnValueOnce(null); // buildDir - use default

      vi.mocked(findStaticAssets).mockResolvedValue({
        projectAssets: ['/project/packages/ui/assets/icons.svg'],
        repoAssets: ['/project/static/fonts.woff2']
      });
      vi.mocked(normalizeManagerName).mockReturnValue('yarn');
      mockPackageManager.isStorybookInMonorepo.mockReturnValue(true);

      const result = await buildProjectMeta(
        mockPackageManager,
        mockMainConfig,
        'packages/ui/.storybook',
        'gitlab'
      );

      expect(result).toEqual({
        storybookBaseDir: './packages/ui',
        storybookConfigDir: './packages/ui/.storybook',
        storybookBuildDir: './storybook-static', // default
        packageManager: 'yarn',
        isMonoRepo: true,
        framework: '@storybook/nextjs',
        ciEnv: 'gitlab',
        staticAssets: ['/project/packages/ui/assets/icons.svg', '/project/static/fonts.woff2']
      });
    });

    it('should handle nested monorepo paths correctly', async () => {
      mockMainConfig.getSafeFieldValue.mockReturnValue('@storybook/react');
      vi.mocked(findStaticAssets).mockResolvedValue({ projectAssets: [], repoAssets: [] });
      vi.mocked(normalizeManagerName).mockReturnValue('pnpm');

      // Test deeply nested path
      const result1 = await buildProjectMeta(
        mockPackageManager,
        mockMainConfig,
        'apps/frontend/packages/ui/.storybook',
        'github'
      );
      expect(result1.storybookBaseDir).toBe('./apps/frontend/packages/ui');
      expect(result1.storybookConfigDir).toBe('./apps/frontend/packages/ui/.storybook');

      // Test another nested structure
      const result2 = await buildProjectMeta(
        mockPackageManager,
        mockMainConfig,
        'workspaces/design-system/.storybook',
        'github'
      );
      expect(result2.storybookBaseDir).toBe('./workspaces/design-system');
      expect(result2.storybookConfigDir).toBe('./workspaces/design-system/.storybook');
    });
  });
});