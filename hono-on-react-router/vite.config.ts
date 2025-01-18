import { reactRouter } from '@react-router/dev/vite'
import autoprefixer from 'autoprefixer'
import serverAdapter from 'hono-react-router-adapter/vite'
import tailwindcss from 'tailwindcss'
import { defineConfig } from 'vite'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  css: {
    postcss: {
      plugins: [tailwindcss, autoprefixer],
    },
  },
  plugins: [
    reactRouter(),
    serverAdapter({
      entry: 'server/index.ts',
    }),
    tsconfigPaths(),
  ],
})
