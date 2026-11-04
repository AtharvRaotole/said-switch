import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const port = Number(process.env.WEB_PORT ?? 7300);
// SAID_WEB_BASE: '/' for Cloudflare Pages root, '/said-switch/' for GitHub project pages.
const base = process.env.SAID_WEB_BASE ?? '/';

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  server: { port, strictPort: true, host: '127.0.0.1' },
  preview: { port, strictPort: true },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
    emptyOutDir: true,
  },
});
