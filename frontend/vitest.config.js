import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/testSetup.js'],
    testTimeout: 15000,
    include: ['src/**/*.test.{js,jsx}'],
    clearMocks: true,
  },
});
