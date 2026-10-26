# State Management Patterns

## Choosing the Right Tool
| Pattern | Best For | Examples |
|---------|----------|----------|
| Local state | Component-scoped UI state | `useState`, `useReducer` |
| Context + hooks | Simple global state, theme, auth | React Context |
| Atomic state | Complex global state with granular subscriptions | Zustand, Jotai, Signals |
| Flux-based | Large apps with predictable state history | Redux Toolkit, Pinia |
| Server state | API data caching, refetching, optimistic updates | TanStack Query, SWR, Apollo |

## Zustand
```javascript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useStore = create(
  persist(
    (set, get) => ({
      user: null,
      notifications: [],
      setUser: (user) => set({ user }),
      addNotification: (n) => set((state) => ({ notifications: [...state.notifications, n] })),
      clearNotifications: () => set({ notifications: [] }),
      logout: () => set({ user: null, notifications: [] }),
    }),
    { name: 'app-storage' }
  )
);

// In component
function UserMenu() {
  const user = useStore((state) => state.user);
  const logout = useStore((state) => state.logout);
  return <button onClick={logout}>{user.name} — Logout</button>;
}
```
- Zustand selectors prevent unnecessary re-renders (subscribe to only what you need)
- Sub-stores with `create` for different domains (userStore, notificationStore)
- Middleware: `persist`, `immer` (mutable syntax), `devtools` (Redux DevTools support)

## Redux Toolkit
```javascript
import { createSlice, configureStore } from '@reduxjs/toolkit';

const userSlice = createSlice({
  name: 'user',
  initialState: { data: null, loading: false },
  reducers: {
    setUser: (state, action) => { state.data = action.payload; },
    setLoading: (state, action) => { state.loading = action.payload; },
  },
});

const store = configureStore({
  reducer: { user: userSlice.reducer },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(logger),
});

export const { setUser, setLoading } = userSlice.actions;
export default store;

// In component
function Profile() {
  const dispatch = useDispatch();
  const user = useSelector((state) => state.user.data);
  return <button onClick={() => dispatch(setUser({ name: 'John' }))}>Update</button>;
}
```
- Use `createSlice` — never write reducers/actions manually
- RTK Query for server state (built-in caching, code generation)
- `createAsyncThunk` for async actions with loading/error states

## TanStack Query (Server State)
```javascript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

function Posts() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['posts', { page: 1 }],
    queryFn: () => fetch('/api/posts?page=1').then(r => r.json()),
    staleTime: 5 * 60 * 1000,  // 5 min before refetch
    cacheTime: 30 * 60 * 1000,  // 30 min in cache
  });

  const mutation = useMutation({
    mutationFn: (newPost) => fetch('/api/posts', { method: 'POST', body: JSON.stringify(newPost) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['posts'] }),
  });

  if (isLoading) return <p>Loading...</p>;
  return (/* render */);
}
```

## Signals (Preact Signals, Angular Signals)
```javascript
import { signal, computed, effect } from '@preact/signals-react';

const count = signal(0);
const double = computed(() => count.value * 2);

effect(() => console.log('Count:', count.value));

// In component
function Counter() {
  return <button onClick={() => count.value++}>{double}</button>;
}
```

## Context + useReducer
```javascript
const UserContext = createContext();
function UserProvider({ children }) {
  const [state, dispatch] = useReducer(userReducer, initialState);
  return <UserContext.Provider value={{ state, dispatch }}>{children}</UserContext.Provider>;
}
function useUser() {
  const context = useContext(UserContext);
  if (!context) throw new Error('useUser must be used within UserProvider');
  return context;
}
```

## Common Mistakes
- ❌ Putting everything in global state — most state should be local
- ❌ Not normalizing data in Redux (deeply nested state is hard to update)
- ❌ Over-fetching in TanStack Query — set `staleTime` per query
- ❌ Mixing server state and UI state in the same store
- ❌ Mutating state directly (use Immer or spread operators)
