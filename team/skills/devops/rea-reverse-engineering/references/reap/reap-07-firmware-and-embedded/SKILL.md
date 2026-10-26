---
name: reap-07-firmware-and-embedded
description: REA prompt pack:  Firmware & embedded (3 ready-to-paste prompts). Use when doing reverse-engineering investigation of firmware & embedded with REA (rea.tools) via an AI coding agent.
---

# REAP — 7. Firmware & embedded

Part of REAP (REA Investigation Prompts). Replace everything in <angle brackets>; keep each request focused on one feature. Demand file/function/address evidence and separate facts from hypotheses.

### Firmware image triage

```text
Use REA to analyze <firmware image / bin / img>.

Identify the container format, extract partitions/filesystems (JFFS2, SquashFS,
UBI, cramfs...), map each region to architecture and load address, locate the
kernel and rootfs, and list boot entries, init scripts and services.

Show offsets, entropy observations and the evidence for every claim. Start
with static analysis; do not flash or run anything.
```

### MCU / IoT binary analysis

```text
Use REA on <firmware blob> for a <ARM Cortex-M / MIPS / AVR / ESP32> target.

Find the vector table and reset handler, reconstruct the memory map from
literal pools and peripheral base addresses, identify the RTOS (FreeRTOS,
Zephyr...) from symbol/string fingerprints, and map the main task loop and
peripheral drivers (UART, SPI, I2C, radio stack) with function addresses.
```

### Embedded protocol & update mechanism

```text
Use REA on <firmware> to recover: the network stack usage (hardcoded IPs,
DNS, MQTT/HTTP endpoints, ports), the OTA update path (download URL, signature
check, flash write), and credential material (keys, default passwords, debug
tokens). For each finding give the function/address and say whether the
behavior is confirmed statically or still a hypothesis.
```

---
