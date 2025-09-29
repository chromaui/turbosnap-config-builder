import { describe, it, expect } from 'vitest';
import { normalizeManagerName } from './utils';

describe('utils - basic tests', () => {
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
});