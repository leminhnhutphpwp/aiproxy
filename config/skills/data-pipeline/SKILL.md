# Data Pipeline Engineering

## Core Principles
- **Idempotency**: Re-running a pipeline produces the same result — no duplicate data
- **Observability**: Every pipeline stage emits metrics (records in/out, latency, errors)
- **Incremental Processing**: Process only new/changed data, not full re-scans
- **Schema Evolution**: Data schemas change over time — pipelines must handle it gracefully

## Key Patterns
- **Medallion Architecture**: Bronze (raw) → Silver (cleaned/validated) → Gold (aggregated/curated)
- **ELT vs ETL**: Extract → Load → Transform (warehouse does the work) vs Transform before load
- **Batch Processing**: Scheduled jobs (hourly, daily) with S3/stage-based checkpoints
- **Streaming with Micro-Batches**: Kafka → Spark Streaming → Sink (batch-like, low latency)
- **Incremental Load**: Watermark tracking (MAX updated_at) — only pull new records
- **Dead Letter Queue**: Failed records routed to DLQ with error metadata for reprocessing

## Best Practices
- Always version your data (partition by date, use manifest files, schema registry)
- Use Parquet/ORC columnar format for analytics — 10-100x compression vs CSV/JSON
- Partition data by date at minimum — enables partition pruning for query performance
- Implement data quality checks at each stage (nulls, duplicates, referential integrity)
- Use DBT for transformations — version-controlled, tested, documented SQL models
- Profile source data before designing pipelines — discover edge cases early
- Set up data lineage tracking — know where every column came from

## Common Pitfalls
- **Idempotency failure**: Pipeline reruns append duplicate records — use UPSERT or full refresh
- **Schema drift**: Source schema changes silently break transforms — implement schema validation
- **Late-arriving data**: Events from yesterday arrive today — handle late data with grace periods
- **Not backfilling**: Schema or logic changes without reprocessing historical data create inconsistency
- **Missing observability**: Pipeline silently fails or produces wrong data without alerting

## Tools & Ecosystem
- **Apache Spark / Flink**: Distributed processing (batch + stream)
- **Airflow / Prefect / Dagster**: Pipeline orchestration with DAG scheduling
- **dbt**: Transformations as version-controlled SQL
- **Kafka / Pulsar**: Event streaming and message queues
- **Snowflake / BigQuery / Redshift**: Cloud data warehouses
- **Great Expectations**: Data quality testing and documentation
- **Terraform + Airflow**: Infrastructure-managed pipeline environment
