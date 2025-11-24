import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    env: {
      AIC_BASE_URL: 'test.forgeblocks.com',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/index.ts',       // Re-export files
        'src/config/**',         // Static configuration
      ],
      // No thresholds initially - we'll add them as we build coverage
    },
  },
});
