import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { findStaticAssets, promptForStaticAssets } from './static-assets';

// Mock dependencies
vi.mock('fast-glob', () => ({
  glob: vi.fn()
}));
vi.mock('prompts', () => ({
  prompt: vi.fn()
}));
vi.mock('./utils', () => ({
  displayMessage: vi.fn()
}));

describe('static-assets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('findStaticAssets', () => {
    it('should find static assets in both project and repo directories', async () => {
      const { glob } = await import('fast-glob');
      const mockGlob = vi.mocked(glob);

      mockGlob
        .mockResolvedValueOnce([
          '/project/src/assets/logo.png',
          '/project/src/styles/main.css'
        ])
        .mockResolvedValueOnce([
          '/repo/public/favicon.ico',
          '/repo/assets/fonts/main.woff2'
        ]);

      const result = await findStaticAssets('/project', '/repo');

      expect(result).toEqual({
        projectAssets: [
          '/project/src/assets/logo.png',
          '/project/src/styles/main.css'
        ],
        repoAssets: [
          '/repo/public/favicon.ico',
          '/repo/assets/fonts/main.woff2'
        ]
      });

      expect(mockGlob).toHaveBeenCalledTimes(2);
      expect(mockGlob).toHaveBeenCalledWith(
        [
          '**/*.{png,jpg,jpeg,gif,svg,ico,webp}',
          '**/*.{woff,woff2,ttf,otf,eot}',
          '**/*.{css,scss,sass}',
        ],
        {
          cwd: '/project',
          ignore: ['**/node_modules/**', '**/dist/**', '**/.storybook/**'],
          absolute: true,
        }
      );
    });

    it('should return empty arrays when no assets found', async () => {
      const { glob } = await import('fast-glob');
      const mockGlob = vi.mocked(glob);

      mockGlob.mockResolvedValue([]);

      const result = await findStaticAssets('/project', '/repo');

      expect(result).toEqual({
        projectAssets: [],
        repoAssets: []
      });
    });
  });

  describe('promptForStaticAssets', () => {
    const mockAssets = {
      projectAssets: [
        '/project/src/assets/logo.png',
        '/project/src/assets/banner.jpg',
        '/project/src/styles/main.css'
      ],
      repoAssets: [
        '/repo/public/favicon.ico',
        '/repo/assets/fonts/main.woff2'
      ]
    };

    it('should return empty array when no assets provided', async () => {
      const result = await promptForStaticAssets(
        { projectAssets: [], repoAssets: [] },
        '/project',
        '/repo'
      );

      expect(result).toEqual([]);
    });

    it('should return empty array when user declines to add assets', async () => {
      const { prompt } = await import('prompts');
      const mockPrompt = vi.mocked(prompt);

      mockPrompt.mockResolvedValue({ addStaticAssets: false });

      const result = await promptForStaticAssets(mockAssets, '/project', '/repo');

      expect(result).toEqual([]);
    });

    it('should handle individual file selection', async () => {
      const { prompt } = await import('prompts');
      const mockPrompt = vi.mocked(prompt);

      mockPrompt
        .mockResolvedValueOnce({ addStaticAssets: true })
        .mockResolvedValueOnce({ assetLevel: 'project' })
        .mockResolvedValueOnce({ reviewType: 'individual' })
        .mockResolvedValueOnce({
          selectedAssets: [
            '/project/src/assets/logo.png',
            '/project/src/styles/main.css'
          ]
        })
        .mockResolvedValueOnce({ assetType: 'individual' });

      const result = await promptForStaticAssets(mockAssets, '/project', '/repo');

      expect(result).toEqual([
        'src/assets/logo.png',
        'src/styles/main.css'
      ]);
    });

    it('should handle glob pattern generation', async () => {
      const { prompt } = await import('prompts');
      const mockPrompt = vi.mocked(prompt);

      mockPrompt
        .mockResolvedValueOnce({ addStaticAssets: true })
        .mockResolvedValueOnce({ assetLevel: 'project' })
        .mockResolvedValueOnce({ reviewType: 'individual' })
        .mockResolvedValueOnce({
          selectedAssets: [
            '/project/src/assets/logo.png',
            '/project/src/assets/banner.jpg',
            '/project/src/styles/main.css'
          ]
        })
        .mockResolvedValueOnce({ assetType: 'glob' });

      const result = await promptForStaticAssets(mockAssets, '/project', '/repo');

      // Should group by extension and create glob patterns
      expect(result).toEqual([
        expect.stringContaining('**/*.png'),
        expect.stringContaining('**/*.jpg'),
        expect.stringContaining('**/*.css')
      ]);
    });

    it('should handle path-based selection', async () => {
      const { prompt } = await import('prompts');
      const mockPrompt = vi.mocked(prompt);

      mockPrompt
        .mockResolvedValueOnce({ addStaticAssets: true })
        .mockResolvedValueOnce({ assetLevel: 'project' })
        .mockResolvedValueOnce({ reviewType: 'path' })
        .mockResolvedValueOnce({ selectedPaths: ['src/assets'] })
        .mockResolvedValueOnce({ assetType: 'individual' });

      const result = await promptForStaticAssets(mockAssets, '/project', '/repo');

      expect(result).toEqual([
        'src/assets/logo.png',
        'src/assets/banner.jpg'
      ]);
    });

    it('should handle both project and repo assets', async () => {
      const { prompt } = await import('prompts');
      const mockPrompt = vi.mocked(prompt);

      mockPrompt
        .mockResolvedValueOnce({ addStaticAssets: true })
        .mockResolvedValueOnce({ assetLevel: 'both' })
        .mockResolvedValueOnce({ reviewType: 'individual' })
        .mockResolvedValueOnce({
          selectedAssets: ['/project/src/assets/logo.png']
        })
        .mockResolvedValueOnce({ reviewType: 'individual' })
        .mockResolvedValueOnce({
          selectedAssets: ['/repo/public/favicon.ico']
        })
        .mockResolvedValueOnce({ assetType: 'individual' });

      const result = await promptForStaticAssets(mockAssets, '/project', '/repo');

      expect(result).toContain('src/assets/logo.png');
      expect(result.some(asset => asset.includes('favicon.ico'))).toBe(true);
    });

    it('should handle repo-only asset selection', async () => {
      const { prompt } = await import('prompts');
      const mockPrompt = vi.mocked(prompt);

      mockPrompt
        .mockResolvedValueOnce({ addStaticAssets: true })
        .mockResolvedValueOnce({ assetLevel: 'repo' })
        .mockResolvedValueOnce({ reviewType: 'individual' })
        .mockResolvedValueOnce({
          selectedAssets: ['/repo/public/favicon.ico']
        })
        .mockResolvedValueOnce({ assetType: 'individual' });

      const result = await promptForStaticAssets(mockAssets, '/project', '/repo');

      expect(result.some(asset => asset.includes('favicon.ico'))).toBe(true);
    });
  });
});