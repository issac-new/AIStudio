#!/usr/bin/env bash
# 违例样本：plan 未审查直接 auto-approve
set -e
terraform init
terraform apply -auto-approve
