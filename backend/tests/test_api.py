from app.firebase_service import FirebaseNotConfiguredError, InvalidTokenError, SendFailedError

from .conftest import TOKEN_A, TOKEN_B


def send(client, device_id, title="Hello!", body="You have received a new notification."):
    return client.post("/api/notifications/send", json={"title": title, "body": body, "device_id": device_id})


# ---- health -------------------------------------------------------------
def test_health_ok(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "database": "ok", "firebase": "ready"}
    assert "X-Request-ID" in r.headers


def test_health_degraded_when_firebase_missing(client, sender):
    sender.state = "not_configured"
    assert client.get("/api/health").json()["status"] == "degraded"


# ---- devices ------------------------------------------------------------
def test_register_device(client):
    r = client.post("/api/devices/register", json={"fcm_token": TOKEN_A, "device_name": " My Phone "})
    assert r.status_code == 200
    body = r.json()
    assert body["created"] is True
    assert body["device"]["device_name"] == "My Phone"
    assert body["device"]["platform"] == "android"
    assert TOKEN_A not in r.text


def test_duplicate_registration_is_idempotent(client):
    first = client.post("/api/devices/register", json={"fcm_token": TOKEN_A}).json()
    second = client.post("/api/devices/register", json={"fcm_token": TOKEN_A, "device_name": "Renamed"}).json()
    assert second["created"] is False
    assert second["device"]["id"] == first["device"]["id"]
    assert second["device"]["device_name"] == "Renamed"
    assert len(client.get("/api/devices").json()) == 1


def test_list_devices_masks_tokens(client):
    client.post("/api/devices/register", json={"fcm_token": TOKEN_A})
    client.post("/api/devices/register", json={"fcm_token": TOKEN_B})
    r = client.get("/api/devices")
    assert len(r.json()) == 2
    assert TOKEN_A not in r.text and TOKEN_B not in r.text
    assert "fcm_token" not in r.json()[0]
    assert "…" in r.json()[0]["token_preview"]


def test_register_validation(client):
    assert client.post("/api/devices/register", json={"fcm_token": "short"}).status_code == 422
    assert client.post("/api/devices/register", json={"fcm_token": "x" * 40 + " bad chars!"}).status_code == 422
    assert client.post("/api/devices/register", json={"fcm_token": TOKEN_A, "platform": "ios"}).status_code == 422
    assert client.post("/api/devices/register", json={}).status_code == 422


# ---- sending ------------------------------------------------------------
def test_send_validation(client, device):
    assert send(client, device["id"], title="").status_code == 422
    assert send(client, device["id"], body="   ").status_code == 422
    assert client.post("/api/notifications/send", json={"title": "x", "body": "y"}).status_code == 422


def test_send_unknown_device(client):
    r = send(client, "does-not-exist")
    assert r.status_code == 404
    assert client.get("/api/notifications").json() == []


def test_send_success(client, device, sender):
    r = send(client, device["id"])
    assert r.status_code == 200
    body = r.json()
    assert body["accepted"] is True
    assert body["notification"]["status"] == "accepted"
    assert body["notification"]["firebase_message_id"] == "projects/test/messages/123"
    token, title, text, data = sender.sent[0]
    assert (token, title) == (TOKEN_A, "Hello!")
    assert data == {"notification_id": body["notification"]["id"]}
    assert "not confirmed" in body["detail"]


def test_send_firebase_failure_keeps_device(client, device, sender):
    sender.next_error = SendFailedError("Firebase error: UNAVAILABLE")
    r = send(client, device["id"])
    assert r.status_code == 502
    assert r.json()["accepted"] is False
    assert r.json()["notification"]["status"] == "failed"
    # A temporary error must not deactivate the device.
    assert client.get("/api/devices").json()[0]["is_active"] is True


def test_send_firebase_not_configured(client, device, sender):
    sender.next_error = FirebaseNotConfiguredError("no creds")
    r = send(client, device["id"])
    assert r.status_code == 503
    assert client.get("/api/devices").json()[0]["is_active"] is True


def test_invalid_token_deactivates_device(client, device, sender):
    sender.next_error = InvalidTokenError("gone")
    r = send(client, device["id"])
    assert r.status_code == 410
    assert r.json()["notification"]["status"] == "invalid_token"
    assert client.get("/api/devices").json()[0]["is_active"] is False
    # Further sends are refused until the app registers again.
    sender.next_error = None
    assert send(client, device["id"]).status_code == 409
    client.post("/api/devices/register", json={"fcm_token": TOKEN_A})
    assert client.get("/api/devices").json()[0]["is_active"] is True
    assert send(client, device["id"]).status_code == 200


def test_unexpected_error_is_hidden_from_client(client, device, sender):
    sender.next_error = RuntimeError("secret internal detail")
    r = client.post("/api/notifications/send",
                    json={"title": "a", "body": "b", "device_id": device["id"]})
    assert r.status_code == 500
    assert "secret" not in r.text and "Traceback" not in r.text


# ---- history ------------------------------------------------------------
def test_notification_history(client, device, sender):
    send(client, device["id"], title="First")
    sender.next_error = SendFailedError("Firebase error: UNAVAILABLE")
    send(client, device["id"], title="Second")
    r = client.get("/api/notifications")
    assert r.status_code == 200
    items = r.json()
    assert [i["title"] for i in items] == ["Second", "First"]
    assert [i["status"] for i in items] == ["failed", "accepted"]
    assert items[0]["error_summary"]
    assert TOKEN_A not in r.text
    assert client.get("/api/notifications?limit=1").json()[0]["title"] == "Second"
    assert client.get("/api/notifications?limit=0").status_code == 422


def test_cors_allows_dashboard_only(client):
    ok = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"
    bad = client.get("/api/health", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in bad.headers
