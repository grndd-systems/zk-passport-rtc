import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    global: 'globalThis',
  },
  server: {
    proxy: {
      '/rpc': {
        target: 'https://ev-reth-eden-testnet.binarybuilders.services:8545',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/rpc/, ''),
        secure: false,
      },
    },
  },
})
