import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const vendor = (p) => fileURLToPath(new URL(`./src/vendor/monkeytype/${p}`, import.meta.url))

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // lets the unmodified, vendored Monkeytype files resolve their package imports
      '@monkeytype/util/numbers': vendor('packages/util/src/numbers.ts'),
      '@monkeytype/schemas/configs': vendor('stubs/schemas.ts'),
      '@monkeytype/schemas/util': vendor('stubs/schemas.ts'),
      '@monkeytype/schemas/languages': vendor('stubs/schemas.ts'),
      // only used for Korean text, which TouchType does not offer
      'hangul-js': vendor('stubs/hangul.ts'),
    },
  },
  worker: { format: 'es' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
})
