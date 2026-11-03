import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const port = Number(process.env.WEB_PORT ?? 7300);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port, strictPort: true, host: '127.0.0.1' },
  preview: { port, strictPort: true },
});
