# Database Backup & Recovery Strategy

## Overview

Zentryx uses a **3-tier backup strategy** to protect against data loss:
1. **Render managed backups** (automatic, 7-day PITR)
2. **Weekly SQL dumps to S3** (30-day retention)
3. **Health monitoring & documented runbook**

---

## Tier 1: Render Managed Backups

**What it is:**
- Automated daily snapshots of the PostgreSQL database
- Point-in-time recovery (PITR) available for any moment in the last **7 days**
- Stored in Render's infrastructure

**How to use:**
1. Go to [Render Dashboard](https://dashboard.render.com)
2. Select your PostgreSQL instance
3. Click "Backups" tab
4. Choose a timestamp within the last 7 days
5. Click "Restore" and follow prompts
6. A new database is created; update your `DATABASE_URL` env var to point to it

**Limitations:**
- Only 7-day window
- Must detect the problem and initiate recovery within that window
- No off-site redundancy (backups are in Render's datacenter)

**When to use:** Quick recovery from accidental deletes within the last 7 days.

---

## Tier 2: Weekly S3 Backups

**What it is:**
- Automated SQL dump every **Sunday at 2:00 AM UTC**
- Compressed (gzip) and uploaded to AWS S3
- Retained for **30 days**
- Triggered by GitHub Actions workflow

**How it works:**
1. GitHub Actions runs the workflow on schedule
2. Connects to your Render database via `DATABASE_URL` env var
3. Runs `pg_dump` → gzip → uploads to S3
4. File is named: `zentryx-backup-YYYY-MM-DD.sql.gz`

**Location:**
- S3 bucket: `zentryx-backups` (private, encrypted)
- Region: `us-east-1`

**How to restore from S3:**
```bash
# Download backup from S3
aws s3 cp s3://zentryx-backups/zentryx-backup-2025-06-01.sql.gz ./backup.sql.gz

# Decompress
gunzip backup.sql.gz

# Restore to your database
psql $DATABASE_URL < backup.sql
```

**Limitations:**
- Only covers the last 30 days
- Requires AWS credentials to access S3
- Takes ~5 minutes to create dump (DB locked briefly during dump)

**When to use:** Recovery from issues that took days to discover, or extra redundancy beyond Render's backups.

---

## Tier 3: Backup Health Monitoring

**What it is:**
- API endpoint `/health/backups` that verifies:
  - Last S3 backup timestamp (must be < 24 hours old)
  - Database connectivity
  - Backup file size is reasonable

**How to check:**
```bash
curl https://your-api.render.com/health/backups
```

Response:
```json
{
  "status": "healthy",
  "lastBackupTime": "2025-06-02T02:00:00Z",
  "hoursSinceBackup": 5,
  "backupSize": "25.3 MB",
  "databaseConnected": true
}
```

**Monitoring:**
- Set up a cron job or monitoring service to hit this endpoint hourly
- Alert if `status !== "healthy"`
- Alert if `hoursSinceBackup > 24`

**When to use:** Proactive detection of backup failures before disaster strikes.

---

## Recovery Runbook

See [RECOVERY_RUNBOOK.md](./RECOVERY_RUNBOOK.md) for step-by-step recovery procedures.

---

## Backup Schedule

| Backup Type | Frequency | Retention | Recovery Time | Best For |
|-------------|-----------|-----------|---------------|----------|
| Render PITR | Continuous snapshots | 7 days | 15-30 min | Quick recovery, last week |
| S3 dumps | Weekly (Sun 2 AM UTC) | 30 days | 20-30 min | Extended history, redundancy |
| Health check | Hourly | N/A | N/A | Proactive monitoring |

---

## Cost

- **Render PostgreSQL (Paid)**: ~$15/month (includes automatic backups)
- **S3 storage**: ~$0.50/month (25 MB × 30 backups)
- **Total**: ~$15.50/month

---

## FAQ

**Q: What if Render's datacenter goes down?**
A: S3 backups (Tier 2) are in a different region and account. You can restore from there.

**Q: Can I restore without losing recent data?**
A: No. Any restore reverts the database to that point in time. Recent changes are lost.

**Q: How do I know if a backup succeeded?**
A: Check `/health/backups` endpoint or review AWS CloudWatch logs for the GitHub Actions workflow.

**Q: Can I keep backups longer than 30 days?**
A: Yes. Update the S3 lifecycle policy in AWS console, or store to Glacier for long-term archival.

**Q: Do you ever test restores?**
A: Not automated yet. Recommended: quarterly manual restore test to a staging database.
