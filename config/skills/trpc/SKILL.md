# tRPC Type-Safe APIs

## Core Concepts
- tRPC provides end-to-end type safety between server and client
- No code generation, no runtime validation library required (Zod optional)
- Works with React, Vue, Svelte, Next.js, Express, Fastify
- TypeScript is mandatory — tRPC infers types automatically

## Router Setup
```typescript
// server/router.ts
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();
const router = t.router;
const publicProcedure = t.procedure;

export const appRouter = router({
  userById: publicProcedure
    .input(z.string())  // Validation with Zod
    .query(async ({ input }) => {
      const user = await db.user.findUnique({ where: { id: input } });
      if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });
      return user;
    }),
  userCreate: publicProcedure
    .input(z.object({ name: z.string().min(1), email: z.string().email() }))
    .mutation(async ({ input }) => {
      return db.user.create({ data: input });
    }),
});

export type AppRouter = typeof appRouter;
```

## Server Integration (Express)
```typescript
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { appRouter } from './router';

const app = express();
app.use('/trpc', createExpressMiddleware({ router: appRouter, createContext: ({ req }) => ({ user: getUser(req) }) }));
app.listen(3000);
```

## React Client
```tsx
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from './server/router';

const trpc = createTRPCReact<AppRouter>();

// Provider (wraps app)
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';

const queryClient = new QueryClient();
const trpcClient = trpc.createClient({ links: [httpBatchLink({ url: 'http://localhost:3000/trpc' })] });

function App() {
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <UserProfile id="123" />
      </QueryClientProvider>
    </trpc.Provider>
  );
}

// Component — fully typed
function UserProfile({ id }: { id: string }) {
  const { data, isLoading, error } = trpc.userById.useQuery(id);
  const mutation = trpc.userCreate.useMutation();

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;

  return (
    <div>
      <p>{data.name}</p>
      <button onClick={() => mutation.mutate({ name: 'New', email: 'new@x.com' })}>
        Create
      </button>
    </div>
  );
}
```

## Middleware & Context
```typescript
const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  return next({ ctx: { user: ctx.user } });  // Override context type
});
const protectedProcedure = t.procedure.use(isAuthed);

export const appRouter = router({
  secretData: protectedProcedure.query(({ ctx }) => {
    return ctx.user.secretData;  // ctx.user is now typed
  }),
});
```

## Error Handling
```typescript
import { TRPCError } from '@trpc/server';

// Server
throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid input' });
// Codes: PARSE_ERROR, BAD_REQUEST, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, TIMEOUT, CONFLICT, INTERNAL_SERVER_ERROR

// Client
const { error } = trpc.userById.useQuery('invalid');
if (error) {
  console.log(error.data.code);  // 'NOT_FOUND' | 'BAD_REQUEST' | ...
  console.log(error.message);    // Human-readable message
}
```

## Subscriptions
```typescript
// Server
onUpdate: t.procedure.subscription(() => {
  return observable<Post>((emit) => {
    const unsub = onPostCreate((post) => emit.next(post));
    return () => unsub();
  });
});

// Client
const { data } = trpc.onUpdate.useSubscription();
```

## Performance
- `httpBatchLink`: batches multiple requests into one HTTP call (default)
- `httpLink`: one request per call (useful for subscriptions or streaming)
- Split routers: `t.mergeRouters()` for large apps
- Server-side caching with `@trpc/next` for Next.js SSG/SSR

## Common Mistakes
- ❌ Not using Zod or other validation for inputs (trusting client types blindly)
- ❌ Putting sensitive data in procedures without auth middleware
- ❌ Mixing `query` and `mutation` incorrectly (queries should be idempotent)
- ❌ Not splitting routers for large apps (file becomes unmanageable)
- ❌ Forgetting `httpBatchLink` — each query makes separate requests
