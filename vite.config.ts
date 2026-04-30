import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import legacy from '@vitejs/plugin-legacy'
import { VitePWA } from 'vite-plugin-pwa'
import { resolve } from 'path'
import { readFileSync, writeFileSync } from 'fs'

const getPackageVersion = () => {
  try {
    const pkg = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf-8'))
    return pkg.version
  } catch (e) {
    console.error('Failed to read package.json:', e)
    return '0.0.0'
  }
}

const appVersion = getPackageVersion()

const versionUpdatePlugin = () => {
  return {
    name: 'version-update-plugin',
    buildStart() {
      // 在正式編譯階段確實寫入實體檔案，讓靜態伺服器 (如 Nginx) 能讀到
      try {
        writeFileSync(resolve(__dirname, 'public/version.json'), JSON.stringify({ version: getPackageVersion() }))
      } catch (e) {
        console.error('Failed to write version.json:', e)
      }
    },
    configureServer(server) {
      // 在開發伺服器直接攔截 /version.json，確保隨時回傳最新版號且不被快取
      server.middlewares.use((req, res, next) => {
        if (req.url && req.url.split('?')[0] === '/version.json') {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify({ version: getPackageVersion() }))
          return
        }
        next()
      })
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion)
  },
  plugins: [
    vue(),
    versionUpdatePlugin(),
    legacy({
      targets: ['defaults', 'not IE 11']
    }),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      devOptions: {
        enabled: true
      },
      workbox: {
        importScripts: [`/push-sw.js?v=${appVersion}`],
        navigateFallbackDenylist: [/^\/version\.json/]
      },
      manifest: {
        name: '中港熊戰棒球隊',
        short_name: '中港熊戰',
        theme_color: 'rgba(255, 255, 255, 0.95)',
        icons: [
          {
            src: '/少棒元素_20260324_232837_0000.png',
            sizes: '192x192 512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vue-core': ['vue', 'vue-router', 'pinia', '@vueuse/core'],
          'ui-vendor': ['element-plus', '@element-plus/icons-vue'],
          'db-vendor': ['@supabase/supabase-js'],
          'chart-vendor': ['echarts', 'vue-echarts'],
          'utils': ['dayjs', 'axios', 'zod', 'decimal.js']
        }
      }
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  }
})
