---
id: component-patterns
name: Component Patterns
type: internal
description: Reusable component design patterns for building maintainable UIs
tags: frontend, components, patterns, reusability
---

# Component Design Patterns

## Compound Components

Components that work together, sharing implicit state.

**When to Use**
- Related components that must be used together
- Flexible composition without prop drilling
- Parent controls state, children render UI

**Pattern**
```
<Tabs>
  <TabList>
    <Tab>One</Tab>
    <Tab>Two</Tab>
  </TabList>
  <TabPanels>
    <TabPanel>Content one</TabPanel>
    <TabPanel>Content two</TabPanel>
  </TabPanels>
</Tabs>
```

**Benefits**
- Clean, readable API
- Flexible structure
- Implicit state sharing
- Hard to misuse

## Controlled vs Uncontrolled

### Controlled Components
Parent owns the state:
- Value prop + onChange handler
- Parent is single source of truth
- Use for: forms, complex state management

```
<Input value={text} onChange={setText} />
```

### Uncontrolled Components
Component owns the state:
- Default value, refs to access current
- Simpler for isolated form fields
- Use for: simple forms, file inputs

```
<Input defaultValue="initial" ref={inputRef} />
```

### Best Practice
- Prefer controlled for complex forms
- Allow both modes when building reusable components
- Document which mode is expected

## Render Props

Pass a function as prop that returns what to render.

**When to Use**
- Share logic without sharing UI
- Consumer controls rendering
- Multiple render variations needed

**Pattern**
```
<Mouse render={({ x, y }) => (
  <p>Mouse is at {x}, {y}</p>
)} />
```

**Benefits**
- Maximum flexibility
- Explicit data passing
- Reusable logic

**Drawbacks**
- Can be verbose
- Callback hell risk

## Higher-Order Components (HOC)

Function that takes a component and returns enhanced component.

**When to Use**
- Cross-cutting concerns
- Adding common functionality
- Authentication wrappers

**Pattern**
```
const withAuth = (Component) => {
  return (props) => {
    const user = useAuth();
    if (!user) return <Redirect to="/login" />;
    return <Component {...props} user={user} />;
  };
};

const ProtectedPage = withAuth(DashboardPage);
```

**Benefits**
- Reusable enhancement
- Separation of concerns
- Transparent to wrapped component

**Drawbacks**
- Wrapper hell
- Prop name collisions
- Less common now (hooks preferred)

## Custom Hooks

Extract component logic into reusable functions.

**When to Use**
- Logic reused across components
- Complex state logic
- Side effect management

**Pattern**
```
function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : initialValue;
  });

  useEffect(() => {
    localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}
```

**Benefits**
- Clean component code
- Testable in isolation
- Composable

**Naming**
- Always start with `use`
- Describe what it does: `useToggle`, `useDebounce`, `useFetch`

## Provider Pattern

Share data across component tree without prop drilling.

**When to Use**
- App-wide settings (theme, locale)
- Authentication state
- Data needed by many unrelated components

**Pattern**
```
const ThemeContext = createContext();

function ThemeProvider({ children }) {
  const [theme, setTheme] = useState('light');
  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

function useTheme() {
  return useContext(ThemeContext);
}
```

**Guidelines**
- Don't overuse (avoid "context for everything")
- Split contexts by update frequency
- Memoize provider value if object

## Composition Patterns

### Children as Function
```
<DataFetcher url="/api/users">
  {({ data, loading, error }) => (
    loading ? <Spinner /> : <UserList users={data} />
  )}
</DataFetcher>
```

### Slots Pattern
```
<Card
  header={<CardHeader title="Title" />}
  footer={<CardFooter actions={<Button>Save</Button>} />}
>
  <CardContent>Main content here</CardContent>
</Card>
```

### Component as Prop
```
<List
  data={items}
  renderItem={(item) => <ListItem key={item.id} {...item} />}
  EmptyState={<EmptyList />}
/>
```

## State Machines

For complex UI state with defined transitions.

**When to Use**
- Multi-step flows
- Complex async operations
- States with specific allowed transitions

**Pattern**
```
const states = {
  idle: { FETCH: 'loading' },
  loading: { SUCCESS: 'success', ERROR: 'error' },
  success: { FETCH: 'loading', RESET: 'idle' },
  error: { RETRY: 'loading', RESET: 'idle' }
};

function reducer(state, event) {
  return states[state][event] || state;
}
```

**Benefits**
- Impossible states are impossible
- Clear transition rules
- Easy to visualize and debug

## Presentational/Container Split

### Presentational
- Receives everything via props
- No side effects
- Purely renders UI
- Highly reusable

### Container
- Handles data fetching
- Manages state
- Passes data to presentational
- Feature-specific

**Modern Alternative**: Custom hooks extract container logic, making split less necessary.

## Anti-Patterns to Avoid

### Prop Drilling
Passing props through many layers.
**Solution**: Context, composition, or component restructuring

### God Components
Components doing too many things.
**Solution**: Split into focused components

### Premature Abstraction
Creating reusable components before need is clear.
**Solution**: Rule of three—abstract on third use

### Boolean Props Explosion
`<Button primary secondary disabled loading />`
**Solution**: Use variant prop or compound pattern

### Inline Functions (when problematic)
Creating new functions every render.
**Solution**: useCallback for callbacks passed to memoized children

## Choosing a Pattern

| Need | Pattern |
|------|---------|
| Share logic, not UI | Custom Hook |
| Flexible child structure | Compound Components |
| App-wide data | Provider Pattern |
| Cross-cutting concern | HOC |
| Dynamic rendering control | Render Props |
| Complex state transitions | State Machine |
| Multiple render variants | Composition |
