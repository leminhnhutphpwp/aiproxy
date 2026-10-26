# Supabase Development

## Core Architecture
- Supabase = open-source Firebase alternative built on PostgreSQL
- Managed PostgreSQL database with real-time capabilities
- Built-in auth, storage, Edge Functions, and vector search
- Every Supabase project = a dedicated PostgreSQL instance

## Database & RLS
```sql
-- Enable Row Level Security
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;

-- Policy: users can only read published posts
CREATE POLICY "Public posts are viewable by everyone"
ON posts FOR SELECT
USING (published = true);

-- Policy: users can CRUD their own posts
CREATE POLICY "Users can manage their own posts"
ON posts FOR ALL
USING (auth.uid() = author_id)
WITH CHECK (auth.uid() = author_id);
```
- Always enable RLS on tables containing user data
- Policies are written in SQL — use `auth.uid()` for current user
- Test policies in the Supabase SQL editor before deploying
- Never expose service_role key to client — it bypasses RLS

## Authentication
```javascript
// Client SDK - Sign up
const { data, error } = await supabase.auth.signUp({
  email: 'user@example.com',
  password: 'secure-password',
  options: { data: { full_name: 'John' } }
});

// Sign in
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'secure-password',
});

// Session management
const { data: { session } } = await supabase.auth.getSession();
const { data: { user } } = await supabase.auth.getUser();
```
- Use Supabase Auth UI library for pre-built login forms
- Magic link for passwordless authentication
- OAuth providers: Google, GitHub, Discord, Azure, Apple
- Session refresh handled automatically by the client SDK

## Realtime Subscriptions
```javascript
// Subscribe to database changes
const channel = supabase
  .channel('public:posts')
  .on('postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'posts', filter: `author_id=eq.${userId}` },
    (payload) => { console.log('New post:', payload.new); }
  )
  .subscribe();

// Broadcast (custom events)
channel.send({ type: 'broadcast', event: 'typing', payload: { userId, postId } });

// Cleanup
supabase.removeChannel(channel);
```

## Edge Functions
```typescript
// supabase/functions/hello-world/index.ts
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!);
  const { data: { user } } = await supabase.auth.getUser();

  const { data } = await supabase.from('posts').select('*').eq('author_id', user?.id);
  return new Response(JSON.stringify({ posts: data }), { headers: { 'Content-Type': 'application/json' } });
});
```
- Edge Functions run on Deno (fast cold starts, global deployment)
- Use for: webhooks, payment processing, AI integrations
- Environment variables set in Supabase dashboard
- Max duration: 2 minutes (premium: 15 minutes)

## Storage
```javascript
// Upload file
const { data, error } = await supabase.storage
  .from('avatars')
  .upload(`public/${userId}.jpg`, file, { upsert: true });

// Public URL
const { data: { publicUrl } } = supabase.storage
  .from('avatars')
  .getPublicUrl(`public/${userId}.jpg`);

// RLS on Storage buckets
CREATE POLICY "Users can view avatars"
ON storage.objects FOR SELECT
USING (bucket_id = 'avatars');
```
- Separate buckets for public and private files
- RLS applies to storage too — create policies on `storage.objects`
- Built-in image transformation: `?width=200&height=200&quality=80`

## Vector Search (pgvector)
```sql
-- Enable extension
CREATE EXTENSION vector;

-- Create table with embedding
CREATE TABLE documents (
  id BIGSERIAL PRIMARY KEY,
  content TEXT,
  embedding VECTOR(384)
);

-- Search by similarity
SELECT content, 1 - (embedding <=> '[0.1, 0.2, ...]') AS similarity
FROM documents
ORDER BY embedding <=> '[0.1, 0.2, ...]'
LIMIT 5;
```

## Common Mistakes
- ❌ Disabling RLS — users can access any data
- ❌ Using service_role key on the client (admin access)
- ❌ No indexes on frequently queried columns
- ❌ Not setting up proper auth callback URLs
- ❌ Over-fetching in realtime subscriptions (subscribe to specific channels only)
