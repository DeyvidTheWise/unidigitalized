# Production Operational Checklist

## Required Environment Variables
- `DATABASE_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_PEPPER`
- `ACCESS_TOKEN_TTL_MINUTES`
- `REFRESH_TOKEN_TTL_DAYS`
- `SNAPSHOT_OP_THRESHOLD`
- `SNAPSHOT_MAX_INTERVAL_SECONDS`
- `SNAPSHOT_WORKER_INTERVAL_SECONDS`
- `MAX_JOIN_OPS`
- `EXPORT_TTL_HOURS`
- `EXPORT_STORAGE_DIR`
- `WS_PORT`
- `WS_HEALTH_PORT`
- `WS_HEALTH_URL`
- `WS_MAX_MESSAGE_BYTES`
- `WS_MAX_OP_PAYLOAD_BYTES`
- `WS_MAX_MESSAGES_PER_SECOND`
- `LOG_LEVEL`

## Health Endpoints
- App health: `GET /api/health`
- WS health (via app): `GET /api/ws-health`
- WS process direct health: `GET http://<ws-host>:<WS_HEALTH_PORT>/health`

## Logging
- Structured JSON logging via `pino`.
- Request logs include `requestId` (`x-request-id` response header).
- WS logs include `wsConnId`, user, join/disconnect events, reject codes.
- Never log: passwords, JWTs, refresh tokens, cookie values.

## Background Jobs
- Snapshot worker is started by WS server process.
- Exports cleanup schedule:
  - run `npm run exports:cleanup` at least every 15 minutes in production.

## Backup Schedule
- Daily backup: `./scripts/backup-db.sh <output.dump>`
- Weekly restore verification into temp DB.
- Store backups off-host.

## Security Controls
- REST rate limits on auth endpoints.
- WS message size and rate caps enabled.
- Auth/refresh tokens stored in HttpOnly cookies.

## Deployment Verification
1. `npx prisma validate`
2. `npx prisma migrate deploy`
3. `npm run prisma:generate`
4. `/api/health` returns `{ ok: true, db: "ok" }`
5. `/api/ws-health` returns `ok`
