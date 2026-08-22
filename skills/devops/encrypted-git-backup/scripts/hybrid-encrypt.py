#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""AES-256-GCM + RSA-OAEP 混合加密：目录自动 tar，单文件直接加密。
用法: python3 hybrid-encrypt.py <pubkey.pem> <输出目录> <item1> [item2 ...]
item 为相对 workspace 的路径（文件或目录）。输出 <输出目录>/<name>.enc
"""
import os, sys, tarfile, secrets, base64, io
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def encrypt(pubkey_path, enc_dir, workspace, items):
    public_key = serialization.load_pem_public_key(open(pubkey_path, "rb").read())
    os.makedirs(enc_dir, exist_ok=True)

    def seal(data: bytes, out_path: str):
        aes_key, nonce = secrets.token_bytes(32), secrets.token_bytes(12)
        ct = AESGCM(aes_key).encrypt(nonce, data, None)
        ek = public_key.encrypt(aes_key, padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()),
            algorithm=hashes.SHA256(), label=None))
        with open(out_path, "w") as f:
            f.write(base64.b64encode(ek).decode() + "\n")
            f.write(base64.b64encode(nonce).decode() + "\n")
            f.write(base64.b64encode(ct).decode())
        return len(ct)

    for item in items:
        src = os.path.join(workspace, item)
        if not os.path.exists(src):
            print(f"  SKIP(not found): {item}"); continue
        out = os.path.join(enc_dir, item.replace("/", "_") + ".enc")
        if os.path.isdir(src):
            buf = io.BytesIO()
            with tarfile.open(fileobj=buf, mode="w") as tar:
                tar.add(src, arcname=item)
            data = buf.getvalue()
        else:
            data = open(src, "rb").read()
        sz = seal(data, out)
        print(f"  OK {item}: {sz//1024}KB -> {out}")

if __name__ == "__main__":
    if len(sys.argv) < 4:
        print(__doc__); sys.exit(1)
    pubkey, enc_dir, workspace = sys.argv[1], sys.argv[2], os.getcwd()
    encrypt(pubkey, enc_dir, workspace, sys.argv[3:])
