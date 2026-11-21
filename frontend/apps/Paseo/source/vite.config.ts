import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  ...(process.env.PDL_ENABLE_STAGING_PROXY === '1'
    ? { server: { proxy: { '/api': { target: 'http://127.0.0.1:4190', changeOrigin: false } } } }
    : {}),
  test: { environment: 'jsdom', setupFiles: ['./src/test-setup.ts'], include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },
});
