import { spawn } from 'node:child_process'
import { resolve } from 'node:path'

const [harnessDirArg, dshHomeArg, portArg = '3093'] = process.argv.slice(2)
if (!harnessDirArg || !dshHomeArg) {
  throw new Error('Usage: node scripts/verify-harness-install.mjs <harness-dir> <dsh-home> [port]')
}

const harnessDir = resolve(harnessDirArg)
const dshHome = resolve(dshHomeArg)
const port = Number(portArg)
if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error(`Invalid port: ${portArg}`)

const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const child = spawn(command, ['dsh', '--profile', 'web', '--no-open', '--port', String(port)], {
  cwd: harnessDir,
  detached: process.platform !== 'win32',
  env: { ...process.env, DSH_HOME: dshHome },
  stdio: ['ignore', 'pipe', 'pipe'],
})

let logs = ''
const append = chunk => { logs = `${logs}${chunk}`.slice(-20_000) }
child.stdout.on('data', append)
child.stderr.on('data', append)

const exited = new Promise(resolveExit => child.once('exit', (code, signal) => resolveExit({ code, signal })))
const origin = `http://127.0.0.1:${port}`

try {
  await waitUntilReady(origin, child, logsRef)

  const root = await fetch(`${origin}/`)
  assert(root.status === 200, `Harness root returned ${root.status}`)
  const html = await root.text()
  assert(html.includes('"id":"dsh-os-agent-plugin"'), 'Harness boot manifest omits dsh-os-agent-plugin')

  const rejected = await fetch(`${origin}/api/os-agent-plugin/config`)
  assert(rejected.status === 403, `Unmarked configuration request returned ${rejected.status}`)

  const configResponse = await fetch(`${origin}/api/os-agent-plugin/config`, {
    headers: { 'x-os-agent-plugin': '1' },
  })
  assert(configResponse.status === 200, `Configuration request returned ${configResponse.status}`)
  const payload = await configResponse.json()
  assert(payload.ok === true, 'Configuration endpoint did not return ok=true')
  assert(!Object.hasOwn(payload.config, 'accessKey'), 'Configuration endpoint exposed AccessKey')
  assert(!Object.hasOwn(payload.config, 'secretKey'), 'Configuration endpoint exposed Secret Key')

  const clientResponse = await fetch(`${origin}/plugins/dsh-os-agent-plugin/client.js`)
  assert(clientResponse.status === 200, `Client module returned ${clientResponse.status}`)
  const client = await clientResponse.text()
  assert(client.includes('window.__ModuleLoader__.load'), 'Client module is not a Harness module')
  assert(client.includes('settings.plugins.tab'), 'Client module does not register the settings tab')

  process.stdout.write(`${JSON.stringify({
    ok: true,
    origin,
    pluginInBootManifest: true,
    configEndpointProtected: true,
    credentialsRedacted: true,
    clientModuleServed: true,
  }, null, 2)}\n`)
} finally {
  stopChild('SIGTERM')
  await Promise.race([exited, new Promise(resolveWait => setTimeout(resolveWait, 5_000))])
  stopChild('SIGKILL')
  child.stdout.destroy()
  child.stderr.destroy()
}

function logsRef() {
  return logs
}

async function waitUntilReady(baseUrl, processHandle, readLogs) {
  const deadline = Date.now() + 60_000
  while (Date.now() < deadline) {
    if (processHandle.exitCode !== null || processHandle.signalCode !== null) {
      throw new Error(`Harness exited before becoming ready.\n${readLogs()}`)
    }
    try {
      const response = await fetch(`${baseUrl}/`)
      if (response.ok) return
    } catch {
      // The TCP listener is not ready yet.
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 250))
  }
  throw new Error(`Harness did not become ready within 60 seconds.\n${readLogs()}`)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function stopChild(signal) {
  if (child.exitCode !== null || child.signalCode !== null) return
  try {
    if (process.platform === 'win32') child.kill(signal)
    else process.kill(-child.pid, signal)
  } catch (error) {
    if (error?.code !== 'ESRCH') throw error
  }
}
