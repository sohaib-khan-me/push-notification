const BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://127.0.0.1:8000'

export interface Health {
  status: 'ok' | 'degraded'
  database: 'ok' | 'error'
  firebase: 'ready' | 'not_configured' | 'error'
}

export interface Device {
  id: string
  platform: string
  device_name: string | null
  token_preview: string
  created_at: string
  last_seen_at: string
  is_active: boolean
}

export interface NotificationRecord {
  id: string
  device_id: string
  title: string
  body: string
  attempted_at: string
  status: 'accepted' | 'failed' | 'invalid_token'
  firebase_message_id: string | null
  error_summary: string | null
}

export interface SendResponse {
  accepted: boolean
  notification: NotificationRecord
  detail: string
}

export class ApiError extends Error {
  status: number | null

  constructor(message: string, status: number | null) {
    super(message)
    this.status = status
  }
}

/** Turn FastAPI error bodies (string or validation list) into one readable line. */
function describe(body: unknown, fallback: string): string {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail
    if (typeof detail === 'string') return detail
    if (Array.isArray(detail)) {
      return detail.map((d: { loc?: unknown[]; msg?: string }) => `${d.loc?.at(-1) ?? 'input'}: ${d.msg}`).join('; ')
    }
  }
  return fallback
}

/** One place for all calls: turns network and HTTP errors into a readable ApiError. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE_URL}${path}`, init)
  } catch {
    throw new ApiError(`Cannot reach the backend at ${BASE_URL}. Is it running?`, null)
  }
  const body: unknown = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(describe(body, `Request failed (HTTP ${res.status})`), res.status)
  return body as T
}

export const getHealth = () => request<Health>('/api/health')
export const getDevices = () => request<Device[]>('/api/devices')
export const getNotifications = () => request<NotificationRecord[]>('/api/notifications?limit=25')

export async function sendNotification(payload: { title: string; body: string; device_id: string }) {
  return request<SendResponse>('/api/notifications/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
