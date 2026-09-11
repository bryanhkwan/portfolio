import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://bryanhkwan.github.io',
  base: '/portfolio',
  output: 'static',
  trailingSlash: 'always',
  integrations: [react()],
  build: { format: 'directory' },
});
