import { WebSocketServer, WebSocket } from 'ws'
import { Client as SSHClient } from 'ssh2'
import type { FastifyInstance } from 'fastify'
import { audit, db } from './db'
import { requireAuth } from './auth'

/**
 * SSH Terminal via WebSocket — xterm.js frontend connects to /api/terminal/ws,
 * backend opens an SSH session as the site's Linux user (or root for the
 * global terminal) and pipes stdin/stdout.
 *
 * The panel user's SSH access uses the panel's own key pair (generated
 * on first use, stored at /opt/panel/etc/ssh_key).
 */

interface TerminalSession {
  ws: WebSocket
  ssh: SSHClient
  stream: import('ssh2').ClientChannel | null
}

const sessions = new Set<TerminalSession>()

export function setupTerminal(app: FastifyInstance, server: import('http').Server): void {
  const wss = new WebSocketServer({ server, path: '/api/terminal/ws' })

  wss.on('connection', async (ws: WebSocket, req: import('http').IncomingMessage) => {
    // Authenticate via cookie (the browser sends it with the WS upgrade)
    const cookies = req.headers.cookie ?? ''
    const sessionMatch = cookies.match(/panel_session=([^;]+)/)
    if (!sessionMatch) {
      ws.close(4001, 'unauthorized')
      return
    }

    // Validate the JWT session
    const { jwtSecret } = await import('./db')
    const { jwtVerify } = await import('jose')
    try {
      await jwtVerify(sessionMatch[1], jwtSecret())
    } catch {
      ws.close(4001, 'unauthorized')
      return
    }

    // Determine target user from query param
    const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
    const domain = url.searchParams.get('domain')
    const asRoot = url.searchParams.get('root') === '1'

    let username: string
    if (asRoot) {
      username = 'root'
    } else if (domain) {
      const site = db.prepare('SELECT domain FROM sites WHERE domain = ?').get(domain)
      if (!site) { ws.close(4004, 'site not found'); return }
      username = `site-$(printf '%s' '${domain}' | md5sum | cut -c1-8)`
      // compute the hash in JS
      const crypto = await import('node:crypto')
      const hash = crypto.createHash('md5').update(domain).digest('hex').slice(0, 8)
      username = `site-${hash}`
    } else {
      username = 'root'
    }

    const ssh = new SSHClient()
    const session: TerminalSession = { ws, ssh, stream: null }
    sessions.add(session)

    ws.send(`\r\n\x1b[1;32m[NimbusPanel]\x1b[0m Connecting as ${username}...\r\n`)

    ssh.on('ready', () => {
      ssh.shell({ term: 'xterm-256color', cols: 120, rows: 30 }, (err, stream) => {
        if (err) {
          ws.send(`\r\n\x1b[1;31m[error]\x1b[0m Shell failed: ${err.message}\r\n`)
          ws.close()
          return
        }
        session.stream = stream
        ws.send(`\r\n\x1b[1;32m[NimbusPanel]\x1b[0m Connected as ${username}\x1b[0m\r\n\r\n`)

        stream.on('data', (data: Buffer) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(data.toString('utf-8'))
        })
        stream.stderr.on('data', (data: Buffer) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(data.toString('utf-8'))
        })

        stream.on('close', () => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('\r\n\x1b[1;33m[NimbusPanel]\x1b[0m Session closed.\r\n')
            ws.close()
          }
        })

        // Handle resize
        ws.on('message', (msg: Buffer, isBinary: boolean) => {
          if (isBinary) return
          const data = msg.toString('utf-8')
          // Check for resize commands (JSON from xterm.js addon)
          if (data.startsWith('\x01{"cols":')) {
            try {
              const dims = JSON.parse(data.slice(1))
              if (stream && dims.cols && dims.rows) stream.setWindow(dims.rows, dims.cols, 0, 0)
            } catch { /* ignore malformed resize */ }
            return
          }
          if (stream) stream.write(data)
        })
      })
    })

    ssh.on('error', (err: Error) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(`\r\n\x1b[1;31m[error]\x1b[0m SSH: ${err.message}\r\n`)
      }
    })

    ssh.on('close', () => {
      sessions.delete(session)
      if (ws.readyState === WebSocket.OPEN) ws.close()
    })

    ws.on('close', () => {
      session.stream?.close()
      ssh.end()
      sessions.delete(session)
    })

    // Connect via localhost SSH using the panel's key
    const fs = await import('node:fs')
    const crypto = await import('node:crypto')
    const keyPath = '/opt/panel/etc/ssh_key'
    let privateKey: Buffer
    try {
      privateKey = fs.readFileSync(keyPath)
    } catch {
      // Generate an ed25519 key if not present — simpler approach:
      // use ssh-keygen via exec for proper SSH format
      const { execSync } = await import('node:child_process')
      fs.mkdirSync('/opt/panel/etc', { recursive: true })
      try {
        execSync(`ssh-keygen -t ed25519 -f ${keyPath} -N "" -C nimbuspanel -q`, { timeout: 5000 })
        // Append pubkey to root authorized_keys
        const pubKey = fs.readFileSync(`${keyPath}.pub`, 'utf-8').trim()
        const authKeysPath = '/root/.ssh/authorized_keys'
        const existing = fs.existsSync(authKeysPath) ? fs.readFileSync(authKeysPath, 'utf-8') : ''
        if (!existing.includes('nimbuspanel')) {
          fs.appendFileSync(authKeysPath, `${pubKey}\n`)
        }
        privateKey = fs.readFileSync(keyPath)
      } catch {
        // Fallback: connect without key (will fail, but show clear error)
        ws.send('\r\n\x1b[1;31m[error]\x1b[0m Cannot generate SSH key. Run provisioning first.\r\n')
        ws.close()
        return
      }
    }

    ssh.connect({
      host: '127.0.0.1',
      port: 22,
      username,
      privateKey,
      readyTimeout: 10_000,
    })

    audit('terminal.open', { username, domain: domain ?? null })
  })
}
