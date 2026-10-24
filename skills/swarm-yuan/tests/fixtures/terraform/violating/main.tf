# 违例样本：provider 硬编码密钥 + 无 required_providers + 无 backend + 安全组 22 对公网 + S3 public + RDS 公网
provider "aws" {
  region     = "cn-north-1"
  access_key = "AKIAIOSFODNN7EXAMPLE"
  secret_key = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"
}

# 数据库口令直接写字面量（违例）
variable "db_password" {
  type    = string
  default = "Sup3rSecret!"
}

resource "aws_security_group" "bastion" {
  name = "bastion-sg"

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_s3_bucket" "assets" {
  bucket = "corp-public-assets"
  acl    = "public-read"
}

resource "aws_db_instance" "main" {
  identifier           = "corp-main-db"
  engine               = "mysql"
  instance_class       = "db.t3.medium"
  username             = "admin"
  password             = "PlainTextDbPass123"
  publicly_accessible  = true
}

# 敏感 output 未标 sensitive（违例，warn 级）
output "db_password" {
  value = var.db_password
}
