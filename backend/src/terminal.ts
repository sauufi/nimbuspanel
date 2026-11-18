import { WebSocketServer, WebSocket } from 'ws'
import { Client as SSHClient } from 'ssh2'
import { readFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import type { FastifyInstance } from 'fastify'
import { db, jwtSecret } from './db'
import { jwtVerify } from 'jose'
import crypto from 'node:crypto'

/**
 * SSH Terminal via WebSocket — xterm.js frontend connects to /api/terminal/ws,
 * backend opens an SSH session as root (or the site's Linux user) and pipes I/O.
 */

export function setupTerminal(app: FastifyInstance, server: import('http').Server): void {
  const wss = new WebSocketServer({ server, path: '/api/terminal/ws' })

  wss.on('connection', async (ws: WebSocket, req: import('http').IncomingMessage) => {
    let isClosed = false
    const safeSend = (data: string): void => {
      if (!isClosed && ws.readyState === WebSocket.OPEN) ws.send(data)
    }

    ws.on('close', () => { isClosed = true })

    // ---- Auth via cookie (await JWT verification) ----
    const cookies = req.headers.cookie ?? ''
    const sessionMatch = cookies.match(/panel_session=([^;]+)/)
    if (!sessionMatch) {
      console.log('[terminal] no session cookie found, cookies:', cookies.substring(0, 50))
      ws.close(4001, 'unauthorized')
      return
    }
    console.log('[terminal] session token found, length:', sessionMatch[1].length)

    try {
      await jwtVerify(sessionMatch[1], jwtSecret())
      console.log('[terminal] JWT verified OK')
    } catch (err) {
      console.error('[terminal] JWT verification failed:', err instanceof Error ? err.message : err)
      ws.close(4001, 'unauthorized')
      return
    }

    // ---- Determine target user ----
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    const domain = url.searchParams.get('domain')
    const asRoot = url.searchParams.get('root') === '1'

    let username = 'root'
    if (!asRoot && domain) {
      const site = db.prepare('SELECT domain FROM sites WHERE domain = ?').get(domain)
      if (!site) { ws.close(4004, 'site not found'); return }
      const hash = crypto.createHash('md5').update(domain).digest('hex').slice(0, 8)
      username = `site-${hash}`

      // Ensure SSH access for this site user (shell + pubkey)
      const { execFile } = await import('node:child_process')
      const execPromise = (cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> =>
        new Promise((resolve) => {
          execFile(cmd, args, { timeout: 10_000 }, (err, stdout, stderr) =>
            resolve({ stdout: stdout?.toString() ?? '', stderr: stderr?.toString() ?? err?.message ?? '' }))
        })
      const setup = await execPromise('/usr/bin/sudo', ['/opt/panel/bin/panel-site-ssh-setup', domain])
      if (setup.stderr && !setup.stdout.includes('OK')) {
        safeSend(`\r\n\x1b[1;33m[warn]\x1b[0m SSH setup: ${setup.stderr.trim()}\r\n`)
      }
    }

    safeSend(`\r\n\x1b[1;32m[NimbusPanel]\x1b[0m Connecting as ${username}...\r\n`)

    // ---- Read or create SSH key ----
    const keyPath = '/opt/panel/etc/ssh_key'
    let privateKey: Buffer

    try {
      if (existsSync(keyPath)) {
        privateKey = readFileSync(keyPath)
      } else {
        // Generate key using ssh-keygen (reliable format)
        mkdirSync('/opt/panel/etc', { recursive: true })
        execSync(`ssh-keygen -t ed25519 -f ${keyPath} -N "" -C nimbuspanel -q`, {
          timeout: 5000,
          uid: 0, // run as root to write to /opt/panel/etc
        })
        // Append pubkey to root authorized_keys
        const pubKey = readFileSync(`${keyPath}.pub`, 'utf-8').trim()
        const authKeysPath = '/root/.ssh/authorized_keys'
        const existing = existsSync(authKeysPath) ? readFileSync(authKeysPath, 'utf-8') : ''
        if (!existing.includes('nimbuspanel')) {
          appendFileSync(authKeysPath, `${pubKey}\n`)
        }
        // Fix ownership
        execSync(`chown panel:panel ${keyPath} ${keyPath}.pub && chmod 0600 ${keyPath}`)
        privateKey = readFileSync(keyPath)
      }
    } catch (err) {
      safeSend(`\r\n\x1b[1;31m[error]\x1b[0m SSH key setup failed: ${err instanceof Error ? err.message : String(err)}\r\n`)
      ws.close()
      return
    }

    // ---- SSH connection ----
    const ssh = new SSHClient()

    ssh.on('ready', () => {
      safeSend(`\r\n\x1b[1;32m[NimbusPanel]\x1b[0m Connected as ${username}\x1b[0m\r\n\r\n`)

      ssh.shell({ term: 'xterm-256color', cols: 120, rows: 30 }, (err, stream) => {
        if (err) {
          safeSend(`\r\n\x1b[1;31m[error]\x1b[0m Shell: ${err.message}\r\n`)
          ws.close()
          return
        }

        stream.on('data', (data: Buffer) => safeSend(data.toString('utf-8')))
        stream.stderr.on('data', (data: Buffer) => safeSend(data.toString('utf-8')))

        stream.on('close', () => {
          safeSend('\r\n\x1b[1;33m[NimbusPanel]\x1b[0m Session closed.\r\n')
          if (!isClosed) ws.close()
        })

        ws.on('message', (msg: Buffer, isBinary: boolean) => {
          if (isBinary) return
          const data = msg.toString('utf-8')
          // Resize command (JSON prefixed with \x01)
          if (data.startsWith('\x01{')) {
            try {
              const dims = JSON.parse(data.slice(1))
              if (stream && dims.cols && dims.rows) stream.setWindow(dims.rows, dims.cols, 0, 0)
            } catch { /* malformed resize */ }
            return
          }
          if (stream && !isClosed) stream.write(data)
        })
      })
    })

    ssh.on('error', (err: Error) => {
      safeSend(`\r\n\x1b[1;31m[error]\x1b[0m SSH: ${err.message}\r\n`)
    })

    ssh.on('close', () => {
      if (!isClosed) {
        safeSend('\r\n\x1b[1;33m[NimbusPanel]\x1b[0m SSH connection closed.\r\n')
        ws.close()
      }
    })

    ws.on('close', () => {
      isClosed = true
      ssh.end()
    })

    try {
      ssh.connect({
        host: '127.0.0.1',
        port: 22,
        username,
        privateKey,
        readyTimeout: 10_000,
      })
    } catch (err) {
      safeSend(`\r\n\x1b[1;31m[error]\x1b[0m SSH connect: ${err instanceof Error ? err.message : String(err)}\r\n`)
      ws.close()
    }
  })
}
