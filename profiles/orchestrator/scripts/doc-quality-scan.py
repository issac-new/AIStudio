#!/usr/bin/env python3
"""shim -> ~/.hermes/scripts/doc-quality-scan.py (cron 只认 profile scripts 目录内的真路径)"""
import runpy
runpy.run_path('/Users/YOURNAME/.hermes/scripts/doc-quality-scan.py', run_name='__main__')
