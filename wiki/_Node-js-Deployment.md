# Node.js Deployment

NimbusPanel includes a full CI/CD-style deploy pipeline for Node.js applications — git clone → build → release → health check → auto-rollback.

## Setting Up a Node.js Site

1. **Sites** → **+ Add Site** → select **Node.js**
2. Enter your domain — a proxy vhost is created with an auto-allocated internal port (31001+)
3. Open the site detail → **Deploy** tab

## Deploy Settings

| Field | Description | Example |
|---|---|---|
| Repository | Public https URL, private repo (with token), or local path | `https://github.com/user/app.git` |
| Branch | Git branch to deploy | `main` |
| Node version | Installed Node.js version | `22` |
| Build command | Optional build step | `npm run build` |
| Start command | How to start the app | `node dist/index.js` or `npm start` |

## Deploy Flow

```
[1/6] Fetching code (git clone/fetch)
[2/6] Building new release (npm install + build)
[3/6] Installing systemd unit (app-<id>.service)
[4/6] Activating release (symlink flip)
[5/6] Health check (HTTP on port — max 45s)
[6/6] Pruning old releases (keep 5)
```

If health check fails → **automatic rollback** to previous release.

## Private Repositories

To deploy from private GitHub repos:

1. Go to **Settings → Git Credentials**
2. Follow the step-by-step guide to create a GitHub Fine-grained PAT
3. Paste the token → it's verified and saved
4. Deploy from private repos — token is auto-injected

**Supported token types:** `ghp_*` (classic PAT) and `github_pat_*` (fine-grained)

## Next.js Optimization

If your Next.js project uses `output: 'standalone'` in `next.config.ts`, the deploy pipeline automatically:
- Detects the standalone output
- Copies static assets into the standalone directory
- Removes the full `node_modules` (~520MB)
- Result: **83MB per release** instead of 623MB

```javascript
// next.config.ts
const nextConfig = { output: 'standalone' }
export default nextConfig
```

## Auto-Deploy Webhooks

Push to deploy — no need to open the panel.

### GitHub
1. Site detail → **Deploy** tab → copy the **Payload URL**
2. GitHub repo → Settings → Webhooks → Add webhook
3. Payload URL: `https://your-panel.com/api/hooks/<site-id>`
4. Content type: `application/json`
5. Secret: from the panel (click "Generate secret")
6. Push to your branch → deploy triggers automatically

### GitLab
1. Same as above, but use the secret as the **token**
2. Add webhook in GitLab → Settings → Webhooks

## Environment Variables

Site detail → **Env Vars** tab:

```
DATABASE_URL=mysql://user:pass@localhost/dbname
API_KEY=your-api-key
JWT_SECRET=super-secret
```

Variables are written to `shared/.env` and loaded by systemd. `PORT` and `NODE_ENV` are set automatically.

## Rollback

Site detail → **Deploy** tab → **Rollback previous release** — flips the symlink back to the previous release and restarts.

## Live Logs

Site detail → **Logs** tab → **Connect** — real-time log streaming from journald (systemd). See stdout/stderr from your Node.js app as it runs.

## Releases

- Each deploy creates a timestamped release: `releases/20261125-143000/`
- The `current` symlink points to the active release
- 5 most recent releases are kept; older ones are pruned
- Rollback switches `current` to the previous release

## Directory Structure

```
/var/www/yourdomain.com/
├── repo/               # git clone (source of truth)
├── releases/
│   ├── 20261125-1430/ # latest release
│   ├── 20261125-1200/
│   └── 20261125-0900/
├── shared/
│   └── .env           # environment variables (persistent)
├── current -> releases/20261125-1430/  # symlink
└── logs/
```
