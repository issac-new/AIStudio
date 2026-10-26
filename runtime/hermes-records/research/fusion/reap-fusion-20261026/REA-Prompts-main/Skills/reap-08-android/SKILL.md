---
name: reap-08-android
description: REA prompt pack:  Android (4 ready-to-paste prompts). Use when doing reverse-engineering investigation of android with REA (rea.tools) via an AI coding agent.
---

# REAP — 8. Android

Part of REAP (REA Investigation Prompts). Replace everything in <angle brackets>; keep each request focused on one feature. Demand file/function/address evidence and separate facts from hypotheses.

### Audit an APK

```text
Use REA to analyze <PATH TO APK>.

List declared permissions, exported components, analytics/tracking SDKs,
domains found and local storage mechanisms.

For each finding, show the corresponding class, method or file.

Distinguish references present in the code from behaviors actually observed.
Do not conclude that a domain is accessed just because it appears in a string.
```

### Trace a feature through Java/Kotlin and native code

```text
Use REA on <APK> to trace <FEATURE> end to end: UI entry point (Activity/
Fragment/Composable), the Java/Kotlin call chain, any JNI boundaries
(RegisterNatives / native library loads), the .so functions involved, and the
final effect (network call, file write, database row). Show class, method and
offset evidence at every hop.
```

### Storage, crypto and secrets review

```text
Use REA on <APK>. Determine how the app stores <data>: SharedPreferences,
SQLite, files, keystore. Recover any embedded crypto (hardcoded keys/IVs,
obfuscation routines) with the class/method that uses them. State whether
data is encrypted at rest and in transit, with evidence, and list concrete
risks.
```

### Obfuscated / packed app triage

```text
Use REA on <APK> that appears obfuscated or packed. Identify the packer or
protector (string/class fingerprints, loader stub in the native libs), map
what is statically visible vs. deferred to runtime, and propose the minimal
safe steps to reach the real dex/native code for analysis.
```

---
