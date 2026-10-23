"""The only module that talks to Firebase. Tests replace it with a fake."""
import logging
import os
from pathlib import Path
from typing import Protocol

import firebase_admin
from firebase_admin import credentials, exceptions, messaging

logger = logging.getLogger("push.firebase")


class FirebaseNotConfiguredError(Exception):
    """The service-account key is missing or unusable."""


class InvalidTokenError(Exception):
    """Firebase says this token is permanently dead (app uninstalled, etc.)."""


class SendFailedError(Exception):
    """Temporary or unknown failure. The token may still be fine."""


class PushSender(Protocol):
    def status(self) -> str: ...

    def send(self, token: str, title: str, body: str, data: dict[str, str]) -> str: ...


class FirebaseService:
    def __init__(self, credentials_path: str | None, android_channel_id: str = "general"):
        self._credentials_path = credentials_path
        self._channel_id = android_channel_id
        self._app: firebase_admin.App | None = None
        self._init_error: str | None = None

    def _get_app(self) -> firebase_admin.App:
        if self._app is not None:
            return self._app
        path = self._credentials_path
        if not path or not Path(path).is_file():
            raise FirebaseNotConfiguredError(
                "GOOGLE_APPLICATION_CREDENTIALS is not set or the file does not exist"
            )
        try:
            self._app = firebase_admin.initialize_app(credentials.Certificate(path))
        except (ValueError, OSError) as exc:
            # Do not include exc text: it could echo parts of the key file.
            logger.error("Firebase initialisation failed (%s)", type(exc).__name__)
            raise FirebaseNotConfiguredError("Firebase credentials could not be loaded") from exc
        return self._app

    def status(self) -> str:
        """'ready', 'not_configured' or 'error'. Never raises."""
        try:
            self._get_app()
            return "ready"
        except FirebaseNotConfiguredError:
            path = self._credentials_path
            return "not_configured" if not path or not Path(path).is_file() else "error"

    def send(self, token: str, title: str, body: str, data: dict[str, str]) -> str:
        app = self._get_app()
        # Notification message (title + body) so Android itself shows it when
        # the app is in the background or closed. Foreground display is done
        # by the app, which avoids duplicates.
        message = messaging.Message(
            token=token,
            notification=messaging.Notification(title=title, body=body),
            data=data,
            android=messaging.AndroidConfig(
                priority="high",
                notification=messaging.AndroidNotification(channel_id=self._channel_id),
            ),
        )
        try:
            return messaging.send(message, app=app)
        except (messaging.UnregisteredError, messaging.SenderIdMismatchError) as exc:
            raise InvalidTokenError("Firebase reports the token is no longer valid") from exc
        except exceptions.FirebaseError as exc:
            logger.warning("FCM send failed: code=%s", exc.code)
            raise SendFailedError(f"Firebase error: {exc.code}") from exc
        except ValueError as exc:
            raise SendFailedError("The message was rejected as malformed") from exc


def credentials_path_from_env() -> str | None:
    return os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
