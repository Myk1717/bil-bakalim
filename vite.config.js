import { defineConfig } from 'vite';
import { APP } from './app.config.js';

const manifest = () =>
  JSON.stringify(
    {
      name: APP.name,
      short_name: APP.shortName,
      description: APP.description,
      lang: 'tr',
      start_url: './',
      scope: './',
      display: 'standalone',
      orientation: 'portrait',
      background_color: APP.themeColor,
      theme_color: APP.themeColor,
      icons: [
        { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
      ],
    },
    null,
    2,
  );

export default defineConfig({
  base: './',
  plugins: [
    {
      name: 'app-config',
      transformIndexHtml: (html) =>
        html
          .replaceAll('%APP_NAME%', APP.name)
          .replaceAll('%APP_DESC%', APP.description)
          .replaceAll('%THEME%', APP.themeColor),
      configureServer(server) {
        server.middlewares.use('/manifest.webmanifest', (_req, res) => {
          res.setHeader('Content-Type', 'application/manifest+json');
          res.end(manifest());
        });
      },
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'manifest.webmanifest', source: manifest() });
      },
    },
  ],
});
