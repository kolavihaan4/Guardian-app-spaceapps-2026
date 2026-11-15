import { defineConfig } from 'vitest/config'

export default defineConfig({
  // API tests run several deliberately slow scrypt password hashes; give them headroom on busy machines.
  test: { name: 'server', environment: 'node', include: ['test/**/*.test.ts'], testTimeout: 20_000 },
})
