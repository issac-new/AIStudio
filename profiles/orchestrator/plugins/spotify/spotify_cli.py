"""``hermes spotify login|status|logout`` (formerly ``hermes auth spotify``)."""

from __future__ import annotations

from . import spotify_auth


def setup_cli(parser) -> None:
    parser.add_argument("action", nargs="?", choices=["login", "status", "logout"], default="login")
    parser.add_argument("--client-id", help="Spotify app client_id (or set HERMES_SPOTIFY_CLIENT_ID)")
    parser.add_argument("--redirect-uri", help="Allow-listed localhost redirect URI for your Spotify app")
    parser.add_argument("--scope", help="Override requested Spotify scopes")
    parser.add_argument("--no-browser", action="store_true", help="Do not attempt to open the browser automatically")
    parser.add_argument("--timeout", type=float, help="Callback/token exchange timeout in seconds")


def _status() -> None:
    status = spotify_auth.auth_status()
    if not status.get("logged_in"):
        print("spotify: logged out")
        return
    print("spotify: logged in")
    for key in ("auth_type", "client_id", "redirect_uri", "scope", "expires_at", "api_base_url"):
        if status.get(key):
            print(f"  {key}: {status[key]}")


def _logout() -> None:
    print("Logged out of Spotify." if spotify_auth.logout() else "No auth state found for Spotify.")


def handle_cli(args) -> None:
    action = getattr(args, "action", None) or "login"
    {"login": lambda: spotify_auth.login(args), "status": _status, "logout": _logout}[action]()
