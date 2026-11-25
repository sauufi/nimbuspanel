# Cron Jobs

## Overview

NimbusPanel includes a cron job manager for each site. Jobs run as the site's Linux user with the correct environment.

## Adding a Cron Job

Site detail → **Cron** tab → **+ Add Job**:

1. **Select a schedule** (preset dropdown or custom cron expression)
2. **Enter the command** to run
3. Click **Add Cron Job**

### Preset Schedules

| Label | Cron Expression |
|---|---|
| Every minute | `* * * * *` |
| Every 5 minutes | `*/5 * * * *` |
| Every 15 minutes | `*/15 * * * *` |
| Every hour | `0 * * * *` |
| Every day at 02:00 | `0 2 * * *` |
| Every day at 06:00 | `0 6 * * *` |
| Every Monday 08:00 | `0 8 * * 1` |
| Every month (1st) 00:00 | `0 0 1 * *` |

### Custom Schedules

Standard cron format: `minute hour day-of-month month day-of-week`

```
*/10 * * * *     → every 10 minutes
30 4 * * *      → daily at 4:30 AM
0 0 * * 0       → every Sunday at midnight
0 9-17 * * 1-5  → weekdays 9AM-5PM hourly
```

### Common Commands

| Use Case | Command |
|---|---|
| WordPress cron | `php /var/www/yourdomain.com/htdocs/wp-cron.php` |
| Laravel scheduler | `php /var/www/yourdomain.com/htdocs/artisan schedule:run` |
| Node.js script | `node /var/www/yourdomain.com/current/worker.js` |
| Shell script | `bash /var/www/yourdomain.com/shared/backup.sh` |
| curl API | `curl -s https://api.example.com/ping > /dev/null` |

## Managing Jobs

| Action | How |
|---|---|
| Pause | Click the ⏸ power icon (job turns grey "paused") |
| Resume | Click the ▶ power icon again |
| Delete | Click the 🗑 trash icon + confirm |
| View all | Site detail → Cron tab (auto-refreshes) |

## Technical Details

- Jobs are stored in the **site user's crontab** (`crontab -l` as site user)
- Each job has a tag comment (`# panel-cron:<id>`) for tracking
- Commands run from the site's home directory (`/var/www/<domain>/`)
- No backtick (` ` `) allowed in commands (security)
- Maximum command length: 500 characters

## Viewing Raw Crontab

```bash
# On the server:
SITE_USER="site-$(printf '%s' 'yourdomain.com' | md5sum | cut -c1-8)"
runuser -u $SITE_USER -- crontab -l
```

Output:
```
# panel-cron:a1b2c3d4
*/5 * * * * php /var/www/yourdomain.com/htdocs/wp-cron.php
```

## Important Notes

- Cron jobs are **per-site** (not server-wide)
- The panel's own backup cron runs as root separately
- Changes take effect immediately (no restart needed)
- If a job fails, check output: the panel's Logs tab shows cron output via journald
