# Push Notification System

Send a notification from a web page on your laptop to your Android phone. It uses Firebase Cloud Messaging (FCM). Everything runs on your own computer.

```
 Dashboard (React) --> Backend (FastAPI) --> Firebase (FCM) --> Android app
                          |  SQLite                                |
                          +------- saves the phone's token <-------+
```

## What it does

- You type a title and a message, pick your phone, and press **Send Notification**.
- The phone's token is saved in a small database. It is always shown shortened, never in full.
- A history list shows every message you sent and what happened to it.
- If a phone token stops working, the backend marks that phone as inactive. A short network problem does not remove it.
- It works when the app is open, in the background, or closed.
- The secret Firebase key stays on the backend only. It is never in the app or in this repository.

## What it is made of

| Folder | Technology |
|---|---|
| `dashboard/` | React, Vite, TypeScript, Tailwind CSS |
| `backend/` | Python, FastAPI, Firebase Admin SDK, SQLite |
| `mobile/` | React Native, TypeScript, React Native Firebase, Notifee |

## Before you start

You need: Node 22 or newer, pnpm, Python 3.12, Java 17, the Android SDK, and a Firebase project with an Android app.

1. Put your `google-services.json` file in `mobile/android/app/`.
2. Save your Firebase Admin key somewhere outside this project, for example `~/.config/fcm-push-notifications/service-account.json`.
3. Copy `backend/.env.example` to `backend/.env`. Set `GOOGLE_APPLICATION_CREDENTIALS` to the full path of that key.

## How to run it

```bash
# 1. Backend  (http://127.0.0.1:8000)
./scripts/start-backend.sh

# 2. Dashboard  (http://localhost:5173)
./scripts/start-dashboard.sh

# 3. Android app (connect your phone with a USB cable, USB debugging on)
cd mobile
pnpm install
adb reverse tcp:8000 tcp:8000     # lets the phone reach the backend
adb reverse tcp:8081 tcp:8081     # lets the phone reach Metro
pnpm start                        # keep this running in one terminal
pnpm android                      # in a second terminal: build and install
```

Open the app and allow notifications. Your phone will show up in the dashboard. Choose it and press **Send Notification**.

No USB cable? In the app, open **Settings** and change the backend address:
- Emulator: `http://10.0.2.2:8000`
- Same Wi-Fi: `http://<your laptop IP>:8000` (start the backend with `HOST=0.0.0.0 ./scripts/start-backend.sh`)

## How a message reaches the phone

| App state | Who shows the notification |
|---|---|
| Open | The app itself |
| Background or closed | Android itself |

When the dashboard says "accepted by Firebase", it means Firebase received the message. It does not prove that the phone showed it yet.

**Important:** delivery is never guaranteed. It can fail if the phone is offline, if notifications are turned off, or if the app was force-stopped (Android blocks it until you open the app again). Some phone brands also stop background apps to save battery.

## API

| Method | Address | What it does |
|---|---|---|
| GET | `/api/health` | Shows if the backend is working |
| POST | `/api/devices/register` | Saves a phone token |
| GET | `/api/devices` | Lists phones (tokens shortened) |
| POST | `/api/notifications/send` | Sends a notification |
| GET | `/api/notifications` | Shows recent messages |

## Tests

```bash
cd backend && source .venv/bin/activate && python -m pytest -q   # Firebase is faked, nothing is really sent
cd dashboard && pnpm build && pnpm lint
cd mobile && npx tsc --noEmit && pnpm lint
```

## Common problems

| Problem | What to do |
|---|---|
| Dashboard says "backend offline" | Start the backend first |
| App cannot register | Run `adb reverse tcp:8000 tcp:8000` again. It resets when you unplug the phone |
| Install fails: not enough storage | In `mobile/android`, run `./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a` for a smaller app |
| Gradle cannot find `gradle-plugin` | Run `pnpm install` inside `mobile/` |
| Health shows `firebase: not_configured` | Check the key path in `backend/.env` |
| Message accepted but nothing on the phone | Check notification permission, Do Not Disturb, battery saver, and that the app was not force-stopped |

## Keep it safe

These are ignored by git and must never be uploaded: `.env` files, the Firebase Admin key, `google-services.json`, signing keys, databases, and build files. Never put the Admin key in `dashboard/` or `mobile/`. Do not open the backend to the internet.
