import { defineConfig } from 'vite-plus'
import { bindings } from 'cf/config'
import { devtools } from '@tanstack/devtools-vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { cloudflare } from '@cloudflare/vite-plugin'

const localTursoUrl = process.env.SHADOW_LOCAL_TURSO_URL

export default defineConfig({
  plugins: [
    devtools(),
    cloudflare({
      viteEnvironment: { name: 'ssr' },
      config: localTursoUrl
        ? (config) => ({
            env: {
              ...config.env,
              TURSO_AUTH_TOKEN: bindings.text(''),
              TURSO_DATABASE_URL: bindings.text(localTursoUrl),
            },
          })
        : undefined,
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
  resolve: {
    tsconfigPaths: true,
  },
  lint: {
    jsPlugins: ['@shadcn/lint'],
    rules: {
      'shadcn/no-raw-colors': 'error',
      'shadcn/no-unknown-classes': 'error',
    },
    ignorePatterns: [
      'src/components/ui',
      '.agents/skills',
      'node_modules',
      '.wrangler',
      '.cloudflare',
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
      '.agents/skills',
      'src/routeTree.gen.ts',
      'node_modules',
      '.wrangler',
      '.cloudflare',
      'dist',
      '.tanstack',
    ],
  },
})
