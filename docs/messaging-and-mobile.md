# Messaging & Mobile Updates

## In-app messaging
- Participants: authenticated customers (role `customer`) and their assigned vendor (role `vendor`).
- Transport: REST for history/send, Socket.IO (`messages:join`, `messages:new`, `messages:read`) for live updates.
- Uploads: up to 6 images per message (`jpeg`, `png`, `webp`, `gif`, `heic`).

### REST endpoints
| Method | Route | Notes |
| --- | --- | --- |
| `GET` | `/api/messages/job/:jobId` | Returns ordered thread, participants, upload constraints. |
| `POST` | `/api/messages/job/:jobId` | Multipart form with optional `body` + `attachments[]`. |
| `POST` | `/api/messages/job/:jobId/read` | Marks incoming messages as read and emits read receipts. |

### Socket events
- `messages:join` – payload `{ token, jobId }`; server validates token and joins `messages/job/{id}` room.
- `messages:new` – broadcast for new messages (`attachments` included).
- `messages:read` – broadcast when the counterpart marks messages as read.

## Capacitor quickstart
1. Build the web bundle: `npm run build` (outputs to `client/build`).
2. Sync Capacitor assets: `npm run cap:sync`.
3. Open the Android project: `npm run cap:open:android` (requires Android Studio / SDK).
4. On macOS, use `npm run cap:open:ios` after installing Xcode.

Configuration lives in `client/capacitor.config.json` (`appId` `com.serviceops.app`). Adjust `server` settings if you need live reload or custom schemes.
