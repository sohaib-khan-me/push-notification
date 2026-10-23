# Push Notification System

Send a push notification from a web dashboard to an Android phone through Firebase Cloud Messaging (FCM). Everything runs locally.

```
 React dashboard ──HTTP──▶ FastAPI backend ──Admin SDK──▶ Firebase (FCM) ──▶ Android app
                              │  SQLite                                         │
                              └──────────── registers FCM token ◀───────────────┘
```

## Features

- Send a custom title and message to a selected device, with a live preview
- Device registration is idempotent; tokens are stored in SQLite and always shown masked
- Notification history with honest status (`accepted`, `failed`, `invalid_token`)
- Dead tokens are deactivated; temporary network errors never remove a device
- Delivery in foreground, background and closed states
- Firebase credentials stay on the backend only, outside the repository

## Stack

| Part | Technology |
|---|---|
| `dashboard/` | React, Vite, TypeScript, Tailwind CSS |
| `backend/` | Python, FastAPI, Firebase Admin SDK, SQLite, pytest |
| `mobile/` | React Native (CLI), TypeScript, React Native Firebase, Notifee |

## Setup

**Prerequisites:** Node 22+, pnpm, Python 3.12, JDK 17, Android SDK, a Firebase project with an Android app.

1. **Android config** – put `google-services.json` in `mobile/android/app/`.
2. **Backend key** – save the Firebase Admin SDK key outside the repo, for example `~/.config/fcm-push-notifications/service-account.json` (mode `600`).
3. **Backend env** – copy `backend/.env.example` to `backend/.env` and set `GOOGLE_APPLICATION_CREDENTIALS` to that absolute path.

## Run

```bash
# 1. Backend  -> http://127.0.0.1:8000  (docs at /docs)
./scripts/start-backend.sh

# 2. Dashboard -> http://localhost:5173
./scripts/start-dashboard.sh

# 3. Android app (phone connected by USB, USB debugging on)
cd mobile && pnpm install
adb reverse tcp:8000 tcp:8000     # phone reaches the backend
adb reverse tcp:8081 tcp:8081     # phone reaches Metro
pnpm start                        # terminal A
pnpm android                      # terminal B: build and install
```

Open the app and allow notifications. The phone appears in the dashboard; choose it and click **Send Notification**.

Other ways to reach the backend: emulator `http://10.0.2.2:8000`, or Wi-Fi `http://<LAN IP>:8000` with `HOST=0.0.0.0 ./scripts/start-backend.sh`. The URL can be changed in the app under Settings.

## How delivery works

The backend sends an FCM **notification message** (title and body) with high priority on channel `general`.

| App state | Who shows it |
|---|---|
| Foreground | The app, through Notifee |
| Background or closed | Android itself (no duplicates) |

"Accepted by Firebase" means FCM took the message, not that the phone displayed it.

**Limits.** Delivery is never guaranteed: the phone may be offline, notification permission may be denied, a force-stopped app receives nothing until reopened, and some manufacturers restrict background apps. An uninstalled app gives an invalid token, which the backend marks inactive (HTTP 410).

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Status and safe diagnostics |
| POST | `/api/devices/register` | Register or refresh a device token |
| GET | `/api/devices` | List devices (masked tokens) |
| POST | `/api/notifications/send` | Send to a device |
| GET | `/api/notifications` | Recent attempts |

## Tests

```bash
cd backend && source .venv/bin/activate && python -m pytest -q   # Firebase is mocked
cd dashboard && pnpm build && pnpm lint
cd mobile && npx tsc --noEmit && pnpm lint
```

## Troubleshooting

| Problem | Fix |
|---|---|
| Dashboard says backend offline | Start the backend; the dashboard origin must be `localhost:5173` (CORS) |
| App cannot register | Re-run `adb reverse tcp:8000 tcp:8000` (resets when unplugged) or fix the URL in Settings |
| `INSTALL_FAILED_INSUFFICIENT_STORAGE` | Build for your CPU only: `./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a` in `mobile/android` |
| Gradle cannot find `gradle-plugin` | Run `pnpm install` in `mobile/` (needs `nodeLinker: hoisted`, already configured) |
| Health shows `firebase: not_configured` | Check `GOOGLE_APPLICATION_CREDENTIALS` in `backend/.env` |
| Send accepted, nothing on phone | Check notification permission, the General channel, Do Not Disturb, battery optimisation, force-stop |

## Security

`.env` files, service-account keys, `google-services.json`, signing keys, databases and build output are git-ignored. Never place the Admin SDK key in `dashboard/` or `mobile/`. Do not expose the backend to the internet.
