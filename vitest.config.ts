import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@/lib': path.resolve(__dirname, './src/lib'),
      '@/app': path.resolve(__dirname, './src/app'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts', 'src/lib/learning/__tests__/**/*.test.ts'],
    exclude: ['node_modules', '.next', '.storage'],
    testTimeout: 15000,
  },
});
