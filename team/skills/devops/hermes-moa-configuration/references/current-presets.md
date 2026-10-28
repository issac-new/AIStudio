# Current MoA presets (2026-09-30)

Profile: orchestrator → `~/.hermes/profiles/orchestrator/config.yaml`

## Preset `heavy` (default, active_preset off = on-demand)

```yaml
moa:
  presets:
    heavy:
      aggregator:
        model: glm-5.3-flash
        provider: custom:moa-mglm
        reasoning_effort: none   # blocks global-ultra budget-8000 injection; bigmodel unset-default = max
      degraded_reference_policy: loud
      fanout: user_turn
      reference_models:
        - enabled: true
          model: glm-5.3
          provider: custom:moa-mglm
        - enabled: true
          model: k3
          provider: custom:moa-mk256
          reasoning_effort: max   # official adaptive max; GLM/MiMo slots stay UNSET (vendor default = max)
        - enabled: true
          model: mimo-v2.6-pro
          provider: custom:moa-mimo
  default_preset: heavy
  active_preset: ""
```

## Direct providers (bypass cc-switch for reference fan-out)

| name | upstream | base_url | api_mode | model |
|------|----------|----------|----------|-------|
| moa-mglm | MGLM bigmodel | https://open.bigmodel.cn/api/anthropic | anthropic_messages | glm-5.3, glm-5.3-flash (aggregator) |
| moa-mk256 | MK256 kimi coding | https://api.kimi.com/coding | anthropic_messages | k3 |
| moa-mimo | MiMo token-plan | https://token-plan-cn.xiaomimimo.com/anthropic | anthropic_messages | mimo-v2.6-pro |
| moa-stepfun | StepFun step_plan | https://api.stepfun.com/step_plan | anthropic_messages | step-5-preview |
| moa-minimax | MiniMax anthropic | https://api.minimax.cn/anthropic | anthropic_messages | MiniMax-M3 |

Keys are NOT stored in this reference (secrets stay in config.yaml only; this file is documentation).

## Pending additions (wires token-verified direct; preset slots NOT yet applied)

StepFun and MiniMax rows above are 200-verified direct wires (StepFun returned a thinking block; MiniMax-M3 a direct answer — M3 thinking defaults OFF without `adaptive`). The 5-slot heavy preset (both as references) was prepared but the config write had NOT landed when this was captured: the whole `moa:` section had been washed out of the profile config and restore was in progress. After applying, re-verify with `hermes moa list` + `参考 N/5` E2E, then update this file to drop the pending note.

## E2E verification (2026-09-30, all-anthropic direct ruling)

`hermes chat -q "用一句话说明什么是复利" -m moa:heavy --cli -v` → 参考 1/3 (glm-5.3), 2/3 (k3), 3/3 (mimo-v2.6-pro) all valid; aggregator glm-5.3-flash via bigmodel anthropic wire (transcript context limit 1,003,520 = moa-mglm entry); 26s total. No MoA slot routes through cc-switch.
