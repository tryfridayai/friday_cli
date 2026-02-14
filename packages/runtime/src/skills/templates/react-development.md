---
id: react-development
name: React Development
description: Best practices for React application development
tags: react, frontend, javascript, typescript, components
projectTypes: react, next, gatsby, remix
---

# React Development Best Practices

## Component Design

### Functional Components
- Prefer functional components with hooks over class components
- Use TypeScript for type safety
- Keep components focused and single-purpose

### Component Structure
```
ComponentName/
  index.tsx          # Main component
  ComponentName.tsx  # Component implementation
  ComponentName.test.tsx
  ComponentName.styles.ts  # or .css/.scss
  types.ts           # TypeScript interfaces
```

### Props Best Practices
- Destructure props in function signature
- Use TypeScript interfaces for prop types
- Provide default values for optional props
- Avoid prop drilling - use Context or state management

## Hooks

### Built-in Hooks
- `useState`: Local component state
- `useEffect`: Side effects (data fetching, subscriptions)
- `useContext`: Access context values
- `useMemo`: Memoize expensive computations
- `useCallback`: Memoize callback functions
- `useRef`: Persist values across renders

### Custom Hooks
- Extract reusable logic into custom hooks
- Name hooks with `use` prefix
- Keep hooks focused and composable
- Document hook parameters and return values

### useEffect Best Practices
```javascript
// Always specify dependencies
useEffect(() => {
  // Effect logic
  return () => {
    // Cleanup
  };
}, [dependency1, dependency2]);
```

## State Management

### Local State
- Use `useState` for simple, component-specific state
- Group related state together
- Consider `useReducer` for complex state logic

### Global State Options
- **Context API**: Built-in, good for theme/auth
- **Zustand**: Simple, minimal boilerplate
- **Redux Toolkit**: Mature, good for large apps
- **Jotai/Recoil**: Atomic state management

### State Principles
- Lift state only when needed
- Derive state when possible (don't duplicate)
- Keep state normalized (avoid nested structures)

## Performance Optimization

### Memoization
```javascript
// Memoize expensive components
const MemoizedComponent = React.memo(Component);

// Memoize expensive calculations
const expensiveValue = useMemo(() => compute(a, b), [a, b]);

// Memoize callbacks passed to children
const handleClick = useCallback(() => {
  doSomething(id);
}, [id]);
```

### Code Splitting
```javascript
// Lazy load components
const LazyComponent = React.lazy(() => import('./Component'));

// Use Suspense for loading states
<Suspense fallback={<Loading />}>
  <LazyComponent />
</Suspense>
```

### Avoid Common Pitfalls
- Don't create objects/arrays inline in JSX
- Avoid anonymous functions in render
- Use keys properly in lists (not index unless static)
- Batch state updates when possible

## Styling Approaches

### CSS-in-JS (styled-components, emotion)
```javascript
const Button = styled.button`
  background: ${props => props.primary ? 'blue' : 'gray'};
  padding: 8px 16px;
`;
```

### Tailwind CSS
```jsx
<button className="bg-blue-500 px-4 py-2 rounded hover:bg-blue-600">
  Click me
</button>
```

### CSS Modules
```javascript
import styles from './Button.module.css';
<button className={styles.primary}>Click me</button>
```

## Data Fetching

### React Query / TanStack Query
```javascript
const { data, isLoading, error } = useQuery({
  queryKey: ['todos'],
  queryFn: fetchTodos,
});
```

### SWR
```javascript
const { data, error } = useSWR('/api/data', fetcher);
```

### Best Practices
- Handle loading, error, and empty states
- Implement proper caching strategies
- Use optimistic updates for better UX
- Consider pagination for large datasets

## Testing

### Component Testing (React Testing Library)
```javascript
import { render, screen, fireEvent } from '@testing-library/react';

test('button click updates count', () => {
  render(<Counter />);
  fireEvent.click(screen.getByRole('button'));
  expect(screen.getByText('Count: 1')).toBeInTheDocument();
});
```

### Testing Principles
- Test behavior, not implementation
- Use accessible queries (getByRole, getByLabelText)
- Avoid testing implementation details
- Write integration tests for user flows

## Accessibility

### Essential Practices
- Use semantic HTML elements
- Provide alt text for images
- Ensure keyboard navigation works
- Use ARIA attributes appropriately
- Test with screen readers
- Maintain color contrast ratios

### Focus Management
```javascript
const inputRef = useRef();
useEffect(() => {
  inputRef.current?.focus();
}, []);
```

## Error Handling

### Error Boundaries
```javascript
class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <ErrorFallback />;
    }
    return this.props.children;
  }
}
```

### Async Error Handling
- Use try/catch in async functions
- Display user-friendly error messages
- Log errors for debugging
- Provide retry mechanisms
