---
name: aux-fallback-model-routing
title: Auxiliary Vision Fallback Chain Configuration
description: Configure auxiliary.vision fallback_chain setup.
---
# Auxiliary Vision Fallback Chain Configuration

## When to Use
- Configuring multi-model fallback for `auxiliary.vision` (K3 → glm-4.5v)
- Understanding why 401 auth errors don't trigger fallback on explicit providers

## The 401-on-Explicit-Provider Pitfall (Critical)

Hermes `auxiliary_client.py` (line ~9090):
```python
if should_fallback and (is_auto or is_capacity_error):
```
- 401 auth error is NOT a capacity error → `provider: custom` + 401 = no fallback
- Capacity errors (402/429/connection) WILL trigger fallback_chain

## Working Configuration
```yaml
auxiliary:
  vision:
    provider: custom
    model: k3
    base_url: https://api.kimi.com/coding
    api_key: <kimi_token>
    api_mode: anthropic_messages  # prevents OpenAI SDK rewrite of /anthropic → /paas/v4
    timeout: 120
    download_timeout: 30
    fallback_chain:
      - provider: custom
        model: glm-4.5v
        base_url: https://open.bigmodel.cn/api/anthropic
        api_key: <bigmodel_token>
        api_mode: anthropic_messages
        timeout: 120
```

## The `same_credential_surface` Trap
When both entries use `provider: custom`, Hermes skips the fallback entry (same credential surface).
Fix: register named `custom_providers` (e.g. `kimi-vision`, `bigmodel-vision`).

## See Also
- `references/bigmodel-endpoint-matrix.md` — BigModel endpoint details + K3 vision quirks
