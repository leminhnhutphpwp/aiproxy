# React Native Development

## Project Setup
- Use Expo for new projects — it handles tooling, builds, and OTA updates
- Bare React Native CLI only when you need native modules not supported by Expo
- `npx create-expo-app@latest MyApp --template blank-typescript`
- Use `expo-dev-client` for custom native modules while keeping Expo tooling

## Component Architecture
```jsx
// Functional component with hooks (avoid class components)
function UserProfile({ userId }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchUser(userId).then(u => { setUser(u); setLoading(false); });
  }, [userId]);

  if (loading) return <ActivityIndicator />;
  return <View><Text>{user.name}</Text></View>;
}
```
- One component per file — named export, not default
- Extract reusable logic into custom hooks: `useUser()`, `useLocation()`, `useCamera()`
- Keep render methods simple — extract sub-components

## Navigation (React Navigation)
```jsx
const Stack = createNativeStackNavigator();
function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Profile" component={ProfileScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```
- Use `NativeStackNavigator` over `StackNavigator` for performance
- Tab navigator for primary navigation tabs
- Deep linking: configure `linking` prop on `NavigationContainer`
- Pass params via `navigation.navigate('Profile', { userId: 1 })`

## State Management
- Local state: `useState`, `useReducer`
- Global state: React Context for simple, Zustand for complex
- Server state: TanStack React Query (data fetching, caching, refetching)
- AsyncStorage for persisted local data (key-value)
- Expo SQLite for structured local data

## Styling
```jsx
const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
});
```
- Use `StyleSheet.create()` — validates and optimizes styles
- `flex: 1` to fill available space (column direction by default)
- Platform-specific styles: `Platform.OS === 'ios' ? ... : ...`
- Use Tailwind CSS classes via NativeWind for utility-first approach
- Avoid inline styles — use StyleSheet for performance

## List Performance
```jsx
<FlatList
  data={items}
  renderItem={({ item }) => <ItemComponent item={item} />}
  keyExtractor={item => item.id}
  getItemLayout={(_, index) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index })}
  windowSize={5}
  removeClippedSubviews={true}
/>
```
- Use `FlatList` or `SectionList` for lists — never `map()` inside `<ScrollView>`
- `getItemLayout` for fixed-height items (no measurement needed)
- `windowSize` controls how many pages offscreen render (default 21)
- `removeClippedSubviews` for long lists with simple items

## Gestures & Animations
```jsx
import { GestureHandlerRootView, PanGestureHandler } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
```

## Networking
- Use `fetch` or `axios` — no jQuery.ajax
- TanStack React Query for API caching and refetching
- Interceptors for auth token injection and error handling
- Always handle network errors with user-facing messages

## Device APIs (Expo)
- Camera: `expo-camera`
- Location: `expo-location`
- Notifications: `expo-notifications`
- Image picker: `expo-image-picker`
- File system: `expo-file-system`
- Haptics: `expo-haptics`

## Build & Release
- Expo EAS Build for CI/CD: `eas build --platform all --profile production`
- TestFlight (iOS) and internal testing (Android) before production
- OTA updates: `expo-updates` for JS bundle updates without app store review
- Versioning: match `version` in app.json with native version codes

## Common Mistakes
- ❌ Using `<ScrollView>` for long lists (renders all items) — use `<FlatList>`
- ❌ Ignoring safe area insets — use `SafeAreaView` or `expo-status-bar`
- ❌ Not memoizing callbacks in FlatList (re-renders all items)
- ❌ Platform-specific code without fallbacks (crashes on one platform)
- ❌ Heavy animations on the JS thread — use Reanimated for UI thread animations
