import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    exclude: ['node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'coverage/**',
        '**/*.config.ts',
        'test/**',
        'src/index.ts',
        'src/cli.ts',
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 60,
        statements: 85,
      },
    },
  },
});
