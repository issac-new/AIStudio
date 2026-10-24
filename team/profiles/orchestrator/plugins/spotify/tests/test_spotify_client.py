"""Spotify Web API client: 401 retry, empty-204 payloads, URI normalisation, auth error wrapping.

Moved from hermes-agent core ``tests/tools/test_spotify_client.py``.
"""

from __future__ import annotations

import json

import pytest

from hermes_cli.auth_constants import AuthError
from spotify_plugin import spotify_client as spotify_mod


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict | None = None, *, text: str = "", headers: dict | None = None):
        self.status_code = status_code
        self._payload = payload
        self.text = text or (json.dumps(payload) if payload is not None else "")
        self.headers = headers or {"content-type": "application/json"}
        self.content = self.text.encode("utf-8") if self.text else b""

    def json(self):
        if self._payload is None:
            raise ValueError("no json")
        return self._payload


def test_client_retries_once_after_401(monkeypatch):
    calls: list[str] = []
    tokens = iter([{"access_token": "token-1", "base_url": "https://api.spotify.com/v1"},
                   {"access_token": "token-2", "base_url": "https://api.spotify.com/v1"}])
    monkeypatch.setattr(spotify_mod, "resolve_runtime_credentials", lambda **kwargs: next(tokens))

    def fake_request(method, url, headers=None, params=None, json=None, timeout=None):
        calls.append(headers["Authorization"])
        if len(calls) == 1:
            return _FakeResponse(401, {"error": {"message": "expired token"}})
        return _FakeResponse(200, {"devices": [{"id": "dev-1"}]})

    monkeypatch.setattr(spotify_mod.httpx, "request", fake_request)
    payload = spotify_mod.SpotifyClient().request("GET", "/me/player/devices")
    assert payload["devices"][0]["id"] == "dev-1"
    assert calls == ["Bearer token-1", "Bearer token-2"]


def test_normalize_spotify_uri_accepts_urls():
    uri = spotify_mod.normalize_spotify_uri("https://open.spotify.com/track/7ouMYWpwJ422jRcDASZB7P", "track")
    assert uri == "spotify:track:7ouMYWpwJ422jRcDASZB7P"


def test_get_currently_playing_returns_explanatory_empty_payload(monkeypatch):
    monkeypatch.setattr(spotify_mod, "resolve_runtime_credentials",
                        lambda **kwargs: {"access_token": "token-1", "base_url": "https://api.spotify.com/v1"})
    monkeypatch.setattr(spotify_mod.httpx, "request", lambda *a, **k: _FakeResponse(204, None, text=""))
    assert spotify_mod.SpotifyClient().get_currently_playing() == {
        "status_code": 204, "empty": True,
        "message": "Spotify is not currently playing anything. Start playback in Spotify and try again.",
    }


def test_client_wraps_invalid_grant_as_auth_required_error(monkeypatch):
    def _raise_invalid_grant(**kwargs):
        raise AuthError("Spotify refresh token has expired or was revoked.", provider="spotify",
                        code="spotify_refresh_invalid_grant", relogin_required=True)

    monkeypatch.setattr(spotify_mod, "resolve_runtime_credentials", _raise_invalid_grant)
    with pytest.raises(spotify_mod.SpotifyAuthRequiredError, match="expired or was revoked"):
        spotify_mod.SpotifyClient()
