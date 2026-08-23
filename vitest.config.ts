import { defineConfig } from 'vitest/config'
import path from 'node:path'
import fs from 'node:fs'

function loadLocalEnv() {
  const envPath = path.resolve(__dirname, '.env.local')
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n')
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0) {
        const k = trimmed.slice(0, eqIdx).trim()
        let v = trimmed.slice(eqIdx + 1).trim()
        if (
          (v.startsWith('"') && v.endsWith('"')) ||
          (v.startsWith("'") && v.endsWith("'"))
        ) {
          v = v.slice(1, -1)
        }
        if (!process.env[k]) {
          process.env[k] = v
        }
      }
    }
  }
}
loadLocalEnv()

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
  test: {
    passWithNoTests: true,
  },
})