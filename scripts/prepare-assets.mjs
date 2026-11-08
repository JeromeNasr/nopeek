// Copies the MediaPipe WASM runtime from node_modules into public/ so the app
// serves it from its own origin (no third-party CDN, nothing leaves the device).
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')
const dest = join(root, 'public', 'mediapipe', 'wasm')
if (!existsSync(src)) {
  console.warn('[prepare-assets] @mediapipe/tasks-vision not installed; skipping')
  process.exit(0)
}
mkdirSync(dest, { recursive: true })
cpSync(src, dest, { recursive: true })
console.log('[prepare-assets] copied MediaPipe wasm ->', dest)
