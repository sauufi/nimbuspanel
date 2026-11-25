# Backups

## Backup Settings

**Backups** page → **Automatic Backups** card:

| Setting | Description | Default |
|---|---|---|
| Enable/Disable | Turn scheduled backups on/off | Enabled |
| Run daily at | Time (HH:MM) to run backup | 02:30 |
| Retention | Number of backup sets to keep (1-90) | 14 |
| Scope | What to include | Everything |

### Scope Options

| Scope | Includes |
|---|---|
| **Everything** | Site archives + database dumps + panel database |
| **Sites only** | Just site files (htdocs, shared, configs) |
| **Databases only** | Just MariaDB dumps + panel.db |

## Manual Backup

**Backups** page → **Back Up Now**:

1. Select scope (Everything / Sites / Databases)
2. Click **Back Up Now**
3. Wait for completion — a new backup set appears

Manual backups count toward retention (if retention is 14 and you run 3 manual backups, the oldest 3 automatic ones may be pruned).

## What's in a Backup Set

Each backup set (directory) contains:

```
/var/backups/panel/20261125-023001/
├── site-yourdomain.com.tar.gz    # site archive (no repo/releases/logs)
├── db-yourdatabase.sql.gz        # database dump
├── db-wordpress_db.sql.gz        # another database
├── panel.db                      # panel's own database
└── panel.db-wal                  # SQLite WAL file
```

**Site archives exclude:** `repo/` (git source), `releases/` (build artifacts), `logs/` — these are rebuildable from git + build.

## Restore

**Backups** page → find the file → **Restore** button:

| File Type | What Happens |
|---|---|
| `site-<domain>.tar.gz` | Site files extracted to `/var/www/<domain>/` |
| `db-<name>.sql.gz` | Database is recreated and data imported |

**Warning:** Restore overwrites current data. Always confirm before proceeding.

## Download

**Backups** page → **Download** button — downloads any backup file to your computer.

## Delete

**Backups** page → **Delete** button — removes a single backup file.

## Offsite Sync (rclone)

For automatic offsite backup to S3, Backblaze B2, Google Drive, etc.:

1. Install rclone on the server:
   ```bash
   curl https://rclone.org/install.sh | bash
   ```

2. Configure a remote named `panel-backup`:
   ```bash
   rclone config
   # Choose: n (new remote)
   # Name: panel-backup
   # Type: s3 (or your preferred backend)
   # Follow prompts for credentials
   ```

3. That's it! The backup script automatically detects rclone and syncs each backup set to the `panel-backup` remote.

## Backup Schedule

Backups run via root cron. To view/modify:

```bash
crontab -l | grep panel-backup
# Output: 30 2 * * * /opt/panel/bin/panel-backup run --auto
```

Changes made in the panel (time, enable/disable) automatically update this cron entry.

## Disk Space Considerations

| Component | Size per backup |
|---|---|
| Small WordPress site | ~10-50 MB |
| Database dump | ~1-50 MB |
| Panel database | < 1 MB |
| **Typical set** | **~20-100 MB** |

With retention 14, expect: 14 × 100 MB = ~1.4 GB disk usage for backups.

Monitor disk space on the Dashboard. If disk usage > 90%, reduce retention or scope.
