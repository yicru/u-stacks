import { defineConfig } from 'vite-plus'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

export default defineConfig({
  plugins: [
    devtools(),
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  lint: {
    ignorePatterns: [
      'src/components/ui',
      'node_modules',
      '.wrangler',
      'dist',
      '.tanstack',
    ],
  },
  fmt: {
    printWidth: 80,
    tabWidth: 2,
    useTabs: false,
    semi: false,
    singleQuote: true,
    trailingComma: 'all',
    ignorePatterns: [
      'src/components/ui',
      'src/routeTree.gen.ts',
      'node_modules',
      '.wrangler',
      'dist',
      '.tanstack',
    ],
  },
})
