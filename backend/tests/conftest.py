import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.database import Database
from app.firebase_service import InvalidTokenError, SendFailedError
from app.main import create_app

TOKEN_A = "A" * 30 + ":APA91bExampleTokenForTests_1234567890"
TOKEN_B = "B" * 30 + ":APA91bAnotherTokenForTests_0987654321"


class FakeSender:
    """Stands in for Firebase. Set `next_error` to simulate a failure."""

    def __init__(self):
        self.sent: list[tuple] = []
        self.next_error: Exception | None = None
        self.state = "ready"

    def status(self) -> str:
        return self.state

    def send(self, token, title, body, data):
        if self.next_error:
            raise self.next_error
        self.sent.append((token, title, body, data))
        return "projects/test/messages/123"


@pytest.fixture
def sender():
    return FakeSender()


@pytest.fixture
def client(sender):
    app = create_app(Settings(google_application_credentials=None), sender=sender, db=Database(":memory:"))
    # Return real HTTP 500s instead of re-raising, like an actual client sees.
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def device(client):
    r = client.post("/api/devices/register", json={"fcm_token": TOKEN_A, "device_name": "Test Phone"})
    return r.json()["device"]
