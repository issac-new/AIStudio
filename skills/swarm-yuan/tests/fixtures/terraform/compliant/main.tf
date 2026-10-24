# 合规章本：加密远程 backend + 锁版本 + 密钥走 var + 管理端口收窄 + 有状态资源防毁
terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket  = "corp-terraform-state"
    key     = "prod/terraform.tfstate"
    region  = "cn-north-1"
    encrypt = true
  }
}

provider "aws" {
  region = "cn-north-1"
}

variable "db_password" {
  type      = string
  sensitive = true
}

resource "aws_security_group" "web" {
  name = "web-sg"

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/8"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_s3_bucket" "assets" {
  bucket = "corp-private-assets"
  acl    = "private"

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_db_instance" "main" {
  identifier          = "corp-main-db"
  engine              = "mysql"
  instance_class      = "db.t3.medium"
  username            = "admin"
  password            = var.db_password
  publicly_accessible = false
  storage_encrypted   = true

  lifecycle {
    prevent_destroy = true
  }
}

output "db_password" {
  value     = var.db_password
  sensitive = true
}
