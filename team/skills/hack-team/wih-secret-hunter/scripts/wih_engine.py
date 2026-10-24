#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
WIH Secret Hunter — 纯 Python Web 敏感信息提取引擎（自包含单文件版）

来源: ARL-Next (https://github.com/owl234/ARL-Next) backend/app/services/wih/ — GPL-3.0
移植: 2026-09-08, Hermes hack-team 融合（open-source-skill-fusion-v2 流程）
剥离: MongoDB(WihRecord 内联化) / Celery 队列 / app.Config → CLI 参数 / ContextAware 线程池 → stdlib
保留: 4 级瀑布 chunk 解析(HTML→Webpack/Vite/Next.js) / FNV-1a 按站点去重 /
      风险三级分级 / exclude_rules 反误报 / 零依赖 YAML fallback 解析器
依赖: requests（其余全部标准库；PyYAML 可选，缺失时自动 fallback）

用法:
  python3 wih_engine.py --sites https://target.example.com [--rule-file wih_rules.yml]
      [--max-chunks 50] [--concurrency 6] [--timeout 15] [--proxy http://127.0.0.1:8080]
      [--output findings.json] [--min-risk CRITICAL]

纪律: 仅用于授权范围内目标（配合 _shared/constraint-policy.md scope 门）。
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any, Dict, List, Optional, Set, Tuple
from urllib.parse import urljoin, urlparse

try:
    import requests
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
except ImportError:
    print("[!] 缺少 requests: pip install requests", file=sys.stderr)
    sys.exit(2)

try:
    import yaml
except ImportError:
    yaml = None  # 零依赖 fallback 解析器兜底

logger = logging.getLogger("wih-secret-hunter")

# ─────────────────────────────────────────────────────────────────────────────
# §1 安全限制（防 OOM / 无限循环 / WAF 封锁）— 对齐源 hunter.py:33-37
# ─────────────────────────────────────────────────────────────────────────────
MAX_JS_SIZE = 5 * 1024 * 1024       # 单 JS 上限 5MB
MAX_CHUNKS_PER_SITE = 200           # 每站点动态 chunk 配额
CHUNK_CONSECUTIVE_ERRORS_LIMIT = 5  # 连续 5 次 404/403 即停
DEFAULT_TIMEOUT = (5.0, 15.0)       # (connect, read)

# ─────────────────────────────────────────────────────────────────────────────
# §2 FNV-1a 64-bit 哈希 — 对齐源 fnv1a.py（与 Go hash/fnv 位对齐）
# ─────────────────────────────────────────────────────────────────────────────
FNV_OFFSET_64 = 14695981039346656037
FNV_PRIME_64 = 1099511628211
MASK_64 = 0xFFFFFFFFFFFFFFFF


def fnv1a_64(data) -> str:
    """仅用于敏感内容（几十~几百字符）去重，勿对 MB 级文本调用。"""
    if isinstance(data, str):
        data = data.encode("utf-8", errors="replace")
    h = FNV_OFFSET_64
    for b in data:
        h = ((h ^ b) * FNV_PRIME_64) & MASK_64
    return str(h)


# ─────────────────────────────────────────────────────────────────────────────
# §3 记录模型（Mongo WihRecord 内联化）— 对齐源 wihRecord.py
# ─────────────────────────────────────────────────────────────────────────────
HIGH_RISK_TYPES = {
    "secret_key", "access_key", "access_token", "wechat_corpid", "wechat_appid",
    "jwt", "ak_sk", "password", "private_key", "api_key", "aliyun_ak", "tencent_ak",
    "aws_ak", "ssh_key", "token", "app_secret", "corp_secret"
}
MEDIUM_RISK_TYPES = {
    "api_path", "api_route", "internal_ip", "id_card", "phone", "auth_url", "internal_domain"
}


class WihRecord:
    """敏感信息记录：fnv_hash+site 联合去重（跨域同文件不误去重）。"""

    def __init__(self, record_type: str, content: str, source: str, site: str, fnv_hash):
        self.recordType = record_type
        self.content = content
        self.source = source
        self.site = site
        self.fnv_hash = str(fnv_hash) if fnv_hash else ""

    @property
    def risk_level(self) -> str:
        rtype = str(self.recordType).lower()
        if rtype in HIGH_RISK_TYPES or any(
            k in rtype for k in ["secret", "token", "appid", "corpid", "key", "jwt", "pass"]
        ):
            return "CRITICAL"
        elif rtype in MEDIUM_RISK_TYPES or any(k in rtype for k in ["api", "ip", "auth"]):
            return "MEDIUM"
        return "LOW"

    def __eq__(self, other):
        return self.fnv_hash == other.fnv_hash and self.site == other.site

    def __hash__(self):
        return hash((self.fnv_hash, self.site))

    def to_dict(self) -> dict:
        return {
            "record_type": self.recordType,
            "content": self.content,
            "site": self.site,
            "source": self.source,
            "fnv_hash": self.fnv_hash,
            "risk_level": self.risk_level,
        }


# ─────────────────────────────────────────────────────────────────────────────
# §4 规则引擎 — 对齐源 rule_engine.py
# ─────────────────────────────────────────────────────────────────────────────
DEFAULT_IGNORED_DOMAINS = {
    "w3.org", "www.w3.org", "schema.org", "github.com", "google.com",
    "googleapis.com", "gstatic.com", "baidu.com", "qq.com", "taobao.com",
    "alipay.com", "jsdelivr.net", "unpkg.com", "cdnjs.cloudflare.com",
    "ampproject.org", "apache.org", "mozilla.org", "facebook.com", "twitter.com",
    "google-analytics.com", "googletagmanager.com", "sentry.io", "doubleclick.net",
    "cloudflare.com", "fastly.net", "bootcss.com", "staticfile.org"
}

IGNORED_DOMAIN_EXTS = {
    ".js", ".css", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".ico",
    ".woff", ".woff2", ".ttf", ".eot", ".otf", ".map", ".json", ".xml",
    ".html", ".htm", ".mp4", ".mp3", ".webm", ".wasm", ".zip", ".tar", ".gz"
}

BUILTIN_DOMAIN_PATTERN = re.compile(
    r'\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+'
    r'(?:com|cn|org|net|edu|gov|io|co|cc|me|top|xyz|vip|ltd|site|tech|online|store|pro|club|fun|link|app|dev|cloud|ai|so|tv|la|us|uk|hk|tw|jp|de|fr|info|biz|icu|xin|wang|ren|pub|mobi|asia)\b',
    re.IGNORECASE
)

BUILTIN_SECRET_KEY_PATTERN = re.compile(
    r'(?i)(?:secret_?key|app_?secret|access_?secret|api_?secret|secret_?token|client_?secret|app_?key|private_?key)'
    r'\s*[:=]\s*[\'\"]([a-zA-Z0-9_\-]{20,80})[\'\"]'
)


class ExcludeRuleMatcher:
    """exclude_rules 反误报过滤器：target/content/source/source_tag 四维匹配。"""

    def __init__(self, rule_dict: dict):
        self.name = rule_dict.get("name", "")
        self.enabled = rule_dict.get("enabled", True)
        self.rule_id = rule_dict.get("id")
        self.target_pattern = self._compile(rule_dict.get("target"))
        self.content_pattern = self._compile(rule_dict.get("content"))
        self.source_pattern = self._compile(rule_dict.get("source"))
        self.source_tag = rule_dict.get("source_tag")

    @staticmethod
    def _compile(val: Optional[str]):
        if not val:
            return None
        if isinstance(val, str) and val.startswith("regex:"):
            try:
                return re.compile(val[len("regex:"):], re.IGNORECASE)
            except Exception as e:
                logger.warning(f"Invalid exclude rule regex {val}: {e}")
                return None
        return val

    def matches(self, record_type: str, content: str, target_site: str,
                source_url: str, source_tag: str = "") -> bool:
        if not self.enabled:
            return False
        if self.rule_id and self.rule_id != record_type:
            return False
        for pattern, value in (
            (self.target_pattern, target_site),
            (self.content_pattern, content),
            (self.source_pattern, source_url),
        ):
            if pattern is None:
                continue
            if isinstance(pattern, re.Pattern):
                if not pattern.search(value):
                    return False
            elif isinstance(pattern, str):
                if pattern not in value:
                    return False
        if self.source_tag and self.source_tag != source_tag:
            return False
        return True


class WihRuleEngine:
    """线程安全预编译规则引擎；YAML 缺失时回退内置最小规则集。"""

    def __init__(self, rule_yaml_path: Optional[str] = None):
        self.rule_path = rule_yaml_path or os.path.join(os.path.dirname(os.path.abspath(__file__)), "wih_rules.yml")
        self.rules: List[Dict[str, Any]] = []
        self.exclude_rules: List[ExcludeRuleMatcher] = []
        self.load_rules()

    @staticmethod
    def _parse_yaml_fallback(content: str) -> dict:
        """PyYAML 缺失时的零依赖轻量解析器（仅支持 wih_rules.yml 扁平结构）。"""
        result = {"rules": [], "exclude_rules": []}
        current_section = None
        current_item = {}
        for line in content.splitlines():
            line_str = line.strip()
            if not line_str or line_str.startswith("#"):
                continue
            if line_str.startswith("rules:"):
                current_section = "rules"
                continue
            elif line_str.startswith("exclude_rules:"):
                if current_item and current_section:
                    result[current_section].append(current_item)
                    current_item = {}
                current_section = "exclude_rules"
                continue
            if line_str.startswith("-"):
                if current_item and current_section:
                    result[current_section].append(current_item)
                current_item = {}
                line_str = line_str[1:].strip()
            if ":" in line_str:
                parts = line_str.split(":", 1)
                k = parts[0].strip()
                val_raw = parts[1].strip()
                if val_raw.startswith('"'):
                    end_q = val_raw.rfind('"')
                    if end_q > 0:
                        val_raw = val_raw[1:end_q]
                elif val_raw.startswith("'"):
                    end_q = val_raw.rfind("'")
                    if end_q > 0:
                        val_raw = val_raw[1:end_q]
                else:
                    if "#" in val_raw:
                        val_raw = val_raw.split("#", 1)[0].strip()
                    val_raw = val_raw.strip('\'"')
                v = val_raw
                if isinstance(v, str):
                    if v.lower() == "true":
                        v = True
                    elif v.lower() == "false":
                        v = False
                current_item[k] = v
        if current_item and current_section:
            result[current_section].append(current_item)
        return result

    def load_rules(self):
        self.rules.clear()
        self.exclude_rules.clear()
        if not os.path.exists(self.rule_path):
            logger.warning(f"WIH rule path not found: {self.rule_path}, using built-in defaults")
            self._load_default_fallback_rules()
            return
        try:
            with open(self.rule_path, "r", encoding="utf-8") as f:
                content = f.read()
            data = (yaml.safe_load(content) or {}) if yaml is not None else self._parse_yaml_fallback(content)

            for r in data.get("rules", []):
                if not r.get("enabled", False):
                    continue
                rule_id = r.get("id", "")
                pattern_str = r.get("pattern", "")
                compiled = None
                if pattern_str:
                    try:
                        compiled = re.compile(pattern_str)
                    except Exception as e:
                        logger.warning(f"Error compiling WIH rule [{rule_id}]: {e}")
                        continue
                self.rules.append({"id": rule_id, "compiled": compiled, "raw_pattern": pattern_str})

            for ex in data.get("exclude_rules", []):
                if ex.get("enabled", True):
                    self.exclude_rules.append(ExcludeRuleMatcher(ex))

            logger.info(f"Loaded {len(self.rules)} active WIH rules, {len(self.exclude_rules)} exclude rules")
        except Exception as e:
            logger.error(f"Failed to load WIH rule YAML {self.rule_path}: {e}")
            self._load_default_fallback_rules()

    def _load_default_fallback_rules(self):
        self.rules.append({"id": "domain", "compiled": None})
        self.rules.append({"id": "secret_key", "compiled": None})
        self.rules.append({"id": "Aliyun_AK_ID", "compiled": re.compile(r"\bLTAI[A-Za-z\d]{12,30}\b")})
        self.rules.append({"id": "QCloud_AK_ID", "compiled": re.compile(r"\bAKID[A-Za-z\d]{13,40}\b")})
        self.rules.append({"id": "jwt_token", "compiled": re.compile(
            r"eyJ[A-Za-z0-9_\-+/]{10,}={0,2}\.[A-Za-z0-9_\-+/]{15,}={0,2}\.[A-Za-z0-9_\-+/]{10,}={0,2}")})

    def is_excluded(self, record_type, content, target_site, source_url, source_tag="") -> bool:
        return any(ex.matches(record_type, content, target_site, source_url, source_tag)
                   for ex in self.exclude_rules)

    def extract_from_text(self, text: str, target_site: str = "", source_url: str = "",
                          source_tag: str = "") -> List[Tuple[str, str]]:
        if not text:
            return []
        results: List[Tuple[str, str]] = []
        seen_matches = set()

        for rule in self.rules:
            rule_id = rule["id"]
            compiled_re = rule.get("compiled")

            if rule_id == "domain":  # 内置域名提取
                for match in BUILTIN_DOMAIN_PATTERN.finditer(text):
                    d = match.group(0)
                    d_clean = d.strip(".").lower()
                    if d_clean.startswith("eyj") or any(d_clean.endswith(ext) for ext in IGNORED_DOMAIN_EXTS):
                        continue
                    if d_clean in DEFAULT_IGNORED_DOMAINS:
                        continue
                    if len(d_clean) < 4 or d_clean.count(".") == 0 or any(len(p) > 63 for p in d_clean.split(".")):
                        continue
                    key = (rule_id, d_clean)
                    if key not in seen_matches and not self.is_excluded(rule_id, d_clean, target_site, source_url, source_tag):
                        seen_matches.add(key)
                        results.append(key)

            elif rule_id == "secret_key":  # 内置 secret_key 键值对提取
                for match in BUILTIN_SECRET_KEY_PATTERN.finditer(text):
                    m_clean = match.group(1).strip() if match.lastindex else match.group(0).strip()
                    if len(m_clean) >= 16:
                        key = (rule_id, m_clean)
                        if key not in seen_matches and not self.is_excluded(rule_id, m_clean, target_site, source_url, source_tag):
                            seen_matches.add(key)
                            results.append(key)

            elif compiled_re:  # 自定义正则规则
                for match in compiled_re.finditer(text):
                    if match.lastindex and match.lastindex >= 1:
                        m_clean = match.group(1).strip()
                    else:
                        m_clean = match.group(0).strip()
                    if not m_clean:
                        continue
                    if rule_id in ("wechat_appid", "wechat_corpid", "wechat_id", "AWS_AK_ID"):
                        m_clean = m_clean.strip('\'" ')
                    key = (rule_id, m_clean)
                    if key not in seen_matches and not self.is_excluded(rule_id, m_clean, target_site, source_url, source_tag):
                        seen_matches.add(key)
                        results.append(key)
        return results


# ─────────────────────────────────────────────────────────────────────────────
# §5 前端 chunk 瀑布解析器 — 对齐源 chunk_parser.py（Tier 1-4）
# ─────────────────────────────────────────────────────────────────────────────
COMMON_VENDOR_SCRIPTS = {
    "vue.js", "vue.min.js", "vue.runtime.min.js",
    "react.js", "react.min.js", "react-dom.js", "react-dom.min.js", "react-dom.production.min.js",
    "jquery.js", "jquery.min.js", "jquery-3.6.0.min.js",
    "lodash.js", "lodash.min.js",
    "axios.js", "axios.min.js",
    "element-ui.js", "element-plus.js", "element-plus.min.js",
    "antd.min.js", "ant-design-vue.min.js",
    "echarts.js", "echarts.min.js",
    "bootstrap.js", "bootstrap.min.js",
    "moment.js", "moment.min.js",
    "core-js.min.js", "regenerator-runtime.js",
    "highlight.min.js", "crypto-js.min.js"
}

WEBPACK_DICT_PATTERN = re.compile(
    r'\{(?:\s*[\'"]?[a-zA-Z0-9_\-]+[\'"]?\s*:\s*\'"[a-zA-Z0-9_\-]*[\'"]\s*,)+'
    r'\s*[\'"]?[a-zA-Z0-9_\-]+[\'"]?\s*:\s*[\'"][a-zA-Z0-9_\-]*[\'"]\s*,?\s*\}'
)
WEBPACK_TERNARY_PATTERN = re.compile(
    r'([a-zA-Z0-9_\-]+)\s*===?\s*[a-zA-Z0-9_$]+\s*\?\s*[\'"]([a-zA-Z0-9_\-]+)[\'"]'
)
VITE_PRELOAD_PATTERN = re.compile(r'__vitePreload\s*\([^\[]*\[([^\]]+)\]')
DYNAMIC_IMPORT_PATTERN = re.compile(r'(?:import|importScripts)\s*\(\s*[\'"]([^\'"]+\.js(?:\?[^\'"]*)?)[\'"]\s*\)')
GENERIC_CHUNK_PATTERN = re.compile(
    r'[\'"]([a-zA-Z0-9_\-/]+\.(?:chunk|bundle|pages|app)?[a-zA-Z0-9_\-]*\.js)[\'"]'
)
WEBPACK_PUBLIC_PATH_PATTERN = re.compile(r'__webpack_require__\.p\s*=\s*[\'"]([^\'"]+)[\'"]')

HTML_SCRIPT_SRC_PATTERN = re.compile(r'<script[^>]+src=(?:[\'"]([^\'"\s>]+)[\'"]|([^\'"\s>]+))', re.IGNORECASE)
HTML_INLINE_SCRIPT_PATTERN = re.compile(r'<script([^>]*)>([\s\S]*?)</script>', re.IGNORECASE)
HTML_LINK_PRELOAD_PATTERN = re.compile(r'<link[^>]+href=(?:[\'"]([^\'"\s>]+)[\'"]|([^\'"\s>]+))[^>]*>', re.IGNORECASE)
HTML_NEXT_DATA_PATTERN = re.compile(r'<script[^>]+id=[\'"]?__NEXT_DATA__[\'"]?[^>]*>([\s\S]*?)</script>', re.IGNORECASE)


class WebpackChunkParser:
    """现代 SPA 深度 chunk 解析器（Webpack 3/4/5 + Vite + Next.js）。"""

    def __init__(self, max_chunks_per_site: int = MAX_CHUNKS_PER_SITE):
        self.max_chunks = max_chunks_per_site

    def extract_from_html(self, html: str, base_url: str) -> Dict[str, Any]:
        """Tier 1: HTML DOM scripts / preload links / Next.js __NEXT_DATA__。"""
        result = {"scripts": set(), "inline_scripts": [], "next_manifest_urls": set()}
        if not html:
            return result
        try:
            for match in HTML_SCRIPT_SRC_PATTERN.finditer(html):
                src = match.group(1) or match.group(2)
                if src:
                    full_url = urljoin(base_url, src.strip())
                    if self._is_valid_script_url(full_url):
                        result["scripts"].add(full_url)

            for match in HTML_INLINE_SCRIPT_PATTERN.finditer(html):
                attrs = match.group(1).lower()
                if "src=" not in attrs:
                    clean_text = match.group(2).strip()
                    if clean_text:
                        result["inline_scripts"].append(clean_text)

            for link_match in HTML_LINK_PRELOAD_PATTERN.finditer(html):
                tag_str = link_match.group(0).lower()
                if "preload" in tag_str or ".js" in tag_str:
                    href = link_match.group(1) or link_match.group(2)
                    if href:
                        href = href.strip()
                        if href.endswith(".js") or "script" in tag_str:
                            full_url = urljoin(base_url, href)
                            if self._is_valid_script_url(full_url):
                                result["scripts"].add(full_url)

            next_match = HTML_NEXT_DATA_PATTERN.search(html)
            if next_match:
                try:
                    next_json_str = next_match.group(1).strip()
                    if next_json_str:
                        next_obj = json.loads(next_json_str)
                        build_id = next_obj.get("buildId")
                        if build_id:
                            m1 = urljoin(base_url, f"/_next/static/{build_id}/_buildManifest.js")
                            m2 = urljoin(base_url, f"/_next/static/{build_id}/_ssgManifest.js")
                            result["next_manifest_urls"].update([m1, m2])
                            result["scripts"].update([m1, m2])
                        page = next_obj.get("page", "")
                        if page and build_id:
                            clean_page = page.lstrip("/")
                            if clean_page:
                                result["scripts"].add(urljoin(base_url, f"/_next/static/chunks/pages/{clean_page}.js"))
                except Exception as e:
                    logger.debug(f"Error parsing Next.js __NEXT_DATA__: {e}")
        except Exception as e:
            logger.warning(f"Error extracting HTML scripts {base_url}: {e}")
        return result

    def extract_chunks_from_js(self, js_code: str, base_script_url: str) -> Set[str]:
        """Tier 2-3: 从 JS 代码提取 Webpack/Vite/Next.js 动态 chunk。"""
        if not js_code or len(js_code) < 50:
            return set()
        chunk_urls: Set[str] = set()
        public_path = self._extract_public_path(js_code, base_script_url)

        def _add(fragments):
            for frag in fragments:
                full_url = urljoin(public_path, frag)
                if self._is_valid_script_url(full_url):
                    chunk_urls.add(full_url)

        _add(self._extract_webpack_dict_chunks(js_code))
        _add(self._extract_webpack_ternary_chunks(js_code))
        _add(self._extract_vite_preload_chunks(js_code))
        _add(self._extract_dynamic_imports(js_code))

        if "_buildManifest.js" in base_script_url:
            for chunk in self._extract_nextjs_build_manifest(js_code):
                full_url = urljoin(base_script_url, chunk)
                if self._is_valid_script_url(full_url):
                    chunk_urls.add(full_url)

        _add(self._extract_generic_chunks(js_code))
        return chunk_urls

    def _extract_public_path(self, js_code: str, fallback_url: str) -> str:
        match = WEBPACK_PUBLIC_PATH_PATTERN.search(js_code)
        if match:
            p = match.group(1).strip()
            if p:
                if not p.endswith("/") and not p.endswith("="):
                    p += "/"
                return urljoin(fallback_url, p)
        parsed = urlparse(fallback_url)
        path = parsed.path
        dir_path = path.rsplit("/", 1)[0] + "/" if "/" in path else "/"
        return f"{parsed.scheme}://{parsed.netloc}{dir_path}"

    @staticmethod
    def _extract_webpack_dict_chunks(js_code: str) -> Set[str]:
        chunks = set()
        # 仅在 webpack 运行时上下文附近提取，避免误匹配 JSON 配置/i18n 键值对
        context_markers = ("__webpack_require__", "chunkId", "installedChunks",
                           "webpackJsonp", "__webpack_modules__", "mini-css")
        if not any(marker in js_code for marker in context_markers):
            return chunks
        for match in WEBPACK_DICT_PATTERN.finditer(js_code):
            block = match.group(0)
            for kv_match in re.finditer(
                r'[\'"]?([a-zA-Z0-9_\-]+)[\'"]?\s*:\s*[\'"]([a-zA-Z0-9_\-]{6,40})[\'"]', block
            ):
                k, v = kv_match.groups()
                chunks.add(f"{k}.{v}.js")
                chunks.add(f"chunk-{k}.{v}.js")
        return chunks

    @staticmethod
    def _extract_webpack_ternary_chunks(js_code: str) -> Set[str]:
        chunks = set()
        for chunk_id, chunk_hash in WEBPACK_TERNARY_PATTERN.findall(js_code):
            chunks.add(f"{chunk_id}.{chunk_hash}.js")
            chunks.add(f"chunk-{chunk_id}.{chunk_hash}.js")
        return chunks

    @staticmethod
    def _extract_vite_preload_chunks(js_code: str) -> Set[str]:
        chunks = set()
        for match in VITE_PRELOAD_PATTERN.finditer(js_code):
            for f in re.findall(r'[\'"]([^\'"]+\.js)[\'"]', match.group(1)):
                chunks.add(f.strip())
        return chunks

    @staticmethod
    def _extract_dynamic_imports(js_code: str) -> Set[str]:
        return {m.group(1).strip() for m in DYNAMIC_IMPORT_PATTERN.finditer(js_code)
                if not m.group(1).startswith("data:")}

    @staticmethod
    def _extract_nextjs_build_manifest(js_code: str) -> Set[str]:
        return {f"/_next/{c}" for c in re.findall(r'[\'"](static/chunks/[^\'"]+\.js)[\'"]', js_code)}

    @staticmethod
    def _extract_generic_chunks(js_code: str) -> Set[str]:
        chunks = set()
        for m in GENERIC_CHUNK_PATTERN.findall(js_code):
            clean = m.strip()
            if clean.endswith(".js") and not clean.startswith("/"):
                if len(clean) <= 80 and not any(c in clean for c in (" ", ";", "(", ")")):
                    chunks.add(clean)
        return chunks

    @staticmethod
    def _is_valid_script_url(url: str) -> bool:
        if not url or not (url.startswith("http://") or url.startswith("https://")):
            return False
        parsed = urlparse(url)
        filename = parsed.path.rsplit("/", 1)[-1].lower() if "/" in parsed.path else ""
        if filename in COMMON_VENDOR_SCRIPTS:
            return False
        for ext in (".map", ".css", ".png", ".jpg", ".svg", ".ico", ".json", ".wasm", ".zip"):
            if parsed.path.lower().endswith(ext):
                return False
        return True


# ─────────────────────────────────────────────────────────────────────────────
# §6 扫描引擎 — 对齐源 hunter.py（PyInfoHunter，剥离 Mongo/Config）
# ─────────────────────────────────────────────────────────────────────────────
class WihSecretHunter:
    """零磁盘、内存流式敏感信息扫描引擎。"""

    def __init__(self, sites: List[str], concurrency: int = 6, rule_path: Optional[str] = None,
                 max_chunks_per_site: int = MAX_CHUNKS_PER_SITE, proxy: Optional[str] = None,
                 timeout: Tuple[float, float] = DEFAULT_TIMEOUT):
        self.sites = list(dict.fromkeys(sites))  # 保序去重
        self.concurrency = max(1, concurrency)
        self.max_chunks = max_chunks_per_site
        self.rule_engine = WihRuleEngine(rule_path)
        self.chunk_parser = WebpackChunkParser(max_chunks_per_site=max_chunks_per_site)
        self.proxy = proxy
        self.timeout = timeout
        self.headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                          "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "*/*",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8"
        }

    def _create_session(self) -> requests.Session:
        session = requests.Session()
        session.verify = False
        session.headers.update(self.headers)
        if self.proxy:
            session.proxies = {"http": self.proxy, "https": self.proxy}
        else:
            session.trust_env = False
        adapter = requests.adapters.HTTPAdapter(pool_connections=20, pool_maxsize=50, max_retries=1)
        session.mount("http://", adapter)
        session.mount("https://", adapter)
        return session

    def _safe_stream_get(self, session: requests.Session, url: str) -> Optional[str]:
        """流式 GET：5MB 截断防 OOM，30s 绝对超时防 Slowloris。"""
        try:
            with session.get(url, stream=True, timeout=self.timeout, allow_redirects=True) as resp:
                if resp.status_code >= 400:
                    return None
                content_type = resp.headers.get("Content-Type", "").lower()
                if any(bt in content_type for bt in ("image/", "audio/", "video/", "octet-stream", "zip", "pdf")):
                    return None
                content_len_header = resp.headers.get("Content-Length")
                if content_len_header and int(content_len_header) > MAX_JS_SIZE * 2:
                    logger.debug(f"Skipping huge file ({content_len_header} bytes): {url}")
                    return None
                chunks = []
                total_read = 0
                fetch_start = time.time()
                for chunk in resp.iter_content(chunk_size=32768):
                    if time.time() - fetch_start > 30.0:
                        logger.warning(f"Slow stream timeout exceeded on {url}")
                        break
                    chunks.append(chunk)
                    total_read += len(chunk)
                    if total_read >= MAX_JS_SIZE:
                        break
                raw_bytes = b"".join(chunks)
            try:
                return raw_bytes.decode("utf-8")
            except UnicodeDecodeError:
                return raw_bytes.decode("latin1", errors="ignore")
        except Exception as e:
            logger.debug(f"Error fetching {url}: {e}")
            return None

    def _scan_single_site(self, site: str) -> List[WihRecord]:
        site_records: Set[WihRecord] = set()
        session = self._create_session()
        try:
            # 1. 入口 HTML
            html_text = self._safe_stream_get(session, site)
            if not html_text:
                return []

            # 2. HTML 直接提取
            for r_type, content in self.rule_engine.extract_from_text(html_text, site, site, "page"):
                site_records.add(WihRecord(r_type, content, f"{site} [page]", site, fnv1a_64(content)))

            # 3. Tier 1: 内联脚本 + 外链脚本 + Next.js manifest
            dom_data = self.chunk_parser.extract_from_html(html_text, site)
            for idx, inline_code in enumerate(dom_data.get("inline_scripts", [])):
                for r_type, content in self.rule_engine.extract_from_text(inline_code, site, site, "inline"):
                    site_records.add(WihRecord(r_type, content, f"{site} [inline-{idx + 1}]", site, fnv1a_64(content)))

            # 4. 脚本抓取 + chunk 瀑布扩展（配额内）
            to_fetch_scripts = list(dom_data.get("scripts", set()))
            fetched_scripts = set()
            discovered_chunks = set(to_fetch_scripts)
            consecutive_errors = 0

            while to_fetch_scripts and len(fetched_scripts) < self.max_chunks:
                batch = to_fetch_scripts[:10]
                to_fetch_scripts = to_fetch_scripts[10:]
                for script_url in batch:
                    if script_url in fetched_scripts:
                        continue
                    fetched_scripts.add(script_url)
                    js_text = self._safe_stream_get(session, script_url)
                    if not js_text:
                        consecutive_errors += 1
                        if consecutive_errors >= CHUNK_CONSECUTIVE_ERRORS_LIMIT:
                            logger.debug(f"Consecutive errors limit reached for {site}, halting expansion")
                            to_fetch_scripts.clear()
                            break
                        continue
                    else:
                        consecutive_errors = 0

                    for r_type, content in self.rule_engine.extract_from_text(js_text, site, script_url, "script"):
                        site_records.add(WihRecord(r_type, content, f"{script_url} [script]", site, fnv1a_64(content)))

                    if len(discovered_chunks) < self.max_chunks:
                        new_chunks = self.chunk_parser.extract_chunks_from_js(js_text, script_url)
                        for nc in new_chunks:
                            if nc not in discovered_chunks and len(discovered_chunks) < self.max_chunks:
                                discovered_chunks.add(nc)
                                to_fetch_scripts.append(nc)
        except Exception as e:
            logger.warning(f"Error during WIH scan on {site}: {e}")
        finally:
            session.close()
        return list(site_records)

    def run(self) -> List[WihRecord]:
        t1 = time.time()
        logger.info(f"Start WIH scan on {len(self.sites)} sites (concurrency={self.concurrency})")
        all_results: Set[WihRecord] = set()
        if len(self.sites) == 1:
            all_results.update(self._scan_single_site(self.sites[0]))
        else:
            with ThreadPoolExecutor(max_workers=self.concurrency) as executor:
                futures = {executor.submit(self._scan_single_site, s): s for s in self.sites}
                for future in as_completed(futures):
                    try:
                        all_results.update(future.result())
                    except Exception as e:
                        logger.warning(f"Site scan failed {futures[future]}: {e}")
        elapsed = time.time() - t1
        logger.info(f"WIH scan done: {len(all_results)} unique records in {elapsed:.1f}s")
        return list(all_results)


# ─────────────────────────────────────────────────────────────────────────────
# §7 CLI
# ─────────────────────────────────────────────────────────────────────────────
RISK_ORDER = {"CRITICAL": 0, "MEDIUM": 1, "LOW": 2}


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        prog="wih_engine",
        description="WIH Secret Hunter — 纯 Python Web 敏感信息提取（来源 ARL-Next, GPL-3.0）")
    parser.add_argument("--sites", nargs="+", required=True, help="目标站点 URL 列表（授权范围内）")
    parser.add_argument("--rule-file", default=None, help="WIH 规则 YAML（默认同目录 wih_rules.yml）")
    parser.add_argument("--max-chunks", type=int, default=50, help="每站点 chunk 配额（默认 50）")
    parser.add_argument("--concurrency", type=int, default=6, help="站点级并发（默认 6）")
    parser.add_argument("--read-timeout", type=float, default=15.0, help="读超时秒（默认 15）")
    parser.add_argument("--proxy", default=None, help="HTTP(S) 代理，如 http://127.0.0.1:8080")
    parser.add_argument("--min-risk", choices=["CRITICAL", "MEDIUM", "LOW"], default=None,
                        help="stdout 摘要仅显示 >= 该风险级（JSON 全量输出）")
    parser.add_argument("--output", default=None, help="JSON 结果落盘路径（默认 wih_findings_<ts>.json）")
    parser.add_argument("-v", "--verbose", action="store_true", help="DEBUG 日志")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.DEBUG if args.verbose else logging.INFO,
                        format="%(levelname)s %(message)s")

    hunter = WihSecretHunter(
        sites=args.sites,
        concurrency=args.concurrency,
        rule_path=args.rule_file,
        max_chunks_per_site=args.max_chunks,
        proxy=args.proxy,
        timeout=(5.0, args.read_timeout),
    )
    records = hunter.run()
    records.sort(key=lambda r: (RISK_ORDER.get(r.risk_level, 9), r.site, r.recordType))

    out_path = args.output or f"wih_findings_{int(time.time())}.json"
    payload = {
        "scanned_sites": args.sites,
        "scan_time": time.strftime("%Y-%m-%d %H:%M:%S"),
        "total": len(records),
        "records": [r.to_dict() for r in records],
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    # stdout 精炼摘要（省 token；全量看 JSON）
    shown = [r for r in records if args.min_risk is None or RISK_ORDER.get(r.risk_level, 9) <= RISK_ORDER[args.min_risk]]
    print(f"\n=== WIH 扫描摘要 ===")
    print(f"目标: {len(args.sites)} 站点 | 检出: {len(records)} 条（显示 "
          f"{len(shown)} 条, 阈值 {args.min_risk or 'ALL'}）| 落盘: {out_path}")
    by_risk: Dict[str, int] = {}
    for r in records:
        by_risk[r.risk_level] = by_risk.get(r.risk_level, 0) + 1
    print(f"风险分布: " + " | ".join(f"{k}={v}" for k, v in sorted(by_risk.items())))
    if shown:
        print(f"\n{'风险':<9} {'类型':<22} {'内容':<44} 来源")
        for r in shown[:60]:
            content = r.content if len(r.content) <= 42 else r.content[:39] + "..."
            src = r.source if len(r.source) <= 50 else r.source[:47] + "..."
            print(f"{r.risk_level:<9} {r.recordType:<22} {content:<44} {src}")
        if len(shown) > 60:
            print(f"... 其余 {len(shown) - 60} 条见 JSON")

    # 退出码约定（对齐 evidence_gate 风格）：0=有发现 1=无发现 2=运行错误
    return 0 if records else 1


if __name__ == "__main__":
    sys.exit(main())
