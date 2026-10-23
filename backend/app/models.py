"""Plain data objects that mirror database rows."""
import re
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def mask_token(token: str) -> str:
    """Show just enough of an FCM token to tell devices apart."""
    if len(token) <= 12:
        return "***"
    return f"{token[:6]}…{token[-4:]}"


_SECRET_LIKE = re.compile(r"[A-Za-z0-9_\-:]{40,}")


def redact_secrets(text: str) -> str:
    """Strip anything that looks like a token from an error message."""
    return _SECRET_LIKE.sub("[redacted]", text)[:300]


@dataclass
class Device:
    id: str
    fcm_token: str
    platform: str
    device_name: str | None
    created_at: str
    last_seen_at: str
    is_active: bool

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> "Device":
        return cls(
            id=row["id"],
            fcm_token=row["fcm_token"],
            platform=row["platform"],
            device_name=row["device_name"],
            created_at=row["created_at"],
            last_seen_at=row["last_seen_at"],
            is_active=bool(row["is_active"]),
        )


@dataclass
class Notification:
    id: str
    device_id: str
    title: str
    body: str
    attempted_at: str
    status: str
    firebase_message_id: str | None
    error_summary: str | None

    @classmethod
    def from_row(cls, row: sqlite3.Row) -> "Notification":
        return cls(**{k: row[k] for k in row.keys()})
