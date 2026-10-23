import { PermissionsAndroid, Platform } from 'react-native';
import {
  getMessaging,
  getToken,
  onMessage,
  onTokenRefresh as onFcmTokenRefresh,
  RemoteMessage,
} from '@react-native-firebase/messaging';
import notifee, { AndroidImportance, EventType } from '@notifee/react-native';
import { CHANNEL_ID } from './config';

export type PermissionState = 'granted' | 'denied' | 'unknown';

/** Android 8+ requires a channel before any notification can be shown. */
export async function ensureChannel(): Promise<void> {
  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'General',
    importance: AndroidImportance.HIGH,
  });
}

/** Android 13+ asks at runtime; older versions grant it at install time. */
export async function requestPermission(): Promise<PermissionState> {
  if (Platform.OS !== 'android') {
    return 'unknown';
  }
  if (Number(Platform.Version) >= 33) {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    );
    return result === PermissionsAndroid.RESULTS.GRANTED ? 'granted' : 'denied';
  }
  return 'granted';
}

export function getFcmToken(): Promise<string> {
  return getToken(getMessaging());
}

export function onTokenRefresh(cb: (token: string) => void): () => void {
  return onFcmTokenRefresh(getMessaging(), cb);
}

/**
 * Backend sends "notification messages". When the app is in the background or
 * closed, Android shows them itself. When the app is open, Android does NOT, so
 * we show it here. Showing it only in the foreground avoids duplicates.
 */
export function onForegroundMessage(
  cb?: (m: RemoteMessage) => void,
  onError?: (msg: string) => void,
): () => void {
  return onMessage(getMessaging(), async remote => {
    console.log('[push] foreground message received');
    cb?.(remote);
    try {
      await notifee.displayNotification({
        title: remote.notification?.title ?? 'Notification',
        body: remote.notification?.body ?? '',
        data: remote.data,
        android: {
          channelId: CHANNEL_ID,
          pressAction: { id: 'default' }, // tapping brings the app to the front
        },
      });
      console.log('[push] notifee displayed notification');
    } catch (e) {
      console.warn('[push] notifee display failed', e);
      onError?.(e instanceof Error ? e.message : 'display failed');
    }
  });
}

/** Called when the user taps a notification while the app is open. */
export function onNotificationPress(cb: () => void): () => void {
  return notifee.onForegroundEvent(({ type }) => {
    if (type === EventType.PRESS) {
      cb();
    }
  });
}

export async function registerWithBackend(
  baseUrl: string,
  token: string,
): Promise<{ id: string }> {
  const model = (Platform.constants as { Model?: string }).Model;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/api/devices/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fcm_token: token,
        platform: 'android',
        device_name: model ?? 'Android phone',
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Backend answered HTTP ${res.status}`);
    }
    return await res.json();
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('Backend did not answer in 10 seconds');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
