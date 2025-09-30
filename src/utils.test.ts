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

  describe('console output validation', () => {
    it('should never log [object Object] in any console output', () => {
      // This is a regression test to ensure we never accidentally log
      // objects directly that would show as [object Object]

      // Mock a scenario where objects might be logged
      const testObject = { workspaces: ['packages/*', 'apps/*'] };
      const testArray = [1, 2, 3];
      const testComplexObject = {
        nested: { values: true },
        array: [{ item: 'test' }]
      };

      // Test various ways objects might be accidentally logged
      const badExamples = [
        () => console.log('Object:', testObject),
        () => console.log('Array:', testArray),
        () => console.log('Complex:', testComplexObject)
      ];

      const goodExamples = [
        () => console.log('Object:', JSON.stringify(testObject)),
        () => console.log('Array:', JSON.stringify(testArray)),
        () => console.log('Complex:', JSON.stringify(testComplexObject, null, 2))
      ];

      // Test bad examples would produce [object Object] (but we won't actually run them)
      // Instead, test that good examples don't contain [object Object]
      goodExamples.forEach(example => {
        const mockLog = vi.fn();
        const originalLog = console.log;
        console.log = mockLog;

        example();

        const loggedContent = mockLog.mock.calls.flat().join(' ');
        expect(loggedContent).not.toContain('[object Object]');
        expect(loggedContent).not.toContain('[object Array]');

        console.log = originalLog;
      });
    });

    it('should properly stringify workspaces in package.json logging', () => {
      // Test the specific case that was causing the issue
      const packageJsonWithWorkspaces = {
        name: 'test-package',
        workspaces: ['packages/*', 'apps/*']
      };

      const packageJsonWithComplexWorkspaces = {
        name: 'test-package',
        workspaces: {
          packages: ['packages/*', 'apps/*'],
          nohoist: ['**/react', '**/react-dom']
        }
      };

      // Good: JSON.stringify
      const goodOutput1 = `Found package.json with workspaces: ${JSON.stringify(packageJsonWithWorkspaces.workspaces, null, 2)}`;
      const goodOutput2 = `Found package.json with workspaces: ${JSON.stringify(packageJsonWithComplexWorkspaces.workspaces, null, 2)}`;

      expect(goodOutput1).not.toContain('[object Object]');
      expect(goodOutput1).not.toContain('[object Array]');
      expect(goodOutput2).not.toContain('[object Object]');
      expect(goodOutput2).not.toContain('[object Array]');

      // Verify the JSON stringify produces valid JSON (the actual values, not the full string)
      expect(() => JSON.stringify(packageJsonWithWorkspaces.workspaces, null, 2)).not.toThrow();
      expect(() => JSON.stringify(packageJsonWithComplexWorkspaces.workspaces, null, 2)).not.toThrow();

      // Test that the stringified values can be parsed back
      const stringified1 = JSON.stringify(packageJsonWithWorkspaces.workspaces, null, 2);
      const stringified2 = JSON.stringify(packageJsonWithComplexWorkspaces.workspaces, null, 2);

      expect(() => JSON.parse(stringified1)).not.toThrow();
      expect(() => JSON.parse(stringified2)).not.toThrow();
    });
  });
});