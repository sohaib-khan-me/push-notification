"""Send a notification and keep a record of every attempt."""
import logging
import uuid
from dataclasses import dataclass

from .database import Database
from .device_service import DeviceService
from .firebase_service import (
    FirebaseNotConfiguredError,
    InvalidTokenError,
    PushSender,
    SendFailedError,
)
from .models import Notification, mask_token, redact_secrets, utc_now

logger = logging.getLogger("push.notifications")


class DeviceNotFoundError(Exception):
    pass


class DeviceInactiveError(Exception):
    pass


@dataclass
class SendResult:
    notification: Notification
    http_status: int
    detail: str


class NotificationService:
    def __init__(self, db: Database, devices: DeviceService, sender: PushSender):
        self.db = db
        self.devices = devices
        self.sender = sender

    def send(self, device_id: str, title: str, body: str) -> SendResult:
        device = self.devices.get(device_id)
        if device is None:
            raise DeviceNotFoundError(device_id)
        if not device.is_active:
            raise DeviceInactiveError(device_id)

        notification_id = uuid.uuid4().hex
        status, message_id, error, http_status, detail = "failed", None, None, 502, ""
        try:
            message_id = self.sender.send(
                device.fcm_token, title, body, {"notification_id": notification_id}
            )
            status, http_status = "accepted", 200
            detail = "Firebase accepted the message. Delivery to the phone is not confirmed."
        except InvalidTokenError as exc:
            status, http_status = "invalid_token", 410
            error = redact_secrets(str(exc))
            detail = "The device token is no longer valid. The device was marked inactive."
            self.devices.deactivate(device.id)
        except FirebaseNotConfiguredError as exc:
            error, http_status = redact_secrets(str(exc)), 503
            detail = "The backend is not connected to Firebase."
        except SendFailedError as exc:
            # Temporary problem: keep the token, it may work next time.
            error = redact_secrets(str(exc))
            detail = "Firebase could not send the message. The device was kept; try again."
        except Exception:
            self._record(notification_id, device.id, title, body, "failed", None, "Unexpected internal error")
            logger.exception("unexpected error sending to device %s", device.id)
            raise

        notification = self._record(notification_id, device.id, title, body, status, message_id, error)
        logger.info("send to device %s (token %s): %s", device.id, mask_token(device.fcm_token), status)
        return SendResult(notification, http_status, detail)

    def _record(self, nid, device_id, title, body, status, message_id, error) -> Notification:
        now = utc_now()
        with self.db.connect() as conn:
            conn.execute(
                "INSERT INTO notifications (id, device_id, title, body, attempted_at, status, "
                "firebase_message_id, error_summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (nid, device_id, title, body, now, status, message_id, error),
            )
        return Notification(nid, device_id, title, body, now, status, message_id, error)

    def history(self, limit: int = 50) -> list[Notification]:
        with self.db.connect() as conn:
            rows = conn.execute(
                "SELECT * FROM notifications ORDER BY attempted_at DESC, rowid DESC LIMIT ?", (limit,)
            ).fetchall()
        return [Notification.from_row(r) for r in rows]
