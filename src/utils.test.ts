import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { normalizeManagerName, pluckFrameworkFromRawContents, displayMessage, exitWithMessage, displayProjectMeta } from './utils';
import { ProjectMeta } from './types';

// Mock console.log for testing display functions
const mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
const mockProcessExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
  // Don't actually exit, just throw an error for testing
  throw new Error(`process.exit unexpectedly called with "${code}"`);
});

describe('utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Don't restore all mocks as it breaks the spies
  });

  describe('normalizeManagerName', () => {
    it('should normalize yarn manager names', () => {
      expect(normalizeManagerName('yarn@1.22.0')).toBe('yarn');
      expect(normalizeManagerName('yarn@berry')).toBe('yarn');
      expect(normalizeManagerName('yarn')).toBe('yarn');
    });

    it('should keep other manager names unchanged', () => {
      expect(normalizeManagerName('npm')).toBe('npm');
      expect(normalizeManagerName('pnpm')).toBe('pnpm');
      expect(normalizeManagerName('bun')).toBe('bun');
    });
  });

  describe('pluckFrameworkFromRawContents', () => {
    it('should extract framework from getAbsolutePath format', () => {
      const mockMainConfig = {
        getFieldNode: () => ({ start: 0, end: 50 }),
        _code: 'framework: getAbsolutePath("@storybook/react-vite")',
      };

      const result = pluckFrameworkFromRawContents(mockMainConfig);
      expect(result).toBe('@storybook/react-vite');
    });

    it('should extract framework from object format', () => {
      const mockMainConfig = {
        getFieldNode: () => ({ start: 0, end: 50 }),
        _code: 'framework: { name: "@storybook/nextjs" }',
      };

      const result = pluckFrameworkFromRawContents(mockMainConfig);
      expect(result).toBe('@storybook/nextjs');
    });

    it('should extract framework from direct string format', () => {
      const mockMainConfig = {
        getFieldNode: () => ({ start: 0, end: 50 }),
        _code: 'framework: "@storybook/vue3-vite"',
      };

      const result = pluckFrameworkFromRawContents(mockMainConfig);
      expect(result).toBe('@storybook/vue3-vite');
    });

    it('should return undefined for unmatched format', () => {
      const mockMainConfig = {
        getFieldNode: () => ({ start: 0, end: 50 }),
        _code: 'framework: someUnknownFormat',
      };

      const result = pluckFrameworkFromRawContents(mockMainConfig);
      expect(result).toBeUndefined();
    });
  });

  describe('displayMessage', () => {
    it('should display a message with default options', () => {
      displayMessage('Test message', { title: 'Test Title' });

      expect(mockConsoleLog).toHaveBeenCalled();
      expect(mockConsoleLog.mock.calls.some(call =>
        call[0].includes('Test message')
      )).toBe(true);
    });

    it('should display a message with custom border color', () => {
      displayMessage('Test message', { title: 'Test Title', borderColor: 'red' });

      expect(mockConsoleLog).toHaveBeenCalled();
      expect(mockConsoleLog.mock.calls.some(call =>
        call[0].includes('Test message')
      )).toBe(true);
    });
  });

  describe('exitWithMessage', () => {
    it('should display default goodbye message and exit', () => {
      expect(() => exitWithMessage()).toThrow(/process\.exit unexpectedly called/);

      expect(mockConsoleLog.mock.calls.some(call =>
        call[0].includes('Configuration helper exited. No changes were made.')
      )).toBe(true);
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });

    it('should display custom message and exit', () => {
      const customMessage = 'Custom exit message';
      expect(() => exitWithMessage(customMessage)).toThrow(/process\.exit unexpectedly called/);

      expect(mockConsoleLog.mock.calls.some(call =>
        call[0].includes(customMessage)
      )).toBe(true);
      expect(mockProcessExit).toHaveBeenCalledWith(0);
    });
  });

  describe('displayProjectMeta', () => {
    it('should display project metadata', () => {
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

      displayProjectMeta(mockMeta);

      expect(mockConsoleLog).toHaveBeenCalled();
      const allCalls = mockConsoleLog.mock.calls.flat().join(' ');
      expect(allCalls).toContain('./storybook');
      expect(allCalls).toContain('./.storybook');
      expect(allCalls).toContain('./storybook-static');
      expect(allCalls).toContain('npm');
      expect(allCalls).toContain('@storybook/react-vite');
    });

    it('should display project metadata for monorepo', () => {
      const mockMeta: ProjectMeta = {
        storybookBaseDir: './packages/ui',
        storybookConfigDir: './packages/ui/.storybook',
        storybookBuildDir: './packages/ui/storybook-static',
        packageManager: 'yarn',
        isMonoRepo: true,
        framework: '@storybook/nextjs',
        ciEnv: 'github',
        staticAssets: []
      };

      displayProjectMeta(mockMeta);

      expect(mockConsoleLog).toHaveBeenCalled();
      const allCalls = mockConsoleLog.mock.calls.flat().join(' ');
      expect(allCalls).toContain('./packages/ui');
      expect(allCalls).toContain('./packages/ui/.storybook');
      expect(allCalls).toContain('./packages/ui/storybook-static');
      expect(allCalls).toContain('yarn');
      expect(allCalls).toContain('@storybook/nextjs');
    });
  });
});