/** Build the browser half in Harness's client-module registration format. */

import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { build } from 'esbuild'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
await mkdir(resolve(root, 'lib'), { recursive: true })

await build({
  absWorkingDir: root,
  entryPoints: ['src/client/index.ts'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2022'],
  jsx: 'automatic',
  external: ['react', 'react/*', '@deepseek-ai/*'],
  legalComments: 'none',
  banner: {
    js: 'window.__ModuleLoader__.load({\n  id: "dsh-os-agent-plugin",\n  factory: (require) => {\n    var module = { exports: {} };\n    var exports = module.exports;',
  },
  footer: {
    js: '    return module.exports;\n  }\n});',
  },
})
