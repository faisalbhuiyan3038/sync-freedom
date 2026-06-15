import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Sync Freedom',
    description: 'Cross-device browser history and tab sync using your own storage backend.',
    version: '0.1.0',
    permissions: ['tabs', 'history', 'alarms', 'storage', 'activeTab'],
    host_permissions: ['*://*/*'],
    action: {
      default_title: 'Sync Freedom',
    },
  },
  vite: () => ({
    // Allow top-level await in service worker
    build: {
      target: 'esnext',
    },
  }),
});
