#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""解密 hybrid-encrypt.py 生成的 .enc 文件（验证加密可还原）。
用法: python3 hybrid-decrypt.py <privkey.pem> <enc文件> <输出路径>
目录类 .enc 解密后得到 .tar，需再 tar -xf 解开。
"""
import sys, base64
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

def decrypt(privkey_path, enc_path, out_path):
    priv = serialization.load_pem_private_key(open(privkey_path, "rb").read(), password=None)
    with open(enc_path) as f:
        ek = base64.b64decode(f.readline().strip())
        nonce = base64.b64decode(f.readline().strip())
        ct = base64.b64decode(f.read().strip())
    aes_key = priv.decrypt(ek, padding.OAEP(
        mgf=padding.MGF1(algorithm=hashes.SHA256()),
        algorithm=hashes.SHA256(), label=None))
    data = AESGCM(aes_key).decrypt(nonce, ct, None)
    open(out_path, "wb").write(data)
    print(f"OK: {enc_path} -> {out_path} ({len(data)} bytes)")

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print(__doc__); sys.exit(1)
    decrypt(sys.argv[1], sys.argv[2], sys.argv[3])
