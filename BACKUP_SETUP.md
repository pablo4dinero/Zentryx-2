# Database Backup Setup Guide

This guide walks you through setting up the 3-tier backup strategy.

---

## Prerequisites

- GitHub repository with admin access
- AWS account with S3 access
- Render account with your PostgreSQL database
- `DATABASE_URL` environment variable configured

---

## Step 1: Create S3 Bucket

1. Go to [AWS S3 Console](https://console.aws.amazon.com/s3)
2. Click **Create bucket**
3. Bucket name: `zentryx-backups-<your-company-name>` (must be globally unique)
4. Region: `us-east-1` (or your preferred region)
5. Block all public access: **Keep enabled** ✅
6. Click **Create bucket**

---

## Step 2: Create IAM User for GitHub Actions

1. Go to [AWS IAM Console](https://console.aws.amazon.com/iam)
2. Click **Users** → **Create user**
3. Username: `github-actions-zentryx-backup`
4. Click **Create user**

5. On the user page, click **Create access key**
6. Choose **Other** → **Create access key**
7. **Copy both** the access key ID and secret access key
   - ⚠️ Secret key is shown **only once** — save it now!

---

## Step 3: Create S3 Policy

1. In IAM, go to **Policies** → **Create policy**
2. Switch to **JSON** tab
3. Paste this policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::zentryx-backups-<your-company-name>",
        "arn:aws:s3:::zentryx-backups-<your-company-name>/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetBucketVersioning",
        "s3:PutBucketVersioning",
        "s3:GetBucketEncryption",
        "s3:PutBucketEncryption",
        "s3:GetBucketLifecycleConfiguration",
        "s3:PutBucketLifecycleConfiguration"
      ],
      "Resource": "arn:aws:s3:::zentryx-backups-<your-company-name>"
    }
  ]
}
```

4. Replace `<your-company-name>` with your bucket name
5. Click **Create policy**

---

## Step 4: Attach Policy to User

1. Go back to your GitHub Actions user
2. Click **Add permissions** → **Attach policies directly**
3. Search for the policy you just created
4. Select it and click **Add permissions**

---

## Step 5: Add GitHub Secrets

1. Go to your GitHub repository
2. Settings → **Secrets and variables** → **Actions**
3. Click **New repository secret**
4. Add these secrets:

| Name | Value |
|------|-------|
| `DATABASE_URL` | Your Render PostgreSQL connection string (e.g., `postgresql://user:pass@host:port/db`) |
| `AWS_ACCESS_KEY_ID` | From Step 2 (access key) |
| `AWS_SECRET_ACCESS_KEY` | From Step 2 (secret key) |

---

## Step 6: Verify Backup Workflow

1. Go to **Actions** tab in GitHub
2. Find **Weekly Database Backup** workflow
3. Click **Run workflow** → **Run workflow** (to test immediately)
4. Wait ~5 minutes for it to complete
5. Check the logs:
   - Look for ✅ "Backup created successfully"
   - Look for ✅ "Backup uploaded: s3://zentryx-backups-..."

---

## Step 7: Enable Monitoring

### Option A: Manual Monitoring

Check backup status via API:
```bash
curl https://your-api.render.com/api/health/backups
```

Example response:
```json
{
  "status": "healthy",
  "databaseConnected": true,
  "lastBackupTime": "2025-06-02T02:00:00Z",
  "hoursSinceBackup": 5,
  "backupSize": "25.3 MB",
  "checks": {
    "database": "ok",
    "backupMetadata": "ok"
  },
  "timestamp": "2025-06-02T07:15:30Z"
}
```

### Option B: Uptime Monitoring Service (Recommended)

Use a free service like [Uptime Robot](https://uptimerobot.com) or [Freshping](https://www.freshworks.com/website-monitoring/):

1. Create a **custom monitor**
2. URL: `https://your-api.render.com/api/health/backups`
3. Expected keywords: `"status":"healthy"`
4. Check interval: **Every hour**
5. Alert if status becomes `degraded` or `unhealthy`

---

## Step 8: Document Recovery Procedure

Share [RECOVERY_RUNBOOK.md](./RECOVERY_RUNBOOK.md) with your team so everyone knows how to recover if needed.

---

## Testing

### Test 1: Verify Backup Runs

1. Go to GitHub Actions
2. Find the workflow run
3. Check that it:
   - ✅ Connected to database
   - ✅ Created SQL dump
   - ✅ Compressed with gzip
   - ✅ Uploaded to S3
   - ✅ Completed in < 10 minutes

### Test 2: Verify Restore from Backup

**Do this once to ensure recovery actually works:**

1. List your S3 backups:
   ```bash
   aws s3 ls s3://zentryx-backups-<your-company-name>/
   ```

2. Download the latest backup:
   ```bash
   aws s3 cp s3://zentryx-backups-<your-company-name>/zentryx-backup-YYYY-MM-DD.sql.gz .
   ```

3. Decompress:
   ```bash
   gunzip zentryx-backup-YYYY-MM-DD.sql.gz
   ```

4. Create a **test database** in Render (don't restore to production!)

5. Restore to the test database:
   ```bash
   psql postgresql://user:pass@test-host:5432/test-db < zentryx-backup-YYYY-MM-DD.sql
   ```

6. Verify data is present:
   ```bash
   psql postgresql://user:pass@test-host:5432/test-db -c "SELECT COUNT(*) FROM accounts;"
   ```

7. Delete the test database (cleanup)

---

## Troubleshooting

### ❌ Workflow fails with "Access Denied"

**Cause:** AWS credentials are wrong or policy is missing  
**Fix:**
- Verify `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` are correct in GitHub Secrets
- Verify IAM user has the S3 policy attached
- Check the workflow logs for the specific error

### ❌ `/api/health/backups` returns `status: degraded`

**Cause:** Backup hasn't run yet, or env var not set  
**Fix:**
- First backup runs Sunday 2 AM UTC
- Manually trigger workflow from Actions tab
- Wait for it to complete

### ❌ Backup file is very large (> 500 MB)

**Cause:** Your database is larger than expected  
**Fix:**
- This is normal as your data grows
- S3 storage cost is still cheap (~$0.023 per GB/month)
- Backups are compressed, so actual size is smaller

### ❌ Can't restore because `gunzip` fails

**Cause:** File is corrupted or wasn't actually gzipped  
**Fix:**
- Try: `file zentryx-backup-YYYY-MM-DD.sql.gz`
- Should say: "gzip compressed data"
- If it says "ASCII text", the backup wasn't compressed — try restoring directly:
  ```bash
  psql $DATABASE_URL < zentryx-backup-YYYY-MM-DD.sql
  ```

---

## Costs

| Service | Item | Cost |
|---------|------|------|
| **AWS S3** | 25 MB × 30 backups @ $0.023/GB/month | ~$0.50/month |
| **Render** | PostgreSQL paid tier (includes backups) | ~$15/month |
| **GitHub Actions** | Included (free tier) | $0 |
| **Total** | | **~$15.50/month** |

---

## Next Steps

1. ✅ Set up S3 bucket and IAM user
2. ✅ Add GitHub Secrets
3. ✅ Test the workflow
4. ✅ Verify restore works
5. ✅ Set up monitoring (Uptime Robot or similar)
6. ✅ Schedule quarterly restore tests
7. ✅ Document on-call runbook for your team

---

## References

- [BACKUP_RECOVERY.md](./BACKUP_RECOVERY.md) — Overview of all 3 tiers
- [RECOVERY_RUNBOOK.md](./RECOVERY_RUNBOOK.md) — Step-by-step recovery procedures
- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Render PostgreSQL Documentation](https://render.com/docs/postgres)
