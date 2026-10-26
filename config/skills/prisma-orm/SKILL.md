# Prisma ORM Patterns

## Schema Design
```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  role      Role     @default(USER)
  posts     Post[]
  profile   Profile?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Post {
  id        String   @id @default(cuid())
  title     String
  content   String?
  published Boolean  @default(false)
  author    User     @relation(fields: [authorId], references: [id])
  authorId  String
  tags      Tag[]    @relation("PostTags")
  createdAt DateTime @default(now())
}

enum Role { USER ADMIN }

model Tag {
  id    String @id @default(cuid())
  name  String @unique
  posts Post[] @relation("PostTags")
}
```
- Use `cuid()` or `uuid()` for IDs (autoincrement can leak record count)
- `@unique` for fields that must be unique
- `@relation` with explicit fields for clarity
- `@default(now())` and `@updatedAt` on all models

## Migrations
```bash
prisma migrate dev --name add-user-role   # Development (creates + applies)
prisma migrate deploy                      # Production (applies pending)
prisma migrate diff --from-empty --to-schema-datamodel --script > init.sql  # Generate SQL
prisma db push                             # Prototyping (no migration files)
```
- Always version control `prisma/migrations/` directory
- One migration per logical change — don't combine unrelated schema changes
- `prisma migrate dev` resets data — use `prisma db push` for non-destructive changes
- For production: `prisma migrate deploy` (never `prisma migrate dev`)

## CRUD Operations
```ts
// Create
const user = await prisma.user.create({ data: { email: 'john@x.com', name: 'John' } });

// Read with relations
const posts = await prisma.post.findMany({
  where: { published: true, author: { role: 'ADMIN' } },
  include: { author: { select: { name: true } }, tags: true },
  orderBy: { createdAt: 'desc' },
  take: 20,
  skip: 0,
});

// Update
await prisma.user.update({ where: { id: userId }, data: { name: 'Updated' } });

// Delete
await prisma.post.delete({ where: { id: postId } });
```

## Relations & Eager Loading
```ts
// Fluent API for nested operations
const post = await prisma.user
  .findUnique({ where: { id: userId } })
  .posts({ where: { published: true } });

// Nested create
await prisma.user.create({
  data: { email: 'john@x.com', posts: { create: { title: 'First Post' } } },
});
```

## Middleware (Prisma Client extensions)
```ts
const prisma = new PrismaClient().$extends({
  query: {
    user: {
      async findUnique({ args, query }) {
        if (!args.where.deletedAt) args.where.deletedAt = null;
        return query(args);
      },
    },
  },
  result: {
    user: {
      fullName: { needs: { firstName: true, lastName: true }, compute(u) { return `${u.firstName} ${u.lastName}`; } },
    },
  },
});
```

## Performance
- Use `select` to fetch only needed fields, never implicit `include` of everything
- Batch operations: `updateMany`, `deleteMany` — not loops
- Pagination: use `take` + `skip` for offset, or `cursor`-based for large datasets
- Connection pooling: set `connectionLimit` in datasource URL
- Log queries: `$on('query', e => console.log(e.query))`

## Common Mistakes
- ❌ N+1 queries (lazy loading relations in loops) — use `include` or `select`
- ❌ Not using `select` — fetching all fields when 3 are needed
- ❌ Large `where` clauses without indexes in the database
- ❌ Forgetting `@updatedAt` — no automatic timestamp updates
- ❌ Using Prisma in serverless without connection pooling (db connections exhaust)
