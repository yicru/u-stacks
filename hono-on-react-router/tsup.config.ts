import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    server: 'server/index.ts',
  },
  format: 'esm',
  outDir: 'types',
  dts: {
    only: true,
  },
})
