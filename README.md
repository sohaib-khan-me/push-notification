# Local Android Push Notifications (FCM)

Send a push notification from a React dashboard in your browser to your own Android phone, through Firebase Cloud Messaging (FCM).

```
Dashboard (React) --HTTP--> Backend (FastAPI + SQLite) --Firebase Admin SDK--> FCM --> Android app
                                  ^                                                      |
                                  +------------- registers its FCM token ----------------+
```

- `dashboard/` – React + Vite + TypeScript + Tailwind. Pick a device, type a title and message, click Send.
- `backend/` – FastAPI. Stores devices and history in SQLite and is the **only** part that holds Firebase credentials.
- `mobile/` – React Native (CLI, native Android). Gets an FCM token and registers it with the backend.
- `scripts/` – small helper launchers.

Firebase project: `Local Push Notifications` (id `local-push-notifications-cf55b`), Android package `com.sohaib.localpushnotifications`.

## Credentials (already set up)

| File | Where it lives | Used by |
|---|---|---|
| `google-services.json` | `mobile/android/app/google-services.json` | Android app (safe to ship in an APK, but git-ignored anyway) |
| Admin SDK key | `~/.config/fcm-push-notifications/service-account.json` (mode 600, outside the repo) | Backend only |

The backend finds the key through `backend/.env`:
`GOOGLE_APPLICATION_CREDENTIALS=/home/hp/.config/fcm-push-notifications/service-account.json`.
`.env.example` files contain placeholders only. Never put the Admin key in `dashboard/` or `mobile/`.

## 1. Start the backend

```bash
cd backend
python3 -m venv .venv            # first time only
source .venv/bin/activate
pip install -r requirements.txt  # first time only
uvicorn app.main:get_app --factory --host 127.0.0.1 --port 8000
```
Or: `./scripts/start-backend.sh`. Check it: `curl http://127.0.0.1:8000/api/health` should show `"firebase":"ready"`.
Logs print in this terminal (each request has an `X-Request-ID`; tokens are always masked). The database is `backend/data/push.db`.

## 2. Start the dashboard

```bash
cd dashboard
pnpm install     # first time only
pnpm dev         # http://localhost:5173
```
Or: `./scripts/start-dashboard.sh`. The backend URL comes from `dashboard/.env` (`VITE_API_BASE_URL=http://127.0.0.1:8000`).

## 3. Build and install the Android app

### One-time prerequisites (missing on this computer when the project was built)
- **JDK 17** (`sudo apt install openjdk-17-jdk`)
- **Android SDK** (easiest: install Android Studio, open *SDK Manager*, install the SDK Platform and Build-Tools the project asks for, plus NDK `27.1.12297006`). Then add to `~/.bashrc`:
  ```bash
  export ANDROID_HOME=$HOME/Android/Sdk
  export PATH=$PATH:$ANDROID_HOME/platform-tools
  ```
- On the phone: *Settings → About phone →* tap **Build number** 7 times, then enable **USB debugging** in *Developer options*.

### Build and run
```bash
cd mobile
pnpm install
adb devices                      # your phone must be listed as "device"
adb reverse tcp:8000 tcp:8000    # lets the phone reach the backend at 127.0.0.1:8000 over USB
pnpm start                       # Metro bundler (leave running, in one terminal)
pnpm android                     # in a second terminal: builds and installs the debug app
```

### Backend URL options for the phone
| Setup | URL in the app |
|---|---|
| USB + `adb reverse` (default) | `http://127.0.0.1:8000` |
| Android emulator | `http://10.0.2.2:8000` |
| Same Wi-Fi | `http://<LAN IP>:8000` – find it with `hostname -I`, start the backend with `HOST=0.0.0.0 ./scripts/start-backend.sh`, and allow port 8000 only on your home network. Do not expose it to the internet. |

You can edit the URL in the app's "Backend URL" box and tap **Register again**.

## 4. Register the device and send the first notification

1. Open the app on the phone, **allow notifications** when asked. The status should say "Registered with the backend."
2. In the dashboard click **Refresh** – your phone appears in the device list.
3. Keep the default title `Hello!` and message `You have received a new notification.` (or edit them), select the device, click **Send Notification**.
4. The dashboard says the message was **accepted by Firebase**. That is not proof the phone showed it. Check the phone.

## How delivery works (and its limits)

The backend sends an FCM **notification message** (title + body) with high priority and channel `general`.

- **App in background or closed:** Android's system shows it itself. No app code runs, so there are no duplicates.
- **App open (foreground):** Android does *not* show it; the app receives it and displays it with Notifee. Tapping it opens the app.
- A *data-only* message would give us more control but is more likely to be throttled by battery optimisation, so it was not used.

Honest limits – delivery is never guaranteed:
- Phone offline: FCM holds the message for a limited time, then drops it.
- Notification permission denied (Android 13+) or the `General` channel turned off: nothing is shown.
- **Force-stopped app** (Settings → Force stop, or swiped away on some brands): Android blocks FCM until the user opens the app again. This is Android behaviour, not a bug.
- Some makers (Xiaomi, Huawei, Oppo, Vivo, Samsung "sleeping apps") kill background apps aggressively. Disable battery optimisation for the app if notifications are late.
- A token becomes invalid if the app is uninstalled or its data is cleared. The backend then marks the device inactive (HTTP 410). Temporary network errors do **not** deactivate a device.

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | Status plus safe diagnostics (`database`, `firebase`) |
| POST | `/api/devices/register` | `{fcm_token, platform, device_name}`; repeat calls are idempotent |
| GET | `/api/devices` | Devices with masked tokens |
| POST | `/api/notifications/send` | `{title, body, device_id}` |
| GET | `/api/notifications` | Recent attempts |

Interactive docs: http://127.0.0.1:8000/docs

## Tests

```bash
cd backend && source .venv/bin/activate && python -m pytest -q   # Firebase is mocked; no real sends
cd dashboard && pnpm build && pnpm lint
cd mobile && npx tsc --noEmit && pnpm lint
```

## Troubleshooting

- **Dashboard says backend offline** – start the backend; check `VITE_API_BASE_URL` and that the browser origin is `http://localhost:5173` (CORS only allows that and `127.0.0.1:5173`).
- **App says "Could not register"** – on USB run `adb reverse tcp:8000 tcp:8000` again (it resets when the cable is unplugged), or fix the URL in the app. Emulator needs `10.0.2.2`.
- **`uvicorn: Attribute "app" not found`** – the app is a factory; add `--factory` and use `app.main:get_app`.
- **Health shows `"firebase":"not_configured"`** – check `GOOGLE_APPLICATION_CREDENTIALS` in `backend/.env` points to an existing file.
- **Send returns 410** – the phone's token is dead. Open the app so it registers a fresh one.
- **Send accepted but nothing on phone** – check permission, the `General` channel, Do Not Disturb, battery optimisation, and that the app wasn't force-stopped.
- **`ERR_PNPM_IGNORED_BUILDS`** – harmless; `mobile/pnpm-workspace.yaml` marks those two scripts as skipped.
- **Gradle: `gradle-plugin ... does not exist`** – pnpm must use a flat `node_modules`: `mobile/pnpm-workspace.yaml` sets `nodeLinker: hoisted`; run `pnpm install` again.
- **`INSTALL_FAILED_INSUFFICIENT_STORAGE`** – the phone is nearly full. Build only for your phone's CPU: `cd mobile/android && ./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a` (41 MB instead of 124 MB), then `adb install -r app/build/outputs/apk/debug/app-debug.apk`.
- **Debug app shows a blank screen** – the first Metro bundle is still loading; keep `pnpm start` running and `adb reverse tcp:8081 tcp:8081` set.
- **Gradle `SDK location not found`** – set `ANDROID_HOME` or create `mobile/android/local.properties` with `sdk.dir=/home/hp/Android/Sdk`.
