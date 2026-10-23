"""Register, look up and list devices."""
import logging
import uuid

from .database import Database
from .models import Device, mask_token, utc_now

logger = logging.getLogger("push.devices")


class DeviceService:
    def __init__(self, db: Database):
        self.db = db

    def register(self, fcm_token: str, platform: str, device_name: str | None) -> tuple[Device, bool]:
        """Insert or refresh a device. Returns (device, created). Safe to repeat."""
        now = utc_now()
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM devices WHERE fcm_token = ?", (fcm_token,)).fetchone()
            if row:
                conn.execute(
                    "UPDATE devices SET last_seen_at = ?, is_active = 1, "
                    "device_name = COALESCE(?, device_name) WHERE id = ?",
                    (now, device_name, row["id"]),
                )
                created = False
                device_id = row["id"]
            else:
                device_id = uuid.uuid4().hex
                conn.execute(
                    "INSERT INTO devices (id, fcm_token, platform, device_name, created_at, last_seen_at) "
                    "VALUES (?, ?, ?, ?, ?, ?)",
                    (device_id, fcm_token, platform, device_name, now, now),
                )
                created = True
            device = Device.from_row(conn.execute("SELECT * FROM devices WHERE id = ?", (device_id,)).fetchone())
        logger.info("device %s %s (token %s)", device.id, "registered" if created else "refreshed", mask_token(fcm_token))
        return device, created

    def get(self, device_id: str) -> Device | None:
        with self.db.connect() as conn:
            row = conn.execute("SELECT * FROM devices WHERE id = ?", (device_id,)).fetchone()
        return Device.from_row(row) if row else None

    def list(self) -> list[Device]:
        with self.db.connect() as conn:
            rows = conn.execute("SELECT * FROM devices ORDER BY last_seen_at DESC").fetchall()
        return [Device.from_row(r) for r in rows]

    def deactivate(self, device_id: str) -> None:
        with self.db.connect() as conn:
            conn.execute("UPDATE devices SET is_active = 0 WHERE id = ?", (device_id,))
        logger.info("device %s marked inactive", device_id)
