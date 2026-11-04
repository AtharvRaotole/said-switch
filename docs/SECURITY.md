# Security model

## Trust boundaries

1. **Switch addressing**: external stakeholders cannot command the builder directly. Said refuses `@builder …` bypasses in business mode and logs a refusal on the ledger.
2. **Bilateral accept**: work starts only after both enrolled parties accept the same draft version and terms hash.
3. **Agent-owned room document**: the signed ledger lives as a Switch room document created by Said. Non-creator agents get HTTP 403 on update/delete (proven against Switch 0.31.0).
4. **Builder re-verification**: before git work, the builder verifies the ledger signature, audit chain, start token signature, party pins, expiry, and revision freshness.
5. **Localhost HTTP**: notary and builder bind `127.0.0.1`. Optional `SAID_HTTP_SHARED_SECRET` gates non-health routes.

## Hardening covered by tests

| Threat | Control |
| --- | --- |
| Unauthorized / external command | Bypass refusal + non-party ignore |
| Impersonation (wrong senderId) | Party binding by Switch participant id |
| Double accept | Idempotent already-accepted / already-locked replies |
| Accept by wrong party | Approvals keyed by enrolled role + senderId |
| Scope edit after one accept | Revision bumps version and clears approvals |
| Message id replay | `processedMessageIds` dedup (ring capped) |
| Start token replay after completion | `checkStartAuthorization` rejects COMPLETED |
| Expired / future token | Expiry + clock skew window |
| Stale ledger revision | Token revision cannot exceed document revision |
| Tampered ledger payload | Digest + ed25519 signature |
| Broken audit chain | Hash-chained audit verified inside `verifySignedLedger` |
| Enrollment brute force / reuse | Eight wrong codes lock the account; codes single-use |
| Path allowlist escape | Reject `..`, absolute paths, symlinks, non-allowlisted files |
| Command injection into worker | `spawn` with argv array, no shell |
| Prompt injection in chat | Accept parser rejects embedded / conditional / quoted forms; worker only sees signed start token scope |
| Localhost binding | `hostname: '127.0.0.1'` |
| Optional shared secret | Bearer / `X-Said-Shared-Secret` middleware |

## What operators must not do

- Do not publish, proxy, or SSH-forward notary/builder ports.
- Do not point live mode at mock-switch.
- Do not commit `.env`, `.said/secrets.json`, or Switch registration keys.
