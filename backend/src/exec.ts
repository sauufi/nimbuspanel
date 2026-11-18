import { spawn } from 'node:child_process'
import path from 'node:path'
import { CONFIG } from './config'

export interface ExecResult {
  code: number
  stdout: string
  stderr: string
}

interface RunOptions {
  timeoutMs?: number
  /** Kirim string ke stdin proses (mis. konten .env) */
  input?: string
}

function run(cmd: string, args: string[], opts: RunOptions): Promise<ExecResult> {
  const { timeoutMs = 180_000, input } = opts
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      stdio: [input !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => proc.kill('SIGKILL'), timeoutMs)
    if (input !== undefined) {
      proc.stdin!.on('error', () => undefined) // EPIPE bila proses mati duluan
      proc.stdin!.write(input)
      proc.stdin!.end()
    }
    proc.stdout!.on('data', (d) => (stdout += d))
    proc.stderr!.on('data', (d) => (stderr += d))
    proc.on('error', (err) => {
      clearTimeout(timer)
      resolve({ code: -1, stdout, stderr: `${stderr}${String(err)}` })
    })
    proc.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, stdout, stderr })
    })
  })
}

/**
 * Jalankan helper root via sudo whitelist — TANPA shell (args array,
 * tidak ada interpolasi string). Helper memvalidasi argumennya sendiri.
 */
export function sudo(args: string[], opts: RunOptions = {}): Promise<ExecResult> {
  return run('/usr/bin/sudo', [path.join(CONFIG.binDir, args[0]), ...args.slice(1)], opts)
}

/** Jalankan perintah lokal sebagai user panel (tanpa sudo) */
export function local(cmd: string, args: string[], opts: RunOptions = {}): Promise<ExecResult> {
  return run(cmd, args, opts)
}

/** Ambil ekor output untuk pesan error yang enak dibaca */
export function tail(text: string, max = 1500): string {
  const t = text.trim()
  return t.length > max ? `…${t.slice(-max)}` : t
}
