"""FastAPI application: routes, CORS, request IDs and error handling."""
import logging
import sqlite3
import uuid
from contextvars import ContextVar

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import Settings
from .database import Database
from .device_service import DeviceService
from .firebase_service import FirebaseService, PushSender
from .models import Device, Notification, mask_token
from .notification_service import DeviceInactiveError, DeviceNotFoundError, NotificationService
from .schemas import (
    DeviceOut,
    HealthResponse,
    NotificationOut,
    RegisterDeviceRequest,
    RegisterDeviceResponse,
    SendNotificationRequest,
    SendNotificationResponse,
)

# Holds the current request's ID so every log line can include it.
request_id_var: ContextVar[str] = ContextVar("request_id", default="-")


class _RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


def _configure_logging() -> None:
    handler = logging.StreamHandler()
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s [%(request_id)s] %(name)s: %(message)s"))
    handler.addFilter(_RequestIdFilter())
    root = logging.getLogger("push")
    if not root.handlers:
        root.addHandler(handler)
    root.setLevel(logging.INFO)


def _device_out(d: Device) -> DeviceOut:
    return DeviceOut(
        id=d.id, platform=d.platform, device_name=d.device_name,
        token_preview=mask_token(d.fcm_token), created_at=d.created_at,
        last_seen_at=d.last_seen_at, is_active=d.is_active,
    )


def _notification_out(n: Notification) -> NotificationOut:
    return NotificationOut(**n.__dict__)


def create_app(settings: Settings | None = None, sender: PushSender | None = None,
               db: Database | None = None) -> FastAPI:
    """Build the app. Tests pass a fake `sender` and an in-memory `db`."""
    _configure_logging()
    settings = settings or Settings()
    db = db or Database(settings.database_path)
    sender = sender or FirebaseService(settings.google_application_credentials, settings.android_channel_id)
    devices = DeviceService(db)
    notifications = NotificationService(db, devices, sender)
    log = logging.getLogger("push.api")

    app = FastAPI(title="Local Push Notifications API")
    # Only the dashboard's origin may call this API from a browser.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type"],
        expose_headers=["X-Request-ID"],
    )

    # Give every request a short ID, log it, and return it in X-Request-ID.
    @app.middleware("http")
    async def request_id_middleware(request: Request, call_next):
        rid = uuid.uuid4().hex[:8]
        token = request_id_var.set(rid)
        try:
            response = await call_next(request)
        finally:
            request_id_var.reset(token)
        response.headers["X-Request-ID"] = rid
        return response

    # Safety nets: clients get a generic message; details go to the log only.
    @app.exception_handler(sqlite3.Error)
    async def db_error(request: Request, exc: sqlite3.Error):
        log.error("database error: %s", type(exc).__name__)
        return JSONResponse(status_code=500, content={"detail": "A database error occurred."})

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception):
        log.error("unhandled %s", type(exc).__name__, exc_info=exc)
        return JSONResponse(status_code=500, content={"detail": "Internal server error."})

    # "ok" only when both the database and Firebase are ready.
    @app.get("/api/health", response_model=HealthResponse)
    def health():
        try:
            with db.connect() as conn:
                conn.execute("SELECT 1")
            db_state = "ok"
        except sqlite3.Error:
            db_state = "error"
        firebase_state = sender.status()
        ok = db_state == "ok" and firebase_state == "ready"
        return HealthResponse(status="ok" if ok else "degraded", database=db_state, firebase=firebase_state)

    # Called by the phone on launch and on token refresh. Safe to repeat.
    @app.post("/api/devices/register", response_model=RegisterDeviceResponse)
    def register_device(body: RegisterDeviceRequest):
        device, created = devices.register(body.fcm_token, body.platform, body.device_name)
        return RegisterDeviceResponse(device=_device_out(device), created=created)

    @app.get("/api/devices", response_model=list[DeviceOut])
    def list_devices():
        return [_device_out(d) for d in devices.list()]

    @app.post("/api/notifications/send", response_model=SendNotificationResponse)
    def send_notification(body: SendNotificationRequest):
        try:
            result = notifications.send(body.device_id, body.title, body.body)
        except DeviceNotFoundError:
            raise HTTPException(status_code=404, detail="Unknown device ID.")
        except DeviceInactiveError:
            raise HTTPException(status_code=409, detail="This device is inactive. Open the app so it re-registers.")
        # 200 only when Firebase accepted it; otherwise 410/502/503 with the same body.
        payload = SendNotificationResponse(
            accepted=result.http_status == 200,
            notification=_notification_out(result.notification),
            detail=result.detail,
        )
        if result.http_status == 200:
            return payload
        return JSONResponse(status_code=result.http_status, content=payload.model_dump())

    @app.get("/api/notifications", response_model=list[NotificationOut])
    def notification_history(limit: int = Query(50, ge=1, le=200)):
        return [_notification_out(n) for n in notifications.history(limit)]

    return app


def get_app() -> FastAPI:
    return create_app()
