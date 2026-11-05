import { defineConfig, loadEnv } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.UNSLOTH_TARGET || 'http://localhost:8888';

  // Proxy /unsloth/* -> Unsloth server so the browser never hits CORS.
  // Point the app at a direct URL in Settings if you'd rather skip the proxy.
  const proxy = {
    '/unsloth': {
      target,
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/unsloth/, ''),
    },
  };

  return {
    plugins: [svelte()],
    server: { proxy },
    preview: { proxy },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.js'],
    },
  };
});
