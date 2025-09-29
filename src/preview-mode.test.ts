import { describe, it, expect, vi, beforeEach } from 'vitest';
import { previewMode } from './preview-mode';
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
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockProcessExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
  throw new Error(`process.exit unexpectedly called with "${code}"`);
});

describe('preview-mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
    vi.spyOn(path, 'join').mockImplementation((...args) => args.join('/'));
    vi.spyOn(path, 'basename').mockImplementation((filePath) => filePath.split('/').pop() || '');
  });

  describe('previewMode', () => {
    it('should exit when no Storybook directories found', async () => {
      const { glob } = await import('fast-glob');
      const { displayMessage } = await import('./utils');

      vi.mocked(glob).mockResolvedValue([]);

      await expect(previewMode()).rejects.toThrow(/process\.exit unexpectedly called/);

      expect(displayMessage).toHaveBeenCalledWith(
        'No Storybook configuration directories found. Please ensure you are in a Storybook project directory.',
        { title: '🚨 No Storybook Config Found', borderColor: 'yellow' }
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should exit when user chooses exit option', async () => {
      const { glob } = await import('fast-glob');
      const { prompt } = await import('prompts');

      vi.mocked(glob).mockResolvedValue(['.storybook']);
      vi.mocked(prompt).mockResolvedValue({ selectedProject: 'exit' });

      await expect(previewMode()).rejects.toThrow(/process\.exit unexpectedly called/);
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });

    it('should exit when no preview files found', async () => {
      const { glob } = await import('fast-glob');
      const { prompt } = await import('prompts');
      const { displayMessage } = await import('./utils');

      vi.mocked(glob)
        .mockResolvedValueOnce(['.storybook']) // Storybook directories
        .mockResolvedValueOnce([]); // Preview files

      vi.mocked(prompt).mockResolvedValue({ selectedProject: '.storybook' });

      await expect(previewMode()).rejects.toThrow(/process\.exit unexpectedly called/);

      expect(displayMessage).toHaveBeenCalledWith(
        expect.stringContaining('No preview files found'),
        { title: '🚨 No Preview Found', borderColor: 'yellow' }
      );
      expect(mockProcessExit).toHaveBeenCalledWith(1);
    });

    it('should analyze preview file with standard imports', async () => {
      const { glob } = await import('fast-glob');
      const { prompt } = await import('prompts');

      const mockPreviewContent = `
        import React from 'react';
        import { ThemeProvider } from './theme';
        import '../styles/global.css';

        export const decorators = [
          (Story) => (
            <ThemeProvider>
              <Story />
            </ThemeProvider>
          ),
        ];
      `;

      vi.mocked(glob)
        .mockResolvedValueOnce(['.storybook']) // Storybook directories
        .mockResolvedValueOnce(['preview.js']); // Preview files

      vi.mocked(prompt).mockResolvedValue({ selectedProject: '.storybook' });

      mockFs.readFileSync.mockReturnValue(mockPreviewContent);
      mockFs.existsSync.mockReturnValue(false); // No package.json (not monorepo)

      await expect(previewMode()).rejects.toThrow(/process\.exit unexpectedly called/);

      expect(mockFs.readFileSync).toHaveBeenCalledWith('.storybook/preview.js', 'utf-8');
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringMatching(/Total Imports:.*2/)
      );
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });

    it('should detect monorepo structure', async () => {
      const { glob } = await import('fast-glob');
      const { prompt } = await import('prompts');

      const mockPreviewContent = `
        import { ThemeProvider } from '@company/design-system';
        import { GlobalDecorator } from '@company/storybook-utils';
      `;

      const mockPackageJson = {
        workspaces: ['packages/*', 'apps/*']
      };

      vi.mocked(glob)
        .mockResolvedValueOnce(['packages/ui/.storybook'])
        .mockResolvedValueOnce(['preview.ts']);

      vi.mocked(prompt).mockResolvedValue({ selectedProject: 'packages/ui/.storybook' });

      mockFs.readFileSync
        .mockReturnValueOnce(mockPreviewContent) // Preview file content
        .mockReturnValueOnce(JSON.stringify(mockPackageJson)); // package.json content

      mockFs.existsSync.mockReturnValue(true); // package.json exists

      await expect(previewMode()).rejects.toThrow(/process\.exit unexpectedly called/);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('🚨 Monorepo detected')
      );
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });

    it('should detect shared wrapper imports', async () => {
      const { glob } = await import('fast-glob');
      const { prompt } = await import('prompts');

      const mockPreviewContent = `
        import { ThemeProvider } from './theme-provider';
        import { AppWrapper } from '../wrappers/AppWrapper';
        import { LayoutDecorator } from './decorators/layout';
      `;

      vi.mocked(glob)
        .mockResolvedValueOnce(['.storybook'])
        .mockResolvedValueOnce(['preview.tsx']);

      vi.mocked(prompt).mockResolvedValue({ selectedProject: '.storybook' });

      mockFs.readFileSync.mockReturnValue(mockPreviewContent);
      mockFs.existsSync.mockReturnValue(false);

      await expect(previewMode()).rejects.toThrow(/process\.exit unexpectedly called/);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('🚨 Contains shared wrappers/themes')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('./theme-provider')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('../wrappers/AppWrapper')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('./decorators/layout')
      );
    });

    it('should detect high import count and show warning', async () => {
      const { glob } = await import('fast-glob');
      const { prompt } = await import('prompts');

      // Create preview with more than 10 imports (IMPORT_THRESHOLD)
      const mockPreviewContent = `
        import React from 'react';
        import { ThemeProvider } from './theme';
        import { GlobalStyles } from './styles';
        import { I18nProvider } from './i18n';
        import { RouterProvider } from './router';
        import { AuthProvider } from './auth';
        import { FeatureFlagProvider } from './features';
        import { AnalyticsProvider } from './analytics';
        import { ToastProvider } from './toast';
        import { ModalProvider } from './modal';
        import { ErrorBoundary } from './errors';
        import { DevTools } from './devtools';
        import { ExtraModule } from './extra';
      `;

      vi.mocked(glob)
        .mockResolvedValueOnce(['.storybook'])
        .mockResolvedValueOnce(['preview.js']);

      vi.mocked(prompt).mockResolvedValue({ selectedProject: '.storybook' });

      mockFs.readFileSync.mockReturnValue(mockPreviewContent);
      mockFs.existsSync.mockReturnValue(false);

      await expect(previewMode()).rejects.toThrow(/process\.exit unexpectedly called/);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('🚨 High number of imports (13)')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('could trigger fallback mode')
      );
    });

    it('should detect dynamic imports and show warning', async () => {
      const { glob } = await import('fast-glob');
      const { prompt } = await import('prompts');

      const mockPreviewContent = `
        import React from 'react';
        import { ThemeProvider } from './theme';

        // Dynamic imports
        const LazyComponent = React.lazy(() => import('./LazyComponent'));
        const utils = require('./utils');
        const config = await import('./config');

        if (process.env.NODE_ENV === 'development') {
          require('./dev-setup');
        }
      `;

      vi.mocked(glob)
        .mockResolvedValueOnce(['.storybook'])
        .mockResolvedValueOnce(['preview.ts']);

      vi.mocked(prompt).mockResolvedValue({ selectedProject: '.storybook' });

      mockFs.readFileSync.mockReturnValue(mockPreviewContent);
      mockFs.existsSync.mockReturnValue(false);

      await expect(previewMode()).rejects.toThrow(/process\.exit unexpectedly called/);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('🚨 Contains dynamic imports (4)')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('./LazyComponent')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('./utils')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('./config')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('./dev-setup')
      );
    });

    it('should handle multiple preview files', async () => {
      const { glob } = await import('fast-glob');
      const { prompt } = await import('prompts');

      const mockPreviewJs = `import React from 'react';`;
      const mockPreviewTs = `import { Meta } from '@storybook/react';`;

      vi.mocked(glob)
        .mockResolvedValueOnce(['.storybook'])
        .mockResolvedValueOnce(['preview.js', 'preview.ts']);

      vi.mocked(prompt).mockResolvedValue({ selectedProject: '.storybook' });

      mockFs.readFileSync
        .mockReturnValueOnce(mockPreviewJs)
        .mockReturnValueOnce(mockPreviewTs);
      mockFs.existsSync.mockReturnValue(false);

      await expect(previewMode()).rejects.toThrow(/process\.exit unexpectedly called/);

      expect(mockFs.readFileSync).toHaveBeenCalledWith('.storybook/preview.js', 'utf-8');
      expect(mockFs.readFileSync).toHaveBeenCalledWith('.storybook/preview.ts', 'utf-8');
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('preview.js')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('preview.ts')
      );
    });

    it('should show clean analysis for well-optimized preview file', async () => {
      const { glob } = await import('fast-glob');
      const { prompt } = await import('prompts');

      const mockPreviewContent = `
        import React from 'react';
        import { GlobalStyles } from './styles';

        export const decorators = [
          (Story) => (
            <div>
              <GlobalStyles />
              <Story />
            </div>
          ),
        ];
      `;

      vi.mocked(glob)
        .mockResolvedValueOnce(['.storybook'])
        .mockResolvedValueOnce(['preview.js']);

      vi.mocked(prompt).mockResolvedValue({ selectedProject: '.storybook' });

      mockFs.readFileSync.mockReturnValue(mockPreviewContent);
      mockFs.existsSync.mockReturnValue(false);

      await expect(previewMode()).rejects.toThrow(/process\.exit unexpectedly called/);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('✅ Import count is within acceptable range')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('✅ No shared wrappers/themes detected')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('✅ All imports are static')
      );
    });

    it('should handle monorepo with multiple Storybook projects', async () => {
      const { glob } = await import('fast-glob');
      const { prompt } = await import('prompts');
      const { displayMessage } = await import('./utils');

      const mockPreviewContent = `import { ThemeProvider } from '@org/ui';`;

      vi.mocked(glob)
        .mockResolvedValueOnce([
          'packages/ui/.storybook',
          'packages/components/.storybook',
          'apps/web/.storybook'
        ])
        .mockResolvedValueOnce(['preview.ts']);

      vi.mocked(prompt).mockResolvedValue({ selectedProject: 'packages/ui/.storybook' });

      mockFs.readFileSync.mockReturnValue(mockPreviewContent);
      mockFs.existsSync.mockReturnValue(false);

      await expect(previewMode()).rejects.toThrow(/process\.exit unexpectedly called/);

      expect(displayMessage).toHaveBeenCalledWith(
        expect.stringMatching(/I found.*3.*Storybook projects\./),
        { title: '📚 Storybook Projects', borderColor: 'magenta' }
      );

      expect(prompt).toHaveBeenCalledWith({
        type: 'select',
        name: 'selectedProject',
        message: 'Which Storybook project would you like to analyze?',
        choices: [
          {
            title: 'packages/ui/.storybook',
            value: 'packages/ui/.storybook',
            description: 'Analyze preview in packages/ui/.storybook'
          },
          {
            title: 'packages/components/.storybook',
            value: 'packages/components/.storybook',
            description: 'Analyze preview in packages/components/.storybook'
          },
          {
            title: 'apps/web/.storybook',
            value: 'apps/web/.storybook',
            description: 'Analyze preview in apps/web/.storybook'
          },
          {
            title: 'Exit',
            value: 'exit',
            description: 'Exit the analyzer'
          }
        ],
      });
    });

    it('should handle package.json read errors gracefully', async () => {
      const { glob } = await import('fast-glob');
      const { prompt } = await import('prompts');

      const mockPreviewContent = `import { Component } from './component';`;
      const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.mocked(glob)
        .mockResolvedValueOnce(['.storybook'])
        .mockResolvedValueOnce(['preview.js']);

      vi.mocked(prompt).mockResolvedValue({ selectedProject: '.storybook' });

      mockFs.readFileSync
        .mockReturnValueOnce(mockPreviewContent)
        .mockImplementationOnce(() => {
          throw new Error('Permission denied');
        });
      mockFs.existsSync.mockReturnValue(true);

      await expect(previewMode()).rejects.toThrow(/process\.exit unexpectedly called/);

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining('Error reading package.json'),
        expect.any(Error)
      );
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });

    it('should correctly identify shared wrapper keywords', async () => {
      const { glob } = await import('fast-glob');
      const { prompt } = await import('prompts');

      const mockPreviewContent = `
        import { MyWrapper } from './my-wrapper';
        import { AppDecorator } from './app-decorator';
        import { ThemeConfig } from './theme-config';
        import { DataProvider } from './data-provider';
        import { CustomUtil } from './utils'; // Should not be flagged
      `;

      vi.mocked(glob)
        .mockResolvedValueOnce(['.storybook'])
        .mockResolvedValueOnce(['preview.js']);

      vi.mocked(prompt).mockResolvedValue({ selectedProject: '.storybook' });

      mockFs.readFileSync.mockReturnValue(mockPreviewContent);
      mockFs.existsSync.mockReturnValue(false);

      await expect(previewMode()).rejects.toThrow(/process\.exit unexpectedly called/);

      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('./my-wrapper')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('./app-decorator')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('./theme-config')
      );
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('./data-provider')
      );

      // Should not flag utils
      const logOutput = mockConsoleLog.mock.calls.flat().join(' ');
      expect(logOutput).not.toContain('./utils');
    });
  });
});