# AWS Cloud Patterns

## Core Principles
- **Well-Architected Framework**: Operational Excellence, Security, Reliability, Performance Efficiency, Cost Optimization, Sustainability
- **Disposable Resources**: Everything is ephemeral — instances, functions, containers come and go
- **Infrastructure as Code**: All resources defined in CloudFormation, CDK, or Terraform
- **Least Privilege**: IAM policies grant the minimum permissions needed — nothing more

## Key Patterns
- **Serverless with Lambda + API Gateway**: Event-driven compute with auto-scaling
- **S3 + CloudFront + Route53**: Static hosting with CDN, SSL, and custom domain
- **DynamoDB Single-Table Design**: Access patterns drive table design — one table per bounded context
- **SQS + Lambda**: Decoupled async processing with DLQ for failed messages
- **ECS Fargate + ALB**: Containerized services without managing EC2 instances
- **EventBridge**: Event-driven architecture with schema registry and filtering

## Best Practices
- Use `aws-cdk` (TypeScript/Python) — imperative constructs > YAML templates
- Tag all resources (Environment, Project, CostCenter) for cost allocation
- Enable CloudTrail + Config for audit trail and compliance
- Use Parameter Store / Secrets Manager for config and secrets (never env vars)
- Configure S3 Lifecycle Policies for cost optimization (tier to Glacier, expire)
- Set CloudWatch Alarms + AWS Chatbot for incident notification to Slack
- Use Compute Optimizer for right-sizing EC2, ECS, and Lambda

## Common Pitfalls
- **Overly permissive IAM policies**: `"Effect": "Allow", "Action": "*"` — never in production
- **Not designing for failure**: Single-AZ deployments will eventually fail — use multi-AZ
- **Cold starts in Lambda**: Large runtimes or VPC config cause latency — use Lambda SnapStart
- **No IaC**: Manual console changes are unrepeatable and unverifiable — always IaC
- **Ignoring Cost Explorer**: AWS costs drift without monitoring — set budgets + alerts

## Tools & Ecosystem
- **AWS CDK / Terraform**: IaC with high-level constructs
- **SAM CLI**: Local Lambda testing and deployment
- **AWS CLI + jq**: Scriptable infrastructure management
- **CloudWatch + X-Ray**: Observability with traces, logs, and metrics
- **DynamoDB Streams + Lambda**: Change data capture for real-time processing
