#!/usr/bin/env bash
# 合规章本：plan -out 产出后审查，apply 只执行已审查的 plan 文件
set -e
terraform init
terraform plan -out=tfplan -detailed-exitcode
terraform apply tfplan
