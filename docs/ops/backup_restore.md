# Backup and Restore Runbook

## Overview
- Database engine: PostgreSQL
- Backup tool: `pg_dump`
- Restore tool: `pg_restore` or `psql` (depending on dump format)
- Source of connection info: `DATABASE_URL` or standard `PG*` env vars

## Create Backup
- Recommended schedule: daily full backup, plus frequent logical snapshots for critical periods.
- Store backups outside app server disk (separate volume/object storage).

Example:

```bash
./scripts/backup-db.sh ./backups/unidigitalized-$(date +%Y%m%d-%H%M%S).dump
```

Notes:
- Script uses custom format (`pg_dump -Fc`) for safer restores.
- Password is never echoed.

## Restore Backup
Restore into a fresh database:

```bash
createdb unidigitalized_restore
./scripts/restore-db.sh ./backups/unidigitalized-20260223-120000.dump postgresql://postgres:***@localhost:5432/unidigitalized_restore
```

## Integrity Verification
- At least weekly:
1. Restore latest backup into a temp DB.
2. Run Prisma connectivity check and simple counts:
   - users
   - sessions
   - whiteboard ops
3. Drop temp DB after verification.

## Retention Guidance
- Minimum: keep 7 daily + 4 weekly backups.
- Recommended: immutable/object-lock for production backups.

## Operational Cautions
- Never log full `DATABASE_URL` in CI or shell output.
- Keep encryption at rest on backup destination.
- Test restore regularly; backup without restore test is incomplete.
