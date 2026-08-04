# Dashboard Binding Debug Reference

## Symptom

`hermes dashboard --host 0.0.0.0 --insecure` is running but only responds on `127.0.0.1:9119`, not on the container's IP or hostname.

## Diagnosis Flow

### 1. Check what's actually listening

```bash
# Inside the container:
cat /proc/net/tcp | grep "239F"  # 9119 = 0x239F hex
```

The first hex column is the local address in big-endian hex:
- `0100007F:239F` = `127.0.0.1:9119` (loopback only)
- `00000000:239F` = `0.0.0.0:9119` (all interfaces)

### 2. Find which PID owns the socket

```bash
# Get the inode from /proc/net/tcp (10th field)
INODE=$(cat /proc/net/tcp | grep "239F" | head -1 | awk '{print $10}')

# Find the PID using that inode
for pid in /proc/[0-9]*/fd/*; do
    link=$(readlink $pid 2>/dev/null)
    if echo "$link" | grep -q "socket:[$INODE]"; then
        pid=$(echo $pid | cut -d/ -f3)
        echo "PID $pid: $(cat /proc/$pid/cmdline 2>/dev/null | tr '\0' ' ')"
    fi
done
```

### 3. Test binding from inside container

```bash
# Quick checks
curl -s http://127.0.0.1:9119/          # Loopback
curl -s http://$(hostname):9119/         # Container hostname
curl -s http://$(hostname -i):9119/      # Container IP
```

- If only `127.0.0.1` works → bound to loopback only
- If all three work → bound to `0.0.0.0`

### 4. Check if `hermes dashboard --stop` works

```bash
hermes dashboard --stop
# If it says "No hermes dashboard processes running" but
# port 9119 is still listening, the process was started via
# nohup+disown and is invisible to the stop command.
```

## Root Cause

When the entrypoint runs:

```bash
nohup hermes dashboard --host 0.0.0.0 --insecure > /tmp/dash.log 2>&1 &
disown
exec hermes gateway run
```

1. The nohup'd process typically becomes **PID 8** (early in container boot)
2. It binds to `127.0.0.1:9119` (the flags fail silently if the port was already in use from a previous run's persisted data, or if the child web server process loses the flags during spawn)
3. `hermes dashboard --stop` cannot find PID 8 because it wasn't registered via `hermes dashboard register`
4. Any subsequent `hermes dashboard --host 0.0.0.0 --insecure` gets **"address already in use"** because PID 8 holds the port

## Fix

Kill PID 8 explicitly before starting the dashboard:

```bash
for pid in 8 9 10; do kill $pid 2>/dev/null || true; done
sleep 1
nohup hermes dashboard --host 0.0.0.0 --insecure > /tmp/dash.log 2>&1 &
disown
```

## Verification

After starting the dashboard with the fix:

```bash
# From inside container:
curl -s http://127.0.0.1:9119/          # Should be 200
curl -s http://$(hostname):9119/        # Should be 200 (confirms 0.0.0.0 bind)
curl -s http://$(hostname -i):9119/     # Should be 200 (confirms 0.0.0.0 bind)

# From host:
curl -s http://localhost:9123/          # Docker port mapping should also work
```
