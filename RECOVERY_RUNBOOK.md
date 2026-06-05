# Database Recovery Runbook

**Severity levels:**
- 🟢 **Green** — Data is intact, no action needed
- 🟡 **Yellow** — Data loss detected but recoverable (< 7 days ago)
- 🔴 **Red** — Data loss detected, recovery from Tier 2 backups required

---

## Decision Tree

```
Did you detect the problem within 7 days?
├─ YES → Use Render PITR (Tier 1) [FASTEST]
└─ NO  → Use S3 backup (Tier 2) [MOST RECENT AVAILABLE]
```

---

## Recovery Option 1: Render PITR (Tier 1)

**When:** Problem detected within last 7 days  
**Time to recover:** 15–30 minutes  
**Data loss:** None (restore to exact point in time)

### Steps

1. **Identify the timestamp** you want to restore to:
   - Ask: "When did the data become corrupt?"
   - Example: Friday 3 PM = `2025-06-06 15:00:00 UTC`

2. **Go to Render Dashboard:**
   - Navigate to https://dashboard.render.com
   - Select your PostgreSQL database from "Services"

3. **Access backups:**
   - Click the "Backups" tab
   - You'll see a list of automatic daily snapshots

4. **Choose a restore point:**
   - Select a snapshot from **before the problem timestamp**
   - Example: if corruption was Friday 3 PM, pick Friday 2 AM or Thursday

5. **Initiate restore:**
   - Click "Restore" on your chosen snapshot
   - Render will create a **new database** (original remains untouched)
   - This takes 2–5 minutes

6. **Update your environment:**
   - Render gives you a new `DATABASE_URL` for the restored DB
   - Update your `.env` file and redeploy the app:
     ```bash
     export DATABASE_URL=<new-url-from-render>
     npm run deploy
     ```
   - Verify the app connects and data looks correct

7. **Verify recovery:**
   - Check that critical data is present: users, orders, accounts
   - Run a few queries to spot-check
   - If everything looks good, you're done
   - If you discover more data loss, repeat with an earlier snapshot

8. **Clean up (optional):**
   - Once you're confident, you can delete the old corrupted database from Render
   - Keep both running for 1–2 hours as a safety net

---

## Recovery Option 2: S3 Backup (Tier 2)

**When:** Problem detected > 7 days ago, or Render PITR failed  
**Time to recover:** 20–30 minutes  
**Data loss:** Up to 1 week (depending on which backup you restore from)

### Prerequisites

You'll need:
- AWS CLI installed: `pip install awscli`
- AWS credentials configured with S3 access
- Access to the S3 bucket: `zentryx-backups`
- psql or another PostgreSQL client

### Steps

1. **List available backups:**
   ```bash
   aws s3 ls s3://zentryx-backups/
   ```
   Output:
   ```
   2025-05-26 02:00:00    25.3 MiB zentryx-backup-2025-05-26.sql.gz
   2025-05-19 02:00:00    24.8 MiB zentryx-backup-2025-05-19.sql.gz
   2025-05-12 02:00:00    24.1 MiB zentryx-backup-2025-05-12.sql.gz
   ```

2. **Choose the backup:**
   - Pick the most recent one that is **before** the corruption was detected
   - Example: if corruption found on June 2, pick the June 1 backup

3. **Download the backup:**
   ```bash
   BACKUP_FILE="zentryx-backup-2025-05-26.sql.gz"
   aws s3 cp s3://zentryx-backups/$BACKUP_FILE .
   ```

4. **Decompress:**
   ```bash
   gunzip $BACKUP_FILE
   # Creates zentryx-backup-2025-05-26.sql
   ```

5. **Create a new database in Render:**
   - Go to Render Dashboard → PostgreSQL → Create New
   - Name it `zentryx-restored-YYYYMMDD`
   - Note the new `DATABASE_URL`

6. **Restore the SQL dump:**
   ```bash
   # Set your new database URL
   export DATABASE_URL="postgresql://user:password@host:port/database"

   # Restore (this takes 5–10 minutes for a 25 MB file)
   psql $DATABASE_URL < zentryx-backup-2025-05-26.sql
   ```

7. **Verify the restore:**
   ```bash
   # Connect to the restored database
   psql $DATABASE_URL

   # Quick checks:
   SELECT COUNT(*) FROM accounts;
   SELECT COUNT(*) FROM "production_orders";
   SELECT MAX(updated_at) FROM accounts;
   ```

8. **Cutover to restored database:**
   - Update your `.env` with the new `DATABASE_URL`
   - Redeploy:
     ```bash
     npm run deploy
     ```
   - Monitor logs for any connection errors
   - Spot-check the UI: can you see your accounts, orders?

9. **Keep the old database for inspection:**
   - Leave the corrupted database running for 24 hours
   - Check the git log: when was the corruption introduced?
   - Investigate: was it a bug, or user error?
   - Document the incident

10. **Clean up:**
    - After 24 hours, delete the old corrupted database
    - Delete temporary restore database if needed

---

## Recovery Option 3: Partial Recovery (Surgical)

**When:** Only specific tables are corrupted, or you need to restore a single record

**Example:** Someone deleted all `accounts` but `production_orders` are fine.

### Steps

1. **Restore to a staging database** (use Option 1 or 2)
2. **Connect to staging DB:**
   ```bash
   psql <STAGING_DATABASE_URL>
   ```
3. **Extract the corrupted table:**
   ```bash
   \COPY accounts TO '/tmp/accounts_restored.csv' WITH CSV HEADER;
   ```
4. **Connect to production DB:**
   ```bash
   psql $DATABASE_URL
   ```
5. **Restore just that table:**
   ```bash
   \COPY accounts FROM '/tmp/accounts_restored.csv' WITH CSV HEADER;
   ```
6. **Verify referential integrity:**
   ```bash
   -- If account_id is a foreign key, check for orphans:
   SELECT COUNT(*) FROM "production_orders" 
   WHERE account_id NOT IN (SELECT id FROM accounts);
   ```

---

## Prevention Checklist

- [ ] Database credentials are **not** in git (use `.env` and secrets)
- [ ] Raw SQL queries are **never** constructed with string concat
- [ ] Use parameterized queries: `db.select().from(table).where(eq(col, value))`
- [ ] Never run bare `DELETE` without a `WHERE` clause
- [ ] Code review all migrations before deploying
- [ ] Backups are tested quarterly with a restore to staging

---

## Monitoring

Check backup health regularly:

```bash
curl https://your-api.render.com/health/backups
```

Expected response:
```json
{
  "status": "healthy",
  "lastBackupTime": "2025-06-02T02:00:00Z",
  "hoursSinceBackup": 5,
  "backupSize": "25.3 MB",
  "databaseConnected": true
}
```

**Alert conditions:**
- ❌ `status !== "healthy"`
- ❌ `hoursSinceBackup > 24`
- ❌ `backupSize` drops by >50% (possible corrupt dump)

---

## Post-Recovery

1. **Root cause analysis:**
   - What went wrong? (bug, user error, attack?)
   - How do we prevent it next time?

2. **Document the incident:**
   - Date/time of discovery
   - Scope of data loss
   - Recovery time
   - Root cause
   - Prevention steps taken

3. **Update code if needed:**
   - Add validation (e.g., prevent bulk delete without confirmation)
   - Add audit logs for destructive operations
   - Add soft deletes instead of hard deletes for critical tables

4. **Test the fix:**
   - Write a test that would have caught this

---

## Contacts & Resources

- **Render Support:** https://dashboard.render.com/support
- **AWS S3 Console:** https://console.aws.amazon.com/s3
- **PostgreSQL Docs:** https://www.postgresql.org/docs/current/app-pgrestore.html
- **GitHub Actions Logs:** Check `.github/workflows/weekly-db-backup.yml` runs

---

## FAQ

**Q: How long does a restore take?**  
A: 15–30 minutes for Render PITR, 20–30 minutes for S3 restore (including download + import).

**Q: Will the old database still exist during recovery?**  
A: Render PITR creates a **new** database. Old one stays until you delete it.

**Q: Can I restore just one table?**  
A: Yes, see "Partial Recovery" section above.

**Q: What if S3 backup is also corrupted?**  
A: Unlikely (backups are created from the original). But if the corruption existed for days, older backups might be corrupt too. This is why we keep 30 days of backups—you can pick one from 2 weeks ago.

**Q: Do I need to test restores?**  
A: Yes. Recommended quarterly. Restore a backup to a staging DB and verify data integrity.
