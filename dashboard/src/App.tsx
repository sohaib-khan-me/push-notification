import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  ApiError,
  getDevices,
  getHealth,
  getNotifications,
  sendNotification,
} from './api'
import type { Device, Health, NotificationRecord } from './api'

const DEFAULT_TITLE = 'Hello!'
const DEFAULT_BODY = 'You have received a new notification.'
const POLL_MS = 5000

type Banner = { kind: 'success' | 'error'; text: string } | null

const STATUS_STYLE: Record<NotificationRecord['status'], string> = {
  accepted: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  failed: 'bg-amber-100 text-amber-800 ring-amber-200',
  invalid_token: 'bg-red-100 text-red-800 ring-red-200',
}

const TEMPLATES = [
  { label: 'Hello', title: 'Hello!', body: 'You have received a new notification.' },
  { label: 'Reminder', title: 'Reminder', body: "Don't forget your task for today." },
  { label: 'Alert', title: 'Heads up!', body: 'Something needs your attention.' },
]
const STATUS_LABEL: Record<NotificationRecord['status'], string> = {
  accepted: 'Accepted by Firebase',
  failed: 'Failed',
  invalid_token: 'Token invalid',
}

const formatTime = (iso: string) => new Date(iso).toLocaleString()

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-slate-200/70 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Spinner() {
  return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [backendError, setBackendError] = useState<string | null>(null)
  const [devices, setDevices] = useState<Device[]>([])
  const [history, setHistory] = useState<NotificationRecord[]>([])
  const [loading, setLoading] = useState(true)

  const [selectedId, setSelectedId] = useState('')
  const [title, setTitle] = useState(DEFAULT_TITLE)
  const [body, setBody] = useState(DEFAULT_BODY)
  const [sending, setSending] = useState(false)
  const [banner, setBanner] = useState<Banner>(null)

  const refresh = useCallback(async () => {
    try {
      const [h, d, n] = await Promise.all([getHealth(), getDevices(), getNotifications()])
      setHealth(h)
      setDevices(d)
      setHistory(n)
      setBackendError(null)
    } catch (err) {
      setHealth(null)
      setBackendError(err instanceof ApiError ? err.message : 'Unexpected error talking to the backend.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Load once, then poll so new phones and results show up without a manual refresh.
  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), POLL_MS)
    return () => clearInterval(timer)
  }, [refresh])

  const activeDevices = devices.filter((d) => d.is_active)
  // Use the chosen device if it is still active, otherwise the first active one.
  const deviceId = activeDevices.find((d) => d.id === selectedId)?.id ?? activeDevices[0]?.id ?? ''

  const deviceName = (id: string) => devices.find((d) => d.id === id)?.device_name ?? id.slice(0, 8)

  const titleError = title.trim() ? null : 'Title is required'
  const bodyError = body.trim() ? null : 'Message is required'
  const canSend = !sending && !!deviceId && !titleError && !bodyError && !backendError

  // Success here only means Firebase accepted the message, not that the phone showed it.
  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!canSend) return
    setSending(true)
    setBanner(null)
    try {
      await sendNotification({ title: title.trim(), body: body.trim(), device_id: deviceId })
      setBanner({
        kind: 'success',
        text: 'Firebase accepted the message. This does not guarantee the phone has shown it yet.',
      })
    } catch (err) {
      setBanner({ kind: 'error', text: err instanceof ApiError ? err.message : 'Unexpected error.' })
    } finally {
      setSending(false)
      void refresh()
    }
  }

  const connection = backendError
    ? { dot: 'bg-red-400', text: 'Backend offline' }
    : health?.status === 'ok'
      ? { dot: 'bg-emerald-400', text: 'Backend connected' }
      : health
        ? { dot: 'bg-amber-400', text: `Degraded (Firebase: ${health.firebase.replace('_', ' ')})` }
        : { dot: 'bg-slate-300', text: 'Connecting…' }

  const acceptedCount = history.filter((n) => n.status === 'accepted').length
  const inputCls =
    'w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm shadow-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100'

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="bg-gradient-to-r from-indigo-700 via-indigo-600 to-violet-600 pb-24 pt-8 text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Push Notification Dashboard</h1>
              <p className="text-sm text-indigo-100">Send notifications to your Android phone through Firebase.</p>
            </div>
          </div>
          <span className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm backdrop-blur">
            <span className={`h-2.5 w-2.5 rounded-full ${connection.dot}`} />
            {connection.text}
          </span>
        </div>
      </header>

      <main className="mx-auto -mt-16 max-w-6xl px-4 pb-12">
        <div className="mb-6 grid gap-4 sm:grid-cols-3">
          {[
            { label: 'Active devices', value: activeDevices.length },
            { label: 'Accepted by Firebase', value: acceptedCount },
            { label: 'Total attempts', value: history.length },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border-l-4 border-indigo-500 bg-white p-5 shadow-md">
              <div className="text-3xl font-bold text-slate-900">{loading ? '–' : s.value}</div>
              <div className="text-sm text-slate-500">{s.label}</div>
            </div>
          ))}
        </div>

        {backendError && (
          <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
            {backendError}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3">
            <Card title="Send notification">
              <form onSubmit={onSubmit} className="space-y-5" noValidate>
                <label className="block text-sm">
                  <span className="mb-1.5 block font-medium text-slate-700">Device</span>
                  <select
                    value={deviceId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    disabled={activeDevices.length === 0}
                    className={`${inputCls} disabled:bg-slate-100`}
                  >
                    {activeDevices.length === 0 && <option value="">No registered device</option>}
                    {activeDevices.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.device_name ?? 'Android device'} · {d.token_preview}
                      </option>
                    ))}
                  </select>
                  {!loading && activeDevices.length === 0 && !backendError && (
                    <span className="mt-1 block text-xs text-slate-500">Open the Android app so it can register itself.</span>
                  )}
                </label>

                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-slate-500">Quick fill:</span>
                  {TEMPLATES.map((t) => (
                    <button
                      key={t.label}
                      type="button"
                      onClick={() => {
                        setTitle(t.title)
                        setBody(t.body)
                      }}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700 transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <label className="block text-sm">
                  <span className="mb-1.5 flex justify-between font-medium text-slate-700">
                    Title <span className="font-normal text-slate-400">{title.length}/100</span>
                  </span>
                  <input value={title} maxLength={100} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
                  {titleError && <span className="text-xs text-red-600">{titleError}</span>}
                </label>

                <label className="block text-sm">
                  <span className="mb-1.5 flex justify-between font-medium text-slate-700">
                    Message <span className="font-normal text-slate-400">{body.length}/1000</span>
                  </span>
                  <textarea value={body} rows={3} maxLength={1000} onChange={(e) => setBody(e.target.value)} className={inputCls} />
                  {bodyError && <span className="text-xs text-red-600">{bodyError}</span>}
                </label>

                <button
                  type="submit"
                  disabled={!canSend}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-semibold text-white shadow-md shadow-indigo-200 transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                >
                  {sending && <Spinner />}
                  {sending ? 'Sending…' : 'Send Notification'}
                </button>

                {banner && (
                  <div
                    role={banner.kind === 'error' ? 'alert' : 'status'}
                    className={`rounded-xl border p-3.5 text-sm ${
                      banner.kind === 'success'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-red-200 bg-red-50 text-red-800'
                    }`}
                  >
                    {banner.text}
                  </div>
                )}
              </form>
            </Card>
          </div>

          <div className="space-y-6 lg:col-span-2">
            <Card title="Preview">
              <div className="rounded-2xl bg-slate-800 p-4">
                <div className="rounded-xl bg-white p-3.5 shadow-lg">
                  <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
                    <span className="flex h-4 w-4 items-center justify-center rounded bg-indigo-600 text-[10px] text-white">L</span>
                    Local Push · now
                  </div>
                  <div className="font-semibold text-slate-900">{title.trim() || 'Title'}</div>
                  <div className="text-sm text-slate-600">{body.trim() || 'Your message appears here.'}</div>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">Roughly how it looks on the phone.</p>
            </Card>

            <Card
              title="Devices"
              action={
                <button onClick={() => void refresh()} className="text-sm font-medium text-indigo-600 hover:underline">
                  Refresh
                </button>
              }
            >
              {loading ? (
                <p className="text-sm text-slate-500">Loading…</p>
              ) : devices.length === 0 ? (
                <p className="text-sm text-slate-500">No devices yet. Open the Android app to register one.</p>
              ) : (
                <ul className="space-y-3">
                  {devices.map((d) => (
                    <li key={d.id} className="flex items-center gap-3 text-sm">
                      <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${d.is_active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium">{d.device_name ?? 'Android device'}</div>
                        <div className="truncate text-xs text-slate-500">
                          {d.token_preview} · seen {formatTime(d.last_seen_at)}
                        </div>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${d.is_active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                        {d.is_active ? 'active' : 'inactive'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>

        <div className="mt-6">
          <Card
            title="Notification history"
            action={
              <button onClick={() => void refresh()} className="text-sm font-medium text-indigo-600 hover:underline">
                Refresh
              </button>
            }
          >
            {loading ? (
              <p className="text-sm text-slate-500">Loading…</p>
            ) : history.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">Nothing sent yet. Send your first notification above.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {history.map((n) => (
                  <li key={n.id} className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900">{n.title}</div>
                      <div className="text-slate-600">{n.body}</div>
                      <div className="mt-0.5 text-xs text-slate-400">
                        {deviceName(n.device_id)} · {formatTime(n.attempted_at)}
                      </div>
                      {n.error_summary && <div className="mt-1 text-xs text-slate-500">{n.error_summary}</div>}
                    </div>
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[n.status]}`}>
                      {STATUS_LABEL[n.status]}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </main>
    </div>
  )
}
