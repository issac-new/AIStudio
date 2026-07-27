# Headless Matplotlib Troubleshooting

## Common Errors and Fixes

### Error: `UserWarning: Glyph X missing from font(s)`
**Cause**: Font doesn't support emoji or special Unicode characters.
**Fix**: Replace emoji with ASCII fallbacks. See SKILL.md emoji table.

### Error: `TclError: no display name and no $DISPLAY environment variable`
**Cause**: Using default backend that requires X11 display.
**Fix**: Set backend before importing pyplot:
```python
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
```

### Error: Process hangs at `plt.show()`
**Cause**: `plt.show()` opens GUI window in non-interactive environment.
**Fix**: Replace with `plt.savefig()` + `plt.close('all')`.

### Error: MemoryError during batch plotting
**Cause**: Figures not closed, accumulating in memory.
**Fix**: Call `plt.close('all')` after each `plt.savefig()`.

### Error: `RuntimeError: Invalid DISPLAY variable`
**Cause**: SSH session without X11 forwarding, or container without display.
**Fix**: Same as TclError — set `matplotlib.use('Agg')`.

## Environment Detection

```python
import os

# Detect if running in headless/agent environment
is_headless = any([
    os.environ.get('HERMES_KANBAN_TASK'),  # Hermes worker
    os.environ.get('CI'),                  # CI/CD pipeline
    os.environ.get('DISPLAY') is None,    # No X11
    not os.environ.get('TERM'),            # No terminal
])

if is_headless:
    import matplotlib
    matplotlib.use('Agg')
```

## Font Cache Warnings

On first run, matplotlib builds font cache:
```
Matplotlib is building the font cache; this may take a moment.
```
This is normal and only happens once. In containers, consider pre-building:
```bash
python -c "import matplotlib.pyplot as plt; plt.figure(); plt.close()"
```
