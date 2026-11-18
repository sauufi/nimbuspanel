import path from 'node:path'

export const CONFIG = {
  host: process.env.HOST ?? '127.0.0.1',
  port: Number(process.env.PORT ?? 3444),
  // Di server di-set lewat systemd: /opt/panel/etc/panel.db (punya user panel)
  dbPath: process.env.PANEL_DB ?? path.join(process.cwd(), 'data', 'panel.db'),
  // Helper sudo terkunci (root-owned) — lihat provision/bin/
  binDir: process.env.PANEL_BIN ?? '/opt/panel/bin',
  // Hasil build frontend (di-copy deploy.sh sebagai sibling dist backend)
  publicDir: process.env.PUBLIC_DIR ?? path.resolve(__dirname, '..', 'public'),
}
