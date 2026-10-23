import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { DEFAULT_API_BASE_URL } from './src/config';
import {
  PermissionState,
  ensureChannel,
  getFcmToken,
  onForegroundMessage,
  onNotificationPress,
  onTokenRefresh,
  registerWithBackend,
  requestPermission,
} from './src/notifications';

type Reg = 'idle' | 'working' | 'ok' | 'error';
type Received = { id: number; title: string; body: string; time: string };

// Never show the whole token; it identifies this phone to Firebase.
const mask = (t: string) => (t.length > 14 ? `${t.slice(0, 6)}…${t.slice(-6)}` : '***');
const clock = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

function Step({ ok, label, detail }: { ok: boolean | null; label: string; detail: string }) {
  const bg = ok === null ? '#cbd5e1' : ok ? '#16a34a' : '#dc2626';
  return (
    <View style={styles.step}>
      <View style={[styles.dot, { backgroundColor: bg }]}>
        <Text style={styles.dotText}>{ok === null ? '…' : ok ? '✓' : '!'}</Text>
      </View>
      <View style={styles.stepBody}>
        <Text style={styles.stepLabel}>{label}</Text>
        <Text style={styles.stepDetail}>{detail}</Text>
      </View>
    </View>
  );
}

function Main() {
  const [baseUrl, setBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [token, setToken] = useState<string | null>(null);
  const [reg, setReg] = useState<Reg>('idle');
  const [message, setMessage] = useState('Starting…');
  const [received, setReceived] = useState<Received[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  const register = useCallback(
    async (t: string) => {
      setReg('working');
      try {
        await registerWithBackend(baseUrl, t);
        setReg('ok');
        setMessage('Ready to receive notifications');
      } catch (e) {
        setReg('error');
        setMessage(`Could not reach the backend: ${e instanceof Error ? e.message : 'unknown error'}`);
      }
    },
    [baseUrl],
  );

  const start = useCallback(async () => {
    try {
      await ensureChannel();
      const perm = await requestPermission();
      setPermission(perm);
      const t = await getFcmToken();
      setToken(t);
      await register(t);
    } catch (e) {
      setReg('error');
      setMessage(`Firebase setup failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  }, [register]);

  useEffect(() => {
    start();
    const offToken = onTokenRefresh(t => {
      setToken(t);
      register(t);
    });
    const offMsg = onForegroundMessage(
      m =>
        setReceived(prev =>
          [
            {
              id: Date.now(),
              title: m.notification?.title ?? 'Notification',
              body: m.notification?.body ?? '',
              time: clock(),
            },
            ...prev,
          ].slice(0, 20),
        ),
      err => setMessage(`Could not display notification: ${err}`),
    );
    const offPress = onNotificationPress(() => {});
    return () => {
      offToken();
      offMsg();
      offPress();
    };
    // Run once on launch; "Register again" re-runs it with the edited URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const banner =
    reg === 'ok'
      ? { bg: '#dcfce7', fg: '#166534' }
      : reg === 'error'
      ? { bg: '#fee2e2', fg: '#991b1b' }
      : { bg: '#e2e8f0', fg: '#334155' };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Local Push</Text>
        <Text style={styles.headerSub}>Notifications from your dashboard</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body}>
        <View style={[styles.banner, { backgroundColor: banner.bg }]}>
          {reg === 'working' && <ActivityIndicator color={banner.fg} />}
          <Text style={[styles.bannerText, { color: banner.fg }]}>{message}</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Setup</Text>
          <Step
            ok={permission === 'unknown' ? null : permission === 'granted'}
            label="Notification permission"
            detail={permission === 'denied' ? 'Denied. Enable in Android Settings → Apps' : permission}
          />
          <Step
            ok={token ? true : null}
            label="Firebase token"
            detail={token ? mask(token) : 'Waiting for Firebase…'}
          />
          <Step
            ok={reg === 'ok' ? true : reg === 'error' ? false : null}
            label="Backend registration"
            detail={reg === 'ok' ? 'Registered' : reg === 'error' ? 'Failed' : 'Working…'}
          />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Received while app is open</Text>
          {received.length === 0 ? (
            <Text style={styles.empty}>
              Nothing yet. Send one from the dashboard. When the app is closed, Android shows
              notifications in the notification bar instead.
            </Text>
          ) : (
            received.map(r => (
              <View key={r.id} style={styles.msg}>
                <View style={styles.msgHead}>
                  <Text style={styles.msgTitle}>{r.title}</Text>
                  <Text style={styles.msgTime}>{r.time}</Text>
                </View>
                <Text style={styles.msgBody}>{r.body}</Text>
              </View>
            ))
          )}
        </View>

        <Pressable onPress={() => setShowSettings(s => !s)}>
          <Text style={styles.link}>{showSettings ? 'Hide settings' : 'Settings'}</Text>
        </Pressable>
        {showSettings && (
          <View style={styles.card}>
            <Text style={styles.stepDetail}>Backend URL</Text>
            <TextInput
              style={styles.input}
              value={baseUrl}
              onChangeText={setBaseUrl}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
            <Pressable
              style={[styles.button, reg === 'working' && styles.disabled]}
              disabled={reg === 'working'}
              onPress={() => (token ? register(token) : start())}>
              <Text style={styles.buttonText}>Register again</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#1d4ed8' },
  header: { backgroundColor: '#1d4ed8', paddingHorizontal: 20, paddingVertical: 18 },
  headerTitle: { fontSize: 26, fontWeight: '800', color: '#fff' },
  headerSub: { color: '#bfdbfe', marginTop: 2 },
  body: { padding: 16, gap: 14, backgroundColor: '#f1f5f9', flexGrow: 1 },
  banner: { flexDirection: 'row', gap: 10, alignItems: 'center', borderRadius: 12, padding: 14 },
  bannerText: { fontWeight: '700', flexShrink: 1 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  step: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  dotText: { color: '#fff', fontWeight: '800' },
  stepBody: { flex: 1 },
  stepLabel: { color: '#0f172a', fontWeight: '600' },
  stepDetail: { color: '#64748b', fontSize: 13 },
  empty: { color: '#64748b', lineHeight: 20 },
  msg: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 12, gap: 2 },
  msgHead: { flexDirection: 'row', justifyContent: 'space-between' },
  msgTitle: { fontWeight: '700', color: '#0f172a' },
  msgTime: { color: '#94a3b8', fontSize: 12 },
  msgBody: { color: '#334155' },
  link: { color: '#2563eb', fontWeight: '600', textAlign: 'center', padding: 6 },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 10, color: '#0f172a' },
  button: { backgroundColor: '#2563eb', borderRadius: 10, padding: 12, alignItems: 'center' },
  disabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700' },
});
