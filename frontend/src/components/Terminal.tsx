import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface TerminalProps {
  domain?: string
  asRoot?: boolean
  title: string
}

export default function Terminal({ domain, asRoot = false, title }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTerm | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const [connected, setConnected] = useState(false)
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!show || !containerRef.current) return

    const term = new XTerm({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'SF Mono, Fira Code, Consolas, monospace',
      theme: {
        background: '#0f172a',
        foreground: '#e2e8f0',
        cursor: '#10b981',
        selectionBackground: '#334155',
      },
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()
    termRef.current = term

    term.writeln('\x1b[1;34m[NimbusPanel]\x1b[0m Connecting...')
    term.writeln('')

    const params = new URLSearchParams()
    if (domain) params.set('domain', domain)
    if (asRoot) params.set('root', '1')
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${proto}//${location.host}/api/terminal/ws?${params}`)

    ws.onopen = () => setConnected(true)
    ws.onclose = () => {
      setConnected(false)
      term.writeln('\r\n\x1b[1;33m[NimbusPanel]\x1b[0m Disconnected.')
    }

    ws.onmessage = (ev: MessageEvent) => {
      term.write(ev.data as string)
    }

    term.onData((data: string) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data)
    })

    // Handle resize
    const resizeHandler = (): void => {
      fitAddon.fit()
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(`\x01${JSON.stringify({ cols: term.cols, rows: term.rows })}`)
      }
    }
    window.addEventListener('resize', resizeHandler)
    const resizeInterval = setInterval(resizeHandler, 1000)

    wsRef.current = ws
    term.focus()

    return () => {
      window.removeEventListener('resize', resizeHandler)
      clearInterval(resizeInterval)
      ws.close()
      term.dispose()
    }
  }, [show, domain, asRoot])

  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          <span className={`flex items-center gap-1 text-xs ${connected ? 'text-emerald-600' : 'text-slate-400'}`}>
            <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            {connected ? 'connected' : 'disconnected'}
          </span>
        </div>
        {!show ? (
          <button
            onClick={() => setShow(true)}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-slate-800"
          >
            ▶ Open Terminal
          </button>
        ) : (
          <button
            onClick={() => { setShow(false); setConnected(false) }}
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600"
          >
            ✕ Close
          </button>
        )}
      </div>
      {show && (
        <div
          ref={containerRef}
          className="h-[480px] overflow-hidden rounded-lg border border-slate-800"
        />
      )}
    </section>
  )
}
