import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
const netlifyHeaders = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8')

function parseHeadersFile(text) {
  const rules = {}
  let current = null
  for (const line of text.split('\n')) {
    if (!line.trim() || line.startsWith('#')) continue
    if (!line.startsWith(' ')) {
      current = line.trim()
      rules[current] = {}
    } else {
      const i = line.indexOf(':')
      rules[current][line.slice(0, i).trim()] = line.slice(i + 1).trim()
    }
  }
  return rules
}

describe('deployment config', () => {
  it('serves the same security headers on Vercel and Netlify/Cloudflare', () => {
    const parsed = parseHeadersFile(netlifyHeaders)
    for (const rule of vercel.headers) {
      const glob = rule.source.replace('/(.*)', '/*')
      expect(parsed[glob], glob).toEqual(Object.fromEntries(rule.headers.map((h) => [h.key, h.value])))
    }
  })

  it('locks the page down while allowing what the eye tracker needs', () => {
    const csp = vercel.headers[0].headers.find((h) => h.key === 'Content-Security-Policy').value
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("'wasm-unsafe-eval'") // MediaPipe's WebAssembly
    expect(csp).toContain("worker-src 'self'") // face tracking runs in a worker
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).not.toMatch(/'unsafe-eval'|'unsafe-inline'/)
    const perms = vercel.headers[0].headers.find((h) => h.key === 'Permissions-Policy').value
    expect(perms).toContain('camera=(self)')
    expect(perms).toContain('microphone=()')
  })

  it('does not rewrite missing build files to the app page', () => {
    const re = new RegExp(`^${vercel.rewrites[0].source}$`)
    expect(re.test('/learn/1.1')).toBe(true)
    expect(re.test('/assets/index-abc.js')).toBe(false)
    expect(re.test('/models/face_landmarker.task')).toBe(false)
  })
})
