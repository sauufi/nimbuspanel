import fs from 'node:fs'
import os from 'node:os'
import type { FastifyInstance } from 'fastify'
import { requireAuth } from './auth'
import { sudo } from './exec'
import { db } from './db'

function readMeminfo(): Record<string, number> {
  const out: Record<string, number> = {}
  try {
    for (const line of fs.readFileSync('/proc/meminfo', 'utf8').split('\n')) {
      const m = line.match(/^(\w+):\s+(\d+) kB$/)
      if (m) out[m[1]] = Number(m[2]) * 1024
    }
  } catch {
    // dev di non-Linux — fallback kasar via os
    out.MemTotal = os.totalmem()
    out.MemAvailable = os.freemem()
    out.SwapTotal = 0
    out.SwapFree = 0
  }
  return out
}

function readDisk() {
  try {
    const st = fs.statfsSync('/') as unknown as { bsize: number; blocks: number; bavail: number }
    return {
      totalGb: Math.round(((st.bsize * st.blocks) / 1e9) * 10) / 10,
      freeGb: Math.round(((st.bsize * st.bavail) / 1e9) * 10) / 10,
    }
  } catch {
    return null
  }
}

export function installedPhpVersions(): string[] {
  try {
    return fs
      .readdirSync('/etc/php')
      .filter((d) => /^\d+\.\d+$/.test(d))
      .sort()
  } catch {
    return []
  }
}

export async function systemRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/system/metrics', { preHandler: [requireAuth] }, async () => {
    const mem = readMeminfo()
    const total = mem.MemTotal ?? 0
    const available = mem.MemAvailable ?? 0
    return {
      mem: {
        totalMb: Math.round(total / 1e6),
        usedMb: Math.round((total - available) / 1e6),
        usedPct: total ? Math.round(((total - available) / total) * 100) : 0,
      },
      swap: {
        totalMb: Math.round((mem.SwapTotal ?? 0) / 1e6),
        freeMb: Math.round((mem.SwapFree ?? 0) / 1e6),
      },
      load: os.loadavg(),
      cores: os.cpus().length,
      uptimeSec: Math.round(os.uptime()),
      disk: readDisk(),
      hostname: os.hostname(),
    }
  })

  app.get('/api/system/services', { preHandler: [requireAuth] }, async () => {
    // app-<id> untuk setiap situs node (unit dikelola panel)
    const nodeUnits = (
      db.prepare("SELECT id FROM sites WHERE type = 'node'").all() as { id: number }[]
    ).map((r) => `app-${r.id}`)
    const apacheUnits = fs.existsSync('/etc/apache2') ? ['apache2'] : []
    const units = ['nginx', ...installedPhpVersions().map((v) => `php${v}-fpm`), 'panel', ...apacheUnits, ...nodeUnits]
    const statuses = await Promise.all(
      units.map(async (unit) => {
        const res = await sudo(['panel-systemctl', 'is-active', unit])
        return { unit, active: res.code === 0 && res.stdout.trim() === 'active' }
      }),
    )
    return { services: statuses }
  })
}
