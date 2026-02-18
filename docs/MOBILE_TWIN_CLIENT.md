# Mobile Twin Native Client

This client consumes pending mobile actions from orchestrator and posts execution receipts.

## Files

- `orchestrator/src/mobile/mobileTwinClient.ts`: reusable polling client
- `orchestrator/src/mobile/defaultActionHandlers.ts`: default handler hooks
- `orchestrator/src/mobile/runMobileTwinClient.ts`: runnable process

## Run

```bash
cd orchestrator
set -a; source .env; set +a
pnpm run mobile:twin
```

## Required headers/auth

Set either:

- `MOBILE_TWIN_BEARER_TOKEN` (JWT), or
- `MOBILE_TWIN_API_KEY` (+ role/org/workspace headers)

## Native integration points

Replace default handlers with platform-native implementations:

- `onAnswerPhoneCall`: Android `CallScreeningService` / iOS `CallKit` flow
- `onAnswerWhatsappCall`: approved WhatsApp/VoIP integration in native app
- `onAnswerVideoCall`: native video/meeting SDK bridge
- `onSyncAvailability`: local state sync

The orchestrator queue/receipt flow remains unchanged.

## Action lifecycle

1. Device registers and syncs permissions/capabilities.
2. Backend enqueues action (`/dashboard/twin/mobile/action/enqueue`).
3. Client polls pending actions (`/dashboard/twin/mobile/actions/pending`).
4. Client executes native handler and posts receipt (`/dashboard/twin/mobile/action/receipt`).

## Security

- Requires workspace + role auth.
- Enqueue checks device ownership (or founder/admin override).
- Attestation and call-permission policy gates enforced server-side.
