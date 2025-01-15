import { defineConfig } from 'vite';
    import react from '@vitejs/plugin-react';

    export default defineConfig({
      plugins: [react()],
      server: {
        port: parseInt(process.env.CLIENT_PORT),
        proxy: {
          '/upload': {
            target: `http://localhost:${process.env.PORT}`,
            changeOrigin: true,
            secure: false
          }
        }
      },
      build: {
        outDir: 'dist',
        emptyOutDir: true
      }
    });
