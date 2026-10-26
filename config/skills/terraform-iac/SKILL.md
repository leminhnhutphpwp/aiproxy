# Terraform Infrastructure as Code

## Core Concepts
- Terraform declaratively defines cloud infrastructure: "what" not "how"
- Providers: AWS, GCP, Azure, Cloudflare, GitHub, Kubernetes, etc.
- State file (`terraform.tfstate`) is the source of truth — protect it
- HCL (HashiCorp Configuration Language) for resource definitions

## Basic Configuration
```hcl
terraform {
  required_version = ">= 1.6"
  backend "s3" {
    bucket = "my-terraform-state"
    key    = "prod/infrastructure.tfstate"
    region = "us-east-1"
  }
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
}

provider "aws" {
  region = var.aws_region
  default_tags { tags = { Environment = var.environment, Project = "myapp" } }
}
```

## Resources & Data Sources
```hcl
# Resource: creates and manages infrastructure
resource "aws_s3_bucket" "app_assets" {
  bucket = "myapp-assets-${var.environment}"
  acl    = "private"
  versioning { enabled = true }
  server_side_encryption_configuration {
    rule { apply_server_side_encryption_by_default { sse_algorithm = "AES256" } }
  }
}

# Data source: reads existing infrastructure
data "aws_vpc" "default" {
  default = true
}

resource "aws_security_group" "web" {
  name        = "web-sg-${var.environment}"
  description = "Web server security group"
  vpc_id      = data.aws_vpc.default.id
  ingress {
    from_port   = 80
    to_port     = 80
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
```

## Variables & Outputs
```hcl
# variables.tf
variable "environment" {
  type        = string
  description = "Deployment environment"
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "Environment must be dev, staging, or prod."
  }
}
variable "instance_count" {
  type    = number
  default = 2
}

# outputs.tf
output "bucket_arn" {
  value       = aws_s3_bucket.app_assets.arn
  description = "S3 bucket ARN"
  sensitive   = false
}
output "db_password" {
  value     = random_password.db.result
  sensitive = true
}
```

## Modules
```hcl
# modules/vpc/main.tf
resource "aws_vpc" "main" {
  cidr_block = var.cidr_block
  tags       = { Name = var.name }
}

# Root configuration
module "vpc" {
  source     = "./modules/vpc"
  cidr_block = "10.0.0.0/16"
  name       = "main-vpc"
}
```
- Modules encapsulate reusable infrastructure patterns
- Inputs (variables), outputs, local resources
- Publish modules to registry for team reuse
- Use `source` with git or registry references

## State Management
```bash
terraform init       # Initialize backend, providers, modules
terraform plan       # Preview changes (read-only)
terraform apply      # Apply changes (prompts for confirmation)
terraform destroy    # Tear down all resources
terraform fmt        # Format code
terraform validate   # Validate syntax and configuration
```
- NEVER edit `terraform.tfstate` manually
- Use remote state (S3 + DynamoDB) for team collaboration
- State locking prevents concurrent modifications
- `terraform workspace` for environment separation (dev, staging, prod)

## Workspaces
```hcl
# Separate state per environment
terraform workspace new dev
terraform workspace new prod
terraform workspace select dev
terraform apply
```
- Workspaces isolate state for different environments
- Alternatives: separate backend configurations per environment

## Best Practices
- Pin provider versions: `version = "~> 5.0"` (not `">= 5.0"`)
- Use `terraform plan` in CI/CD to validate before apply
- Tag everything: `{ Environment, Project, ManagedBy, Owner }`
- Use `prevent_destroy = true` on critical resources (databases)
- Import existing resources: `terraform import aws_s3_bucket.app bucket-name`

## Common Mistakes
- ❌ Storing sensitive values in state (state is unencrypted) — use `sensitive = true`
- ❌ Committing `.tfstate` files to git
- ❌ No state locking (team members overwrite each other)
- ❌ Hardcoding values instead of using variables
- ❌ Not using `terraform plan` before `apply` (surprise changes)
