# GraphQL Development

## Schema Design
```graphql
type Query {
  user(id: ID!): User
  posts(page: Int, limit: Int): PostConnection!
}

type Mutation {
  createPost(input: CreatePostInput!): Post!
  deletePost(id: ID!): Boolean!
}

type User {
  id: ID!
  name: String!
  email: String!  # @authorize — field-level auth
  posts: [Post!]!
}

type Post {
  id: ID!
  title: String!
  content: String
  author: User!
  createdAt: DateTime!
}

input CreatePostInput {
  title: String!
  content: String
}

type PostConnection {
  edges: [PostEdge!]!
  pageInfo: PageInfo!
}

type PageInfo {
  hasNextPage: Boolean!
  endCursor: String
}
```
- Prefer `ID!` (non-null) for identifier fields
- Connection pattern for paginated lists with cursor-based pagination
- Input types for mutations — never use raw scalar arguments
- Use custom scalars (`DateTime`, `JSON`, `URL`) over strings

## Resolvers
```javascript
const resolvers = {
  Query: {
    user: async (_, { id }, { dataSources }) => {
      return dataSources.users.findById(id);
    },
    posts: async (_, { page, limit }, { dataSources }) => {
      return dataSources.posts.findAll({ page, limit });
    },
  },
  Mutation: {
    createPost: async (_, { input }, { dataSources, user }) => {
      if (!user) throw new AuthenticationError('Not authenticated');
      return dataSources.posts.create({ ...input, authorId: user.id });
    },
  },
  User: {
    posts: async (parent, _, { dataSources }) => {
      return dataSources.posts.findByAuthor(parent.id);
      // Use DataLoader to batch calls
    },
  },
};
```

## Apollo Server
```javascript
const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: ({ req }) => ({ user: getUserFromToken(req.headers.authorization), dataSources }),
  formatError: (err) => ({ message: err.message, code: err.extensions?.code }),
  introspection: process.env.NODE_ENV !== 'production',
});
```

## DataLoader (N+1 Prevention)
```javascript
const DataLoader = require('dataloader');

// Batch load function
const userLoader = new DataLoader(async (ids) => {
  const users = await db.users.findMany({ where: { id: { in: ids } } });
  return ids.map(id => users.find(u => u.id === id) || null);
});

// In resolver
User: {
  author: (post, _, { loaders }) => loaders.userLoader.load(post.authorId),
}
```

## Apollo Client (React)
```jsx
import { gql, useQuery, useMutation } from '@apollo/client';

const GET_POSTS = gql`query GetPosts($page: Int) { posts(page: $page) { edges { node { id title } } } }`;
const CREATE_POST = gql`mutation CreatePost($input: CreatePostInput!) { createPost(input: $input) { id title } }`;

function PostList() {
  const { loading, error, data, fetchMore } = useQuery(GET_POSTS, { variables: { page: 1 } });
  const [createPost] = useMutation(CREATE_POST, { refetchQueries: ['GetPosts'] });

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error.message}</p>;
  return (/* render data.posts.edges */);
}
```

## Subscriptions (Real-Time)
```graphql
type Subscription {
  postCreated: Post!
}
```
```javascript
const { PubSub } = require('graphql-subscriptions');
const pubsub = new PubSub();

Mutation: {
  createPost: async (_, { input }, { dataSources, user }) => {
    const post = await dataSources.posts.create(input);
    pubsub.publish('POST_CREATED', { postCreated: post });
    return post;
  },
},
Subscription: {
  postCreated: { subscribe: () => pubsub.asyncIterator(['POST_CREATED']) },
}
```

## Federation (Microservices)
- `@key` directive for entity references across services
- Gateway: Apollo Gateway composes multiple subgraphs into one schema
- Each service owns its domain data and exposes a subgraph
- `@shareable` for fields shared across services

## Common Mistakes
- ❌ N+1 queries from field resolvers — always use DataLoader
- ❌ Over-fetching in resolvers (querying all DB columns when few needed)
- ❌ Not limiting query depth/complexity (no protection against malicious queries)
- ❌ Returning null without error when a field is missing (return error for unrecoverable)
- ❌ Mixing authentication in resolvers instead of schema directives or context
