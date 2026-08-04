---
name: moa-bigmodel-401-fix
description: Fix MoA 401 on BigModel when SDK fails but curl works.
---

# MoA BigModel 401 Fix

## Symptom
MoA aggregator with `moa-bigmodel` provider (open.bigmodel.cn/api/anthropic, anthropic_messages mode) returns `HTTP 401: 令牌已过期或验证不正确`, while the same token + URL works via curl/x-api-key header.

## Root Cause
The Anthropic Python SDK fills `api_key` from the `ANTHROPIC_API_KEY` env var even on the regular-API-key branch of `build_anthropic_client`. This produces **dual auth**: both `x-api-key` and `Authorization: Bearer <token>` headers on every request.

BigModel's server validates `Authorization` first and rejects the token because BigModel tokens are not valid JWT/Bearer tokens — they only authenticate via `x-api-key`.

## Fix
In `~/.hermes/hermes-agent/agent/anthropic_adapter.py`, `build_anthropic_client()`, add a BigModel-specific httpx request hook that strips the `Authorization` header:

```python
# After the regular-API-key branch (kwargs["api_key"] = api_key)
_is_bigmodel = bool(normalized_base_url and "open.bigmodel.cn" in normalized_base_url)
if _is_bigmodel and _anthropic_sdk:
    from httpx import Client as _HttpxClient
    def _strip_bigmodel_auth(request):
        for k in list(request.headers.keys()):
            if k.lower() == "authorization":
                del request.headers[k]
    _existing_http = kwargs.get("http_client")
    if isinstance(_existing_http, _HttpxClient):
        _hooks = list(getattr(_existing_http, "event_hooks", {}).get("request", []))
        _hooks.append(_strip_bigmodel_auth)
        _existing_http.event_hooks["request"] = _hooks
    else:
        kwargs["http_client"] = _HttpxClient(
            event_hooks={"request": [_strip_bigmodel_auth]},
            timeout=Timeout(timeout=float(_read_timeout), connect=10.0),
        )
```

## Diagnostic Confirmation
1. curl with `x-api-key` → 200 OK
2. anthropic SDK → 401
3. anthropic SDK + httpx event hook stripping `authorization` header → **200 OK**

## Verification
```bash
hermes chat -q "What is 7*8?" -m 'moa:complex' --no-restore-cwd --cli
hermes chat -q "What is 7*8?" -m 'moa:ultra' --no-restore-cwd --cli
```

## Related Patches (applied together)
1. `agent/auxiliary_client.py` `_to_openai_base_url()`: added `api_mode` param, skip URL rewrite when `api_mode=anthropic_messages`
2. `agent/auxiliary_client.py` `_maybe_wrap_anthropic()`: revert ZAI `/api/paas/v4` → `/api/anthropic` when `api_mode=anthropic_messages`
3. `agent/anthropic_adapter.py` `build_anthropic_client()`: strip Authorization header for bigmodel endpoints (THIS FIX)
