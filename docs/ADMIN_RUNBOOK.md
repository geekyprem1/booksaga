# BookSaga admin runbook

Updated 29 October 2026. Current scope uses manual account delivery. CSV import, payment webhooks and SMTP/email are deferred at the owner's request.

## Buyer delivery

1. Open **Admin → Users → Create user**. Enter the buyer's name/email and purchased FE/OTO plans.
2. Copy the one-time login details and deliver them through your existing purchase/support process. BookSaga does not send email in this scope.
3. Confirm the buyer can log in and sees the assigned features and one-time credit balances. Mark credentials as sent when delivery is complete.
4. For an existing buyer, open the user record and grant the additional purchased plan. Do not create a second account.

Support contact: **softwarevh@gmail.com**. The published refund window is **30 calendar days from purchase**.

## Accounts, credits and refunds

- **Users:** edit the account name, suspend/activate, reset password, grant/revoke plans and copy replacement credentials.
- **Plans & costs:** edit plan limits, feature switches, action costs and daily book caps. Settings apply to web and worker account checks.
- **Credit ledger:** filter by owner, pool and status; follow the linked job. Agency reservations identify the acting client as well as the owner whose pool is charged.
- **Refund:** match the purchase/order first, process the monetary refund through the original checkout/provider, then revoke the affected plan in BookSaga. Changing app credits does not itself refund money. Other active plans remain separate.
- Use a reason when adjusting credits. If a job says its refund could not be confirmed, inspect the ledger before retrying or adjusting anything. Do not refund the same transaction twice.

## Jobs and recovery

Open **Admin → Jobs** for queue counts, job details, progress and AI usage. Retry is available for failed jobs only after the original refund is confirmed. A retry resumes saved book content and uses one stable retry record.

Queued jobs can be cancelled before start. Started book jobs use worker cancellation checkpoints: below 20% completed work the reservation is refunded; at or above that boundary completed work is charged. Active non-book jobs have no cancellation checkpoints and cannot be cancelled through the queued full-refund path.

The worker checks its Redis lock and uses a unique database execution token. Recovery invalidates the old token. Old executions cannot save content/progress, settle credits or mark their replacement failed. Completion/cancellation/failure settles credits, book state and notifications in one database transaction. A startup probe refuses processing if the database fencing hook is missing.

For a stuck job, check worker health and logs before manual intervention. The scheduled reaper ignores live queued/active Redis jobs, recovers missing/stale work and stops after its retry limit. Avoid editing job status or credit reservations directly in the database.

## Read-only support preview

Open a regular active user in **Users**, then **View as user (read-only)**. The banner identifies the account being viewed. Mutation actions and file uploads are blocked on the server; reads, navigation and downloads remain available. Entry and normal exit are audited. The viewing window is 30 minutes; stale tabs remain blocked until preview mode is cleared. Use **Back to admin** to exit.

No target-user password or authentication token is issued. You remain authenticated as the administrator.

## Settings and policies

**Admin → Settings** controls branding, support contact, upgrade URLs, maintenance notice, legal pages, text-model overrides and pricing. Restart the worker after changing text-model/pricing overrides. Provider-reported costs take precedence over estimates.

The four public policy pages are Terms, Privacy, Refund and AI Content Disclosure. Initial text and the support address are supplied by migration 14; later admin edits are preserved. Update the seller's legal identity/address and jurisdiction-specific details when those details are confirmed. The refund page must continue to match the actual purchase offer.

## Health and incident response

- Web readiness: `/api/healthz` checks database and Redis.
- Worker readiness: internal port `3001/healthz`. Redis and worker ports are not exposed publicly by Compose.
- Logs: `docker compose --env-file .env.production -f docker/docker-compose.prod.yml logs --tail=100 web worker`.
- Pause new work with maintenance mode while diagnosing a service outage. Review queued jobs and ledger state after recovery.
- Keep prior image tags for rollback. Use the matching release tag for both web and worker. Database schema changes move forward through migrations; reverting an image does not revert migrations.

The weekly database backup script and systemd timer are prepared. Offsite credentials, storage-object backups, an actual restore rehearsal and external uptime monitoring must be configured on the real infrastructure before launch.
