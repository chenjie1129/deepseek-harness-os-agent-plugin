import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('DeepSeek Harness plugin package', () => {
  it('declares both bundle and browser faces', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
    expect(pkg.dsh.bundle.patch).toBe('./cordis.patch.yml')
    expect(pkg.dsh.client.platform).toBe('web')
    expect(pkg.exports['./client']).toBe('./lib/client.js')
  })

  it('ships a client bundle registered under the package id', async () => {
    const bundle = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
    expect(bundle).toContain('window.__ModuleLoader__.load')
    expect(bundle).toContain('id: "dsh-os-agent-plugin"')
    expect(bundle).toContain('settings.plugins.tab')
  })
})
