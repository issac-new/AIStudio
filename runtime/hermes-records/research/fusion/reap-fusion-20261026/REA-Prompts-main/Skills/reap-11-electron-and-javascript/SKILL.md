---
name: reap-11-electron-and-javascript
description: REA prompt pack:  Electron & JavaScript (11 ready-to-paste prompts). Use when doing reverse-engineering investigation of electron & javascript with REA (rea.tools) via an AI coding agent.
---

# REAP — 11. Electron & JavaScript

Part of REAP (REA Investigation Prompts). Replace everything in <angle brackets>; keep each request focused on one feature. Demand file/function/address evidence and separate facts from hypotheses.

### Electron app anatomy

```text
Use REA to analyze <PATH TO ELECTRON APP>.

Locate the JavaScript files and any app.asar archives. Map the main and
renderer processes, the preload scripts and the IPC channels.

Then trace <FEATURE> from the UI to its implementation, including network
calls and filesystem operations. Show the evidence.
```

### IPC & contextIsolation security review

```text
Use REA on <Electron app>. Enumerate every ipcMain handler and the channels
exposed via contextBridge/preload. For each channel: what arguments it
accepts, whether it reaches shell.openExternal, child_process, fs, or webview
navigation, and what validation exists. Flag any handler where renderer-
controlled input reaches a privileged sink without checks — with file and
function evidence.
```

### Minified / bundled JS feature tracing

```text
Use REA on <app.asar / bundle.js> to trace <FEATURE> through minified code.
Identify the module boundaries, recover the relevant functions with readable
names, follow the data flow from the UI event to the network/filesystem
effect, and produce a call graph. Cite offsets in the bundle for each hop.
```

### Web feature mapping

```text
Use REA to observe <site> while I use <feature>. List the requests, scripts
and state changes involved, then summarise how the feature works and which
parts run on the client versus the server.
```

### Website clone (structure + behavior)

```text
Use REA to inspect https://<site>/. Recover the page structure, the client
routes, the API calls each view makes and the state management pattern.
Rebuild a functional equivalent with my own assets and styling, matching the
observed behavior. List requests and scripts as evidence per view.
```

### Web app API-surface mapping

```text
Use REA on <web app URL> (authorized testing of an app I own or am permitted
to assess). Enumerate the client's full API surface: every endpoint the
bundled JavaScript calls, HTTP method, request/response shape, auth header or
token source, and where in the bundle each call is made (file + offset).
Group endpoints by feature and flag any that are called from the client but
validated only client-side. Separate endpoints proven in code from ones only
seen in traffic.
```

### Source-map & bundle recovery

```text
Use REA on <web app>. Check for exposed source maps (.map references in the
bundles or 404-then-200 probing of known paths). If maps exist, reconstruct
the original module tree, name the components/functions and map the recovered
sources to the shipped bundles. If they don't, de-minify the hot modules for
<FEATURE> by hand: rename locals, split the bundle into logical modules and
produce a readable equivalent. State clearly which names are recovered from
maps versus inferred.
```

### Auth & token flow analysis (web)

```text
Use REA on <web app> to document its authentication flow end to end: where
the login form posts, how tokens are stored (cookie flags HttpOnly/Secure/
SameSite, localStorage, IndexedDB), refresh/renewal logic in the client code,
and which requests attach the token and how. Give the bundle offset proving
each step. Flag client-side-only authorization checks (UI gating without
server validation) as hypotheses to confirm with controlled requests.
```

### WASM module inside a web app

```text
Use REA on <web app / .wasm module>. Identify the toolchain that produced the
WASM (Emscripten, Rust/wasm-bindgen, Go/WASM), map the exported functions and
their JS callers, recover the linear-memory layout and any embedded strings or
data tables. For <FEATURE>, trace the JS→WASM boundary: arguments crossing,
return values and side effects. Cite export indices and JS call-site offsets.
```

### Browser extension (MV3) audit

```text
Use REA on <extension folder / .crx> I own or am authorized to review.
Enumerate manifest permissions, service worker and content-script entry
points, every host the extension can reach, message-passing channels between
content script / worker / page, and any remote code loading (eval, dynamic
script injection, update endpoints). Map each capability to the file and
function that implements it. Distinguish declared permissions from observed
behavior.
```

### PWA / service-worker offline logic

```text
Use REA on <web app> to recover the service worker's behavior: cache strategy
per resource class (cache-first, network-first, stale-while-revalidate), what
data persists offline (IndexedDB stores and their schemas from the code), and
how queued actions sync when connectivity returns. Show the worker file and
the functions proving each rule.
```

---
