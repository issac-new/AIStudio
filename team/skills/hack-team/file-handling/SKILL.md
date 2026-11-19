---
name: file-handling
description: "文件与路径安全专项 — 任意文件上传getshell/路径穿越/任意文件读写删除/LFI-RFI/Zip Slip/CSV·公式注入/ImageMagick·FFmpeg攻击/二次渲染。当目标存在文件上传(头像/附件/证件)、下载导出、导入(Excel/CSV/XML)、预览(PDF/Office)、图片音视频处理、压缩包解压打包、在线编辑器/终端等功能时调用。"
version: 1.0.1
author: Hermes Agent (ported from zhaji2333/CkSKILLS)
license: MIT
metadata:
  hermes:
    tags: [hack-team, file-upload, path-traversal, lfi, rfi, zip-slip, csv-injection, imagemagick, ffmpeg, web]
    related_skills: [exploit-payload-escalation, deserialization-xxe, redteam-ssrf, security-auditor, scope-gate, poc-evidence-snapshot, fp-check]
    source: "github.com/zhaji2333/CkSKILLS (.agents/skills/file-handling/SKILL.md, 119 行, MIT)"
    fused: "2026-11-09 CK-Fusion T4；2026-11-12 +ActiveStorage 自动分析管线（CVE-2026-126082/126186）v1.0.1"
routing:
  phase: [exploit]
  target_type: [web]
  technologies: [php, java, nginx, apache, imagemagick, ffmpeg, zip, ruby, rails]
  vuln_hints: [lfi, rfi, upload, rce, path-traversal, arbitrary-file-read, zip-slip, csv-injection, active-storage, msl-coder]
  task_types: [file-upload, file-read, file-delete, archive, import]
---

# file-handling — 文件与路径安全专项深度挖掘

> 来源：CK-Skills `file-handling`（github.com/zhaji2333/CkSKILLS，MIT，`.agents/skills/file-handling/SKILL.md` 119 行），
> 2026-11-09 CK-Fusion T4 全文亲读搬运；工具项按本机 2026-11-09 实测状态标注，CK 源互链已按融合报告 §五改写为本机技能名。
> **仅限已授权目标：动手前 scope.txt 已固化并过 `scope-gate`；写入/删除类验证先评估不可逆影响。**

## 何时调用（触发条件）

- 文件上传：头像/附件/证件/导入文件
- 文件下载/导出：报表、日志、备份
- 文件预览/处理：PDF/Office、图片裁剪缩放、音视频处理
- 压缩包处理：在线解压/打包
- 文件路径参数可控：filename、path、file、template
- 在线编辑器/IDE、终端/Shell 模拟、数据库查询工具

## 一、文件操作类场景表（全景）

| 场景 | 漏洞类型 | 挖掘要点 |
|---|---|---|
| 文件上传（头像/附件/证件） | 任意文件上传→getshell | 后缀绕过、MIME绕过、内容检测绕过、二次渲染绕过 |
| 文件下载/导出 | 任意文件读取/路径穿越 | ../遍历、绝对路径、编码绕过、符号链接 |
| 文件预览（PDF/Office） | SSRF/XXE/RCE | 远程URL加载、OLE对象、宏执行 |
| 文件导入（Excel/CSV/XML） | XXE/CSV注入/公式注入/反序列化 | =cmd、外部实体、恶意序列化数据 |
| 图片处理（裁剪/缩放/水印） | ImageMagick RCE/SSRF | MVG/SVG payload、url:协议 |
| 视频/音频处理 | FFmpeg SSRF/文件读取 | concat协议、file://、HLS playlist |
| 压缩包处理（解压/打包） | 路径穿越/Zip Slip/符号链接 | ../覆盖关键文件、软链接读取 |
| 日志下载/审计导出 | 敏感信息泄露/路径穿越 | 日志中含token/密码、文件名可控 |

## 二、漏洞类型全景

| 类型 | 场景 | 挖掘要点 |
|---|---|---|
| F1. 任意文件上传 | 头像、附件、导入 | 类型/扩展名/内容校验 |
| F2. 路径穿越 | 下载接口、模板加载 | `../`规范化检查 |
| F3. 任意文件读取/删除 | 导出报表、缓存处理 | 路径白名单 |
| F4. 文件包含（LFI/RFI） | 动态include | php://filter等协议 |

## 三、文件上传绕过技术

```
扩展名：.php5/.phtml/.phar/.htaccess/.user.ini
双扩展：shell.php.jpg / shell.jpg.php
%00截断：shell.php%00.jpg
内容：GIF89a头、图片马
```

进阶绕过思路：

- MIME 类型伪造（Content-Type 改为 image/png）
- 内容检测绕过：图片马 + 二次渲染差异注入（对比渲染前后保留的字节块，把 payload 藏进保留区）
- 解析差异：nginx 解析漏洞、Apache 多后缀、IIS 分号截断
- 上传点复用：头像路径 → 包含执行 / 路径可控覆盖
- .user.ini / .htaccess 覆盖

> 上传 payload 被 WAF/过滤器拦截时，按 `exploit-payload-escalation` L0-L7 升级（上传类速查见其「分类绕过速查」）；
> 403/路径被封走其「403 绕过专项」与「路径维度：解码时序绕过」。

## 四、路径穿越与任意文件读写

测试向量：

```
../ 、 ..%2f 、 %252e%252e%252f 、 ..%c0%af
绝对路径：/etc/passwd、C:\Windows\win.ini
编码：Unicode（\u002e\u002e/）、十六进制、双重编码
符号链接：上传软链接指向敏感文件
```

验证目标：

- /etc/passwd、/etc/shadow（读权限）
- 应用配置文件（数据库密码、AK/SK）
- 源码文件（.py/.java/.php/.jar）
- 删除接口：任意文件删除 → 配合 getshell/持久化

本机验证（curl 防归一化 + 目录扫描）：

```bash
# --path-as-is 阻止 curl 把 ../ 或 % 编码归一化掉，保留原始穿越语义
curl -ksS --path-as-is -o /dev/null -w '%{http_code}\n' 'https://<授权靶场>/download?file=../../../../etc/passwd'
# 存活目录/备份文件枚举（ffuf 本机已装）
ffuf -u 'https://<授权靶场>/FUZZ' -w <wordlist> -mc 200,301,302,403
```

## 五、文件处理引擎攻击（工具本机化标注）

### ImageMagick

- MVG/SVG payload、`url:` 协议（SSRF）；已知 CVE：ImageTragick 系列
- 本机未装 magick/convert（2026-11-09 实测）→ 攻击面判断走指纹（响应头 X-ImageMagick/报错栈识别版本）+ CVE 对照；
  本地复现须授权后 `brew install imagemagick` 再构造 MSL/MVG 样本

#### 框架自动分析管线：attach 即触发（2026-11 Rails Active Storage 实证）

> 来源：rails/rails 官方通告一手核验（repo advisory API，2026-11-04 发布）。CVE-2026-126082/GHSA-f3w6-w445-fwh9（critical，未授权任意文件写+读）；同批 CVE-2026-126186/GHSA-v924-7rp8-4mxh（high 8.8，扩展名→解码器选择）；同面 2026-07 CVE-2026-66066（libvips 变体处理路径）。

- **触发面范式（关键增量）**：框架在文件 attach 时自动跑分析器——目标应用不需要生成缩略图/预览、不需要显式调用图片处理，**任何上传点即攻击入口**（Active Storage `ImageAnalyzer` 默认 on-attach；SVG→MSL scripting coder 已有一条官方确认完整链，官方明示不排除其他路径）
- **CVE-2026-126082 链**：未授权上传特制文件 → ImageMagick 按文件内容选 coder（非扩展名）→ 文件操作类 coder → 任意文件写；附件用 Disk service 存储时叠加**任意文件读**（`secret_key_base`/`config/credentials.yml.enc` → 会话伪造/RCE/横向移动）
- **命中条件（三同时）**：`config.active_storage.variant_processor = :mini_magick`（`load_defaults 6.1` 及更早默认即中）＋服务器 ImageMagick 策略未拦相关 coder（**Debian/Ubuntu 发行版默认策略不拦**）＋接受不可信上传
- **CVE-2026-126186 链**：tempfile 保留上传扩展名＋content-type 可谎报 → ffprobe/ffmpeg/ImageMagick 按扩展名选解码器；`.avs`（AviSynth）在 `--enable-avisynth` 构建的 ffmpeg 上（ffmpeg.org GPL Windows/Linux 版默认开，发行版/Homebrew 不开）→ 经预览图泄露文件内容或加载攻击者上传的 native 库 → FFmpeg 进程 RCE
- **版本窗口**：activestorage `<8.0.5.2`、`8.1.0.beta1–<8.1.4.1`；8.0 前分支 EOL 无修复；升级须配套 mini_magick ≥5.1（否则启动报错）；修复版经 `MAGICK_CONFIGURE_PATH` 前置 policy.xml 生效，应用若重写 `MiniMagick.cli_env`/`cli_prefix`/`MiniMagick::Shell` 则内置策略失效
- **指纹面**：Rails 目标（`X-Request-Id`/`/rails/active_storage/` 路由）＋任何头像/附件上传点即候选；命中率取决于 variant_processor 配置而非功能可见性
- **审计侧修复基线（policy.xml 最小拦截集，非 Rails 的 ImageMagick 部署同样适用）**：`<policy domain="coder" rights="none" pattern="MSL"/>`、`<policy domain="delegate" rights="none" pattern="gs"/>`、Ghostscript 系 coder（PS/PS2/PS3/EPS*/EPI/EPSF…）、读/删图片外文件的 coder、远程/本地引用 coder、`@filename` 间接引用；注意 ImageMagick 逐个应用搜索路径上所有 policy.xml，宿主存量 allow 规则可覆盖新增 deny
- **通用教训**：对一切「框架/中间件自动解析上传物」的管线（Active Storage、Django 预处理、webhook 转码、邮件附件预览），测试入口前移到**裸上传点**，不要等业务功能调用处理器才下手

### FFmpeg

- `concat` 协议、`file://` 读取；HLS playlist 注入（m3u8 内嵌 file:// 读任意文件）
- 本机已装 ffmpeg ✅ → payload 构造与本地靶验证可直接跑：`ffmpeg -i evil.m3u8`（仅授权靶场）

### Office/PDF 预览

- 宏执行、OLE 对象（RCE）；外部实体（XXE）→ 深挖转 `deserialization-xxe`

### 压缩包

- Zip Slip：解压路径穿越覆盖关键文件
- 符号链接：解压软链接读取任意文件
- Zip 炸弹：DoS
- 本机已装 unzip/zipinfo + python3 zipfile ✅ → 构造 Slip 样本：
  `python3 -c "import zipfile; z=zipfile.ZipFile('evil.zip','w'); z.writestr('../../var/www/html/shell.php','<?php ?>'); z.close()"`

### 导入文件

- CSV 公式注入：`=cmd`、`+HYPERLINK`（导出的 CSV 被 Excel 打开即触发，受害者是运营/管理员）
- XML/Office：XXE → 转 `deserialization-xxe`
- 反序列化对象（.ser/.bin）→ 转 `deserialization-xxe`

## 六、特殊功能类扩展

| 场景 | 漏洞类型 | 挖掘要点 |
|---|---|---|
| 在线解压/打包 | 路径穿越/DoS | Zip炸弹、符号链接攻击 |
| 在线编辑器/IDE | 任意文件读写/RCE | 文件路径可控、代码执行 |
| 终端/Shell模拟 | 命令注入/逃逸 | 命令过滤绕过、沙箱逃逸 |
| 数据库查询工具 | SQL注入/越权 | 查询语句可控、连接信息泄露 |

## 七、验证要点

- 上传：先验证文件落盘与访问路径，再测执行（解析到 Web 目录才可 getshell）
- 下载/导出：filename 参数可控性 → 穿越读取 → 影响面（配置文件/源码）
- 预览/处理：远程 URL 加载 → SSRF/XXE 链（SSRF 链转 `redteam-ssrf`）
- 解压：Zip Slip 覆盖文件（.htaccess/.user.ini/配置）
- 修复优先级：上传 getshell / 任意文件读取为 P0-P1
- 证据链：原始请求+响应、落盘/读取证据、影响面三件套按 `poc-evidence-snapshot` 固化，结论复核过 `fp-check`

## 八、修复建议

- 上传：扩展名+内容白名单、存储与执行目录隔离、随机文件名
- 下载/读取：路径白名单+规范化校验（realpath 比对）
- 解压：拒绝 ../ 与符号链接、限制解压大小与文件数
- 处理引擎：升级补丁、禁用危险协议（url:/concat）
- 导入：禁止公式执行、禁用外部实体

## 红线

1. 仅限授权范围：scope.txt 已固化并过 `scope-gate`；越界目标一律不测
2. getshell 验证最小化：探针文件即时清理，不留持久化 webshell/后门
3. 删除/覆盖类破坏性验证前必须获用户明确批准；读取到的凭据/源码在报告中脱敏，完整值仅存 evidence 目录

## Related Skills

- `exploit-payload-escalation` — 上传/路径绕过被拦时的 L0-L7 升级、403 专项、分类速查
- `deserialization-xxe` — 导入文件/Office 解析触发 XXE 与反序列化的深挖
- `redteam-ssrf` — ImageMagick url: / FFmpeg concat 协议触发的 SSRF 链
- `security-auditor` — 源码审计侧文件操作危险函数定位
- `poc-evidence-snapshot` / `fp-check` — 证据固化与误报复核
