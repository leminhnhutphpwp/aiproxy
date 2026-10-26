# Incident Response & SRE

## Core Principles
- **Blameless Culture**: Systems fail — post-mortems find root cause, not blame
- **Reliability as Feature**: SLOs define acceptable uptime; error budgets guide velocity
- **Automate Everything**: Manual toil is the enemy — script, instrument, self-heal
- **Measure What Matters**: Latency, traffic, errors, saturation (USE Method / RED Method)

## Key Patterns
- **Incident Triage**: Detect → acknowledge → assess severity → declare or dismiss
- **Commander Model**: IC (technical lead) + Comms (stakeholder updates) + Scribe (timeline)
- **SLO / SLI / Error Budget**: Service Level Objectives measured by SLIs; error budget = 1 - SLO
- **Runbook**: Step-by-step procedures for common incidents — kept in version control
- **Postmortem**: Timeline, root cause, action items, blameless language
- **On-Call Rotation**: Primary + secondary, max 1 week shift, follow-the-sun if global

## Best Practices
- Alert on symptoms (user-visible), not causes (internal metrics) — fewer, higher-signal alerts
- Use severity levels (SEV1=critical outage, SEV2=degraded, SEV3=minor) with clear definitions
- Every incident needs a written timeline — it anchors the postmortem
- Postmortems must produce action items with owners and deadlines
- Chaos Engineering: Proactively inject failures to test resilience
- Observability > Monitoring: Logs + metrics + traces for full picture
- Document escalation paths clearly — who to page when

## Common Pitfalls
- **Alert fatigue**: Too many noisy alerts — people stop responding
- **Blaming individuals**: Root cause is almost always a system/process gap
- **No runbooks**: Every incident becomes a fire drill — institutional knowledge lost
- **No follow-through**: Action items from postmortems are never completed
- **Ignoring error budgets**: Deploying risky changes when error budget is depleted

## Tools & Ecosystem
- **PagerDuty / Opsgenie**: On-call scheduling and alert routing
- **Grafana + Prometheus**: Metrics, dashboards, and alerting
- **Datadog / New Relic**: Full observability platform
- **Honeycomb**: High-cardinality event-based observability
- **Sentry**: Error tracking and crash reporting
- **Terraform / Pulumi**: Infrastructure as Code for reproducible infra
