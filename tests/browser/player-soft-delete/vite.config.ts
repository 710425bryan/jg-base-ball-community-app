import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'

const here = fileURLToPath(new URL('.', import.meta.url))
export default defineConfig({
  root: resolve(here, '../../..'),
  envDir: false,
  cacheDir: resolve(tmpdir(), 'jg-player-soft-delete-vite-cache'),
  plugins: [vue()],
  resolve: { alias: [
    { find: '@/services/supabase', replacement: resolve(here, 'supabase.ts') },
    { find: '@/stores/auth', replacement: resolve(here, 'stores.ts') },
    { find: '@/stores/permissions', replacement: resolve(here, 'stores.ts') },
    { find: '@', replacement: resolve(here, '../../../src') }
  ] },
  server: { host: '127.0.0.1', port: 5194, strictPort: true },
  define: { __APP_VERSION__: JSON.stringify('fixture-only') }
})
