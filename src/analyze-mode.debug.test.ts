import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyzeMode } from './analyze-mode';
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
const mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
const mockProcessExit = vi.spyOn(process, 'exit').mockImplementation((code) => {
  throw new Error(`process.exit unexpectedly called with "${code}"`);
});

describe('analyze-mode debug', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'cwd').mockReturnValue('/test/project');
    vi.spyOn(path, 'join').mockImplementation((...args) => args.join('/'));
    vi.spyOn(path, 'dirname').mockImplementation((filePath) => {
      const parts = filePath.split('/');
      parts.pop();
      return parts.join('/') || '/';
    });
  });

  it('should debug the error with dynamic imports', async () => {
    const { glob } = await import('fast-glob');
    const { prompt } = await import('prompts');

    const mockStoryContent = `
import React from 'react';
import { Button } from './Button';

const LazyComponent = React.lazy(() => import('./LazyComponent'));
const utils = require('./utils');

export default {
  title: 'Button',
  component: Button,
};

export const Primary = {};
    `;

    vi.mocked(glob)
      .mockResolvedValueOnce(['.storybook']) // Storybook directories
      .mockResolvedValueOnce(['Button.stories.tsx']); // Story files

    vi.mocked(prompt).mockResolvedValue({ selectedProject: '.storybook' });

    mockFs.readFileSync.mockReturnValue(mockStoryContent);

    try {
      await analyzeMode();
    } catch (error) {
      if (error.message.includes('process.exit unexpectedly called with "0"')) {
        console.log('✅ Success! The analyze mode completed successfully');

        // Print out all the console logs to see what's happening
        console.log('Console logs:');
        mockConsoleLog.mock.calls.forEach((call, index) => {
          console.log(`${index}:`, call);
        });

        // Print console errors
        console.log('Console errors:');
        mockConsoleError.mock.calls.forEach((call, index) => {
          console.log(`${index}:`, call);
        });

        // This is expected - the function completed successfully
        return;
      }

      console.error('Caught error:', error);

      if (error.message.includes('Cannot read properties of undefined')) {
        console.log('❌ This is the undefined property error we need to fix');
      }

      throw error;
    }
  });
});