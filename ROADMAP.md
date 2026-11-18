# NimbusPanel — Roadmap Pengembangan Berkelanjutan

> Terakhir diperbarui: 19 November 2026
> Status: v1.0 — semua fase core selesai, E2E verified, security audit passed

---

## 🟢 Sprint 1 — Quick Wins (1-2 hari per item)

| # | Fitur | Deskripsi | Estimasi | Priority |
|---|---|---|---|---|
| 1 | **WordPress One-Click** | Form: pilih domain → auto download WP latest, buat DB, generate wp-config.php, set permissions, install → user langsung setup WP admin | 1 hari | HIGH |
| 2 | **SSH Terminal di Browser** | Web terminal (xterm.js + SSH2) untuk root/site-user tanpa buka PuTTY | 2 hari | HIGH |
| 3 | **Log Rotation Dashboard** | Lihat dan kelola logrotate config per situs + alert kalau log membengkak | 0.5 hari | MEDIUM |
| 4 | **Cron Job Manager** | CRUD cron jobs per situs dari panel (bukan cuma backup yang otomatis) | 1 hari | MEDIUM |
| 5 | **Backup Codes untuk 2FA** | Generate 10 one-time codes kalau HP hilang, tanpa perlu disable TOTP | 0.5 hari | HIGH |
| 6 | **Password Generator** | Built-in generator (16+ chars, copy to clipboard) di form DB/mailbox | 0.5 hari | LOW |

---

## 🟡 Sprint 2 — Email & Security Hardening (1 minggu)

| # | Fitur | Deskripsi | Estimasi | Priority |
|---|---|---|---|---|
| 7 | **rspamd Spam Filtering** | Antispam untuk email masuk (header scoring, greylisting, bayes) + dashboard quarantine | 3 hari | HIGH |
| 8 | **Mailbox Quota** | Per-mailbox disk quota (dovecot quota + postfix) + tampilan pemakaian di panel | 2 hari | MEDIUM |
| 9 | **ClamAV Antivirus** | Scan attachment email masuk, hapus/quarantine yang terinfeksi | 1 hari | MEDIUM |
| 10 | **IP Whitelist/Blacklist** | Panel access restriction by IP + per-site allow/deny lists | 1 hari | MEDIUM |
| 11 | **Session Management** | Lihat sesi aktif, force logout per device, auto-logout idle 30 menit | 1 hari | HIGH |
| 12 | **Audit Log UI** | Halaman untuk lihat search/filter audit trail (sudah tercatat, belum ada UI) | 1 hari | MEDIUM |

---

## 🟠 Sprint 3 — Developer Experience (1-2 minggu)

| # | Fitur | Deskripsi | Estimasi | Priority |
|---|---|---|---|---|
| 13 | **Site Templates** | Pre-built templates: WordPress, Laravel, static HTML, Next.js, Express.js | 2 hari | HIGH |
| 14 | **API Keys** | Generate API tokens untuk programmatic access (bukan cuma cookie session) | 1 hari | HIGH |
| 15 | **Multi-Admin** | Multiple admin accounts dengan roles (super admin, read-only) | 2 hari | MEDIUM |
| 16 | **Staging Environment** | Clone situs produksi ke staging.domain dengan satu klik | 2 hari | MEDIUM |
| 17 | **Resource Monitor per Site** | CPU/RAM per FPM pool + per Node.js app (tidak cuma server-wide) | 2 hari | MEDIUM |
| 18 | **Git Pull Button** | Tombol "Pull latest" untuk situs PHP yang di-deploy via git (tanpa full pipeline) | 0.5 hari | LOW |

---

## 🔵 Sprint 4 — Infrastruktur & Scale (2-3 minggu)

| # | Fitur | Deskripsi | Estimasi | Priority |
|---|---|---|---|---|
| 19 | **GitHub Actions CI/CD** | Automated testing + build + deploy ke server saat push ke main | 2 hari | HIGH |
| 20 | **Automated Testing** | Unit tests (backend) + E2E tests (Playwright) + security scan | 5 hari | HIGH |
| 21 | **Multi-Server Management** | Satu panel mengendalikan multiple VPS (master + agents) | 2 minggu | LOW |
| 22 | **Docker Mode (opsional)** | Per-site Docker containers untuk users yang mau isolasi lebih ketat | 1 minggu | LOW |
| 23 | **ARM64 Support** | Node.js ARM builds + provisioning test di ARM VPS | 1 hari | LOW |
| 24 | **Alpine Linux Support** | Minimal provisioning untuk Alpine (apk, OpenRC) | 3 hari | LOW |

---

## 🔴 Sprint 5 — Community & Growth (ongoing)

| # | Task | Deskripsi | Timeline |
|---|---|---|---|
| 25 | **Documentation Site** | docs.nimbuspanel.io dengan Docusaurus/VitePress | 1 minggu |
| 26 | **Video Tutorials** | YouTube: install, create first site, deploy Node.js, email setup | 3 video × 10 menit |
| 27 | **Community Channel** | Discord/Telegram untuk support dan discussion | Setup + moderate |
| 28 | **Contributing Guide** | CONTRIBUTING.md, code style, PR workflow, good first issues | 1 hari |
| 29 | **Domain nimbuspanel.io** | Beli domain + point ke server + update install script | 1 hari |
| 30 | **WordPress Plugin** | NimbusPanel WP plugin untuk auto-configure (optional) | Future |

---

## 📊 Dependency Map

```
Sprint 1 (Quick Wins)
  ├── #1 WordPress One-Click ──→ butuh: DB mgmt ✅, file upload ✅
  ├── #2 SSH Terminal ──→ butuh: WebSocket ✅
  └── #5 2FA Backup Codes ──→ butuh: TOTP ✅

Sprint 2 (Email & Security)
  ├── #7 rspamd ──→ butuh: Postfix ✅
  ├── #8 Quota ──→ butuh: Dovecot ✅
  └── #12 Audit UI ──→ butuh: audit_log table ✅

Sprint 3 (Dev Experience)
  ├── #13 Templates ──→ butuh: file manager ✅, DB ✅
  ├── #14 API Keys ──→ butuh: auth system ✅
  └── #16 Staging ──→ butuh: site CRUD ✅, backup/restore ✅

Sprint 4 (Infrastructure)
  ├── #19 CI/CD ──→ butuh: GitHub repo ✅
  └── #21 Multi-Server ──→ butuh: API keys (#14)
```

---

## 🎯 Milestone Targets

| Milestone | Target Date | Deliverables |
|---|---|---|
| **v1.1** | Des 2026 | Sprint 1 complete (#1-#6) |
| **v1.2** | Jan 2027 | Sprint 2 complete (#7-#12) |
| **v1.3** | Feb 2027 | Sprint 3 complete (#13-#18) |
| **v2.0** | Q2 2027 | Multi-server + CI/CD + docs site |

---

## 📝 Catatan Eksekusi

- Setiap sprint: develop lokal → mock preview test → deploy ke staging → E2E verify → deploy production
- Security audit setiap kali menambah fitur yang mengekspos attack surface baru
- Backup sebelum setiap deploy ke production
- Changelog di GitHub releases untuk setiap versi
- Tag setiap release: `git tag v1.1 && git push --tags`
