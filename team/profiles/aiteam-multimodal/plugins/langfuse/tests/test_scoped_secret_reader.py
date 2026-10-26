"""``_secret`` honours the secret-scope contract.

It used to catch ``UnscopedSecretError`` and fall back to ``os.environ``. Under multiplex ``os.environ``
is the DEFAULT profile's ``.env``, so that fallback shipped another profile's credentials or hid the
spawn-site bug the exception exists to surface. Contract: scope wins over environ; no scope while
multiplexing raises.
"""
from __future__ import annotations

import pytest

from agent import secret_scope
from langfuse_plugin import _secret


@pytest.fixture
def multiplex():
    secret_scope.set_multiplex_active(True)
    try:
        yield
    finally:
        secret_scope.set_multiplex_active(False)


def test_scoped_read_prefers_profile_scope_over_default_environ(monkeypatch, multiplex):
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "default-profile-value")
    token = secret_scope.set_secret_scope({"LANGFUSE_SECRET_KEY": " profile-b-value "})
    try:
        assert _secret("LANGFUSE_SECRET_KEY") == "profile-b-value"
    finally:
        secret_scope.reset_secret_scope(token)


def test_scopeless_multiplex_read_fails_loud(monkeypatch, multiplex):
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "default-profile-value")
    token = secret_scope.set_secret_scope(None)
    try:
        with pytest.raises(secret_scope.UnscopedSecretError):
            _secret("LANGFUSE_SECRET_KEY")
    finally:
        secret_scope.reset_secret_scope(token)
