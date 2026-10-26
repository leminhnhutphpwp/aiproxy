# GCP Cloud Patterns

## Core Principles
- **Fully Managed Services**: GCP emphasizes managed services (Cloud Run, BigQuery, Spanner) over IaaS
- **Global Network**: GCP's private fiber network for low-latency inter-region communication
- **Unified IAM**: Projects, folders, and orgs with consistent IAM policies hierarchy
- **Data & ML First**: BigQuery, Vertex AI, Looker as integrated data platform

## Key Patterns
- **Cloud Run**: Stateless containers that scale to zero — perfect for HTTP services
- **Pub/Sub + Cloud Functions/Cloud Run**: Async event-driven architecture with exactly-once delivery
- **BigQuery for Analytics**: Serverless data warehouse with SQL + ML capabilities
- **Cloud Storage + CDN**: Object storage with multi-region replication and CDN fronting
- **Secret Manager**: Centralized API key and credential management (not .env files)
- **Cloud Build + Artifact Registry + Cloud Deploy**: CI/CD pipeline with deploy promotion

## Best Practices
- Use Cloud Resource Manager hierarchy: Org → Folders → Projects → Resources
- Enable VPC Service Controls for data exfiltration prevention
- Use Cloud Armor for WAF, DDoS protection, and rate limiting
- Export Cloud Audit Logs to BigQuery for analysis
- Prefer Cloud Run over GKE for most stateless services (unless you need Kubernetes APIs)
- Use Artifact Registry (not Container Registry) for Docker + Maven + Python packages
- Set budget alerts at the project level (50%, 75%, 90%, 100% thresholds)

## Common Pitfalls
- **IAM at resource level**: Permissions on individual resources scale poorly — use project/folder IAM
- **Not using labels**: Untagged resources can't be tracked in Billing Reports
- **Default VPC network**: Auto-mode VPC has broad firewall rules — create custom VPCs
- **BigQuery without partitioning/ clustering**: Full-table scans are expensive
- **Cloud Functions timeout**: 9-min max for HTTP functions — use Cloud Run for longer

## Tools & Ecosystem
- **gcloud CLI + jq**: Automation scripting
- **Cloud SDK Libraries**: First-class client libraries for Go, Python, Node, Java
- **Terraform for GCP**: Most providers support all GCP resources
- **Skaffold**: Continuous development for Cloud Run and GKE
- **Prometheus + Google Cloud Managed Service**: Managed Prometheus for metrics
