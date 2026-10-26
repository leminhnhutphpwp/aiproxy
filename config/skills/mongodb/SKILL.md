# MongoDB Patterns

## Document Modeling
- Embed related data that is always accessed together (embedded documents)
- Reference data that is accessed independently or grows unbounded (references)
- Prefer embedding for 1:1 and 1:few relationships
- Prefer referencing for 1:many and many:many relationships

```javascript
// Embedded (good — address always accessed with user)
{
  _id: ObjectId("..."),
  name: "John",
  address: { street: "123 Main", city: "NYC", zip: "10001" }
}

// Referenced (good — posts accessed independently)
{
  _id: ObjectId("..."),
  userId: ObjectId("..."),
  title: "Post Title",
  content: "..."
}
```

## Schema Design Patterns
- **Polymorphic**: `type` field for different shapes in same collection
- **Bucket**: group related data by time for time-series
- **Outlier**: handle documents that exceed normal size
- **Computed**: pre-calculate and store aggregates
- **Subset**: embed a small preview of data from another collection

## Indexing
```javascript
// Single field
db.users.createIndex({ email: 1 }, { unique: true });

// Compound
db.orders.createIndex({ status: 1, createdAt: -1 });

// Text search
db.posts.createIndex({ title: "text", content: "text" });

// TTL (auto-expire)
db.sessions.createIndex({ createdAt: 1 }, { expireAfterSeconds: 86400 });

// Partial (only index matching docs)
db.orders.createIndex({ status: 1 }, { partialFilterExpression: { status: "active" } });
```
- Index fields used in queries, sorts, and joins (lookups)
- ESR rule: Equality fields first, Sort fields second, Range fields last
- Use `explain("executionStats")` to check index usage
- `COLLSCAN` (collection scan) on large collections is bad — optimize

## Aggregation Pipeline
```javascript
db.orders.aggregate([
  { $match: { status: "completed", createdAt: { $gte: startDate } } },
  { $group: { _id: "$customerId", total: { $sum: "$amount" }, count: { $sum: 1 } } },
  { $sort: { total: -1 } },
  { $limit: 10 },
  { $lookup: { from: "customers", localField: "_id", foreignField: "_id", as: "customer" } },
  { $unwind: "$customer" },
  { $project: { "customer.name": 1, total: 1, count: 1 } },
]);
```
- `$match` and `$limit` early to reduce pipeline processing
- `$lookup` is MongoDB's JOIN — use sparingly, prefer embedding
- `$addFields` for computed fields mid-pipeline
- `$facet` for multiple aggregations in parallel on the same filtered set
- Pipeline stages operate in sequence — order matters for performance

## Atlas
- `M0` free tier: 512MB storage, shared RAM — for development only
- `M10`+: dedicated instances for production
- Atlas Search: built-in full-text search with Lucene-based indexing
- Atlas Triggers: event-driven serverless functions on DB changes
- Online Archive: auto-archive old data to cheaper storage

## Change Streams
```javascript
const pipeline = [{ $match: { "fullDocument.status": "pending" } }];
const changeStream = db.orders.watch(pipeline);
changeStream.on("change", (change) => {
  // Full document available in change.fullDocument
  enqueueProcessing(change.fullDocument);
});
```

## Transactions
```javascript
const session = client.startSession();
try {
  session.startTransaction();
  await db.orders.insertOne(order, { session });
  await db.inventory.updateOne({ _id: productId }, { $inc: { stock: -1 } }, { session });
  await session.commitTransaction();
} catch (e) {
  await session.abortTransaction();
  throw e;
} finally {
  session.endSession();
}
```

## Common Mistakes
- ❌ Using MongoDB like a relational DB (normalizing everything, heavy $lookup)
- ❌ No indexes — queries do COLLSCAN on every operation
- ❌ Large embedded arrays that cause 16MB document size limit
- ❌ Not using `$project` in aggregation (fetching unused fields)
- ❌ Forgetting `writeConcern: majority` for durability in production
