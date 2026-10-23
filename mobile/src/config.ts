// Where the phone finds the FastAPI backend.
//
// "localhost" on a phone means the phone itself, so pick one of:
//  - USB cable + `adb reverse tcp:8000 tcp:8000`  -> http://127.0.0.1:8000 (default)
//  - Android emulator                             -> http://10.0.2.2:8000
//  - Same Wi-Fi                                   -> http://<your-computer-LAN-IP>:8000
// You can also change it at runtime in the app's "Backend URL" box.
export const DEFAULT_API_BASE_URL = 'http://127.0.0.1:8000';

// Must match the channel_id the backend sets and the manifest default.
export const CHANNEL_ID = 'general';
