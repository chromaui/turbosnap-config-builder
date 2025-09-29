import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getStorybookConfigPath, buildProjectMeta } from './project-detection';
import { ProjectMeta } from './types';

// Create completely isolated mocks per test to avoid interference
describe('project-detection (robust)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
  });

  describe('getStorybookConfigPath', () => {
    it('should return single Storybook directory when only one exists', async () => {
      // Mock fast-glob inline
      vi.doMock('fast-glob', () => ({
        glob: vi.fn().mockResolvedValue(['.storybook'])
      }));

      // Import after mocking
      const { getStorybookConfigPath: testFunction } = await import('./project-detection');
      const result = await testFunction();

      expect(result).toBe('.storybook');
    });

    it('should prompt user when multiple Storybook directories found', async () => {
      // Mock modules inline for this test
      vi.doMock('fast-glob', () => ({
        glob: vi.fn().mockResolvedValue(['app1/.storybook', 'app2/.storybook'])
      }));

      vi.doMock('prompts', () => ({
        prompt: vi.fn().mockResolvedValue({ configDir: 'app1/.storybook' })
      }));

      vi.doMock('./utils', () => ({
        displayMessage: vi.fn(),
        exitWithMessage: vi.fn(),
        normalizeManagerName: vi.fn(),
        pluckFrameworkFromRawContents: vi.fn()
      }));

      // Import after all mocks are set up
      const { getStorybookConfigPath: testFunction } = await import('./project-detection');
      const { displayMessage } = await import('./utils');

      const result = await testFunction();

      expect(result).toBe('app1/.storybook');
      expect(displayMessage).toHaveBeenCalledWith(
        expect.stringMatching(/I found.*2.*Storybook configuration directories. Please select which Storybook you'd like help with\./),
        { title: '💬 I need your help!', borderColor: 'yellow' }
      );
    });

    it('should handle monorepo with multiple packages', async () => {
      // Mock modules inline for this test
      vi.doMock('fast-glob', () => ({
        glob: vi.fn().mockResolvedValue([
          'packages/ui/.storybook',
          'packages/components/.storybook',
          'apps/web/.storybook'
        ])
      }));

      vi.doMock('prompts', () => ({
        prompt: vi.fn().mockResolvedValue({ configDir: 'packages/ui/.storybook' })
      }));

      vi.doMock('./utils', () => ({
        displayMessage: vi.fn(),
        exitWithMessage: vi.fn(),
        normalizeManagerName: vi.fn(),
        pluckFrameworkFromRawContents: vi.fn()
      }));

      // Import after all mocks are set up
      const { getStorybookConfigPath: testFunction } = await import('./project-detection');
      const { displayMessage } = await import('./utils');

      const result = await testFunction();

      expect(result).toBe('packages/ui/.storybook');
      expect(displayMessage).toHaveBeenCalledWith(
        expect.stringMatching(/I found.*3.*Storybook configuration directories. Please select which Storybook you'd like help with\./),
        { title: '💬 I need your help!', borderColor: 'yellow' }
      );
    });
  });

  afterEach(() => {
    vi.doUnmock('fast-glob');
    vi.doUnmock('prompts');
    vi.doUnmock('./utils');
    vi.doUnmock('./static-assets');
    vi.resetModules();
  });
});