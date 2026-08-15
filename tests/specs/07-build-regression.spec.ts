import { test, expect } from '@playwright/test';
import { execSync } from 'child_process';

/**
 * Build regression test — verifies all 7 sites build successfully.
 * This is a Playwright wrapper around build-all.sh.
 */

test.describe('Build regression', () => {
  test('all 7 sites build without errors', () => {
    // This test runs build-all.sh and verifies exit code 0
    // It's tagged as slow so it can be skipped in fast test runs
    test.slow();

    try {
      const output = execSync('bash build-all.sh', {
        cwd: process.cwd(),
        timeout: 300_000,
        encoding: 'utf-8',
      });
      expect(output).toContain('All sites built successfully');
    } catch (e: any) {
      throw new Error(`build-all.sh failed: ${e.stdout || e.message}`);
    }
  });
});
