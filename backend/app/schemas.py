"""Request and response shapes (validated by Pydantic)."""
from typing import Literal

from pydantic import BaseModel, Field, field_validator

# FCM tokens are long strings of letters, digits, '_', '-' and ':'.
_TOKEN_CHARS = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-:")


class RegisterDeviceRequest(BaseModel):
    fcm_token: str = Field(min_length=20, max_length=4096)
    platform: Literal["android"] = "android"
    device_name: str | None = Field(default=None, max_length=100)

    @field_validator("fcm_token")
    @classmethod
    def token_charset(cls, v: str) -> str:
        v = v.strip()
        if not v or not set(v) <= _TOKEN_CHARS:
            raise ValueError("fcm_token contains unexpected characters")
        return v

    @field_validator("device_name")
    @classmethod
    def clean_name(cls, v: str | None) -> str | None:
        v = v.strip() if v else None
        return v or None


class DeviceOut(BaseModel):
    id: str
    platform: str
    device_name: str | None
    token_preview: str
    created_at: str
    last_seen_at: str
    is_active: bool


class RegisterDeviceResponse(BaseModel):
    device: DeviceOut
    created: bool


class SendNotificationRequest(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    body: str = Field(min_length=1, max_length=1000)
    device_id: str = Field(min_length=1, max_length=64)

    @field_validator("title", "body")
    @classmethod
    def not_blank(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("must not be blank")
        return v


class NotificationOut(BaseModel):
    id: str
    device_id: str
    title: str
    body: str
    attempted_at: str
    status: Literal["accepted", "failed", "invalid_token"]
    firebase_message_id: str | None
    error_summary: str | None


class SendNotificationResponse(BaseModel):
    """`accepted` means Firebase took the message. It does NOT prove the
    phone showed it."""

    accepted: bool
    notification: NotificationOut
    detail: str


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"]
    database: Literal["ok", "error"]
    firebase: Literal["ready", "not_configured", "error"]
