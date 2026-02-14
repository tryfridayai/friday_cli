---
id: frontend-architecture
name: Frontend Architecture
type: internal
description: Principles for structuring and organizing frontend applications
tags: frontend, architecture, components, organization
---

# Frontend Architecture Principles

## Component Architecture

### Single Responsibility
Each component should do one thing well:
- **Good**: `UserAvatar`, `SubmitButton`, `SearchInput`
- **Bad**: `UserProfileWithAvatarAndSettingsAndHistory`

### Component Sizing Guidelines
- If a component exceeds 200-300 lines, consider splitting
- If props exceed 7-10, consider restructuring
- If you're scrolling to find things, it's too big

### Component Types

**Presentational Components**
- Concerned with how things look
- Receive data via props
- Rarely have state (maybe UI state)
- Don't know about data fetching

**Container Components**
- Concerned with how things work
- Fetch data, manage state
- Pass data to presentational components
- Handle side effects

**Layout Components**
- Define structural patterns
- Header, Footer, Sidebar, Grid
- Receive children, arrange them
- Don't contain business logic

## State Management Principles

### Where Should State Live?

**Local State** (component):
- Form input values
- UI state (open/closed, active tab)
- Temporary data

**Lifted State** (parent component):
- Shared between siblings
- Needed by multiple children
- Still relatively local

**Global State**:
- User authentication
- App-wide settings
- Data needed by many unrelated components

**Server State** (cached from API):
- List of items from API
- User profile data
- Any data that lives on a server

### State Guidelines

1. **Keep state minimal**: Derive what you can calculate
2. **Colocate state**: Keep it close to where it's used
3. **Normalize complex data**: Avoid deeply nested structures
4. **Single source of truth**: One canonical location per piece of data

### Derived State

Prefer calculating values over storing them:
```
// Instead of storing `fullName`
fullName = firstName + ' ' + lastName

// Instead of storing `isValid`
isValid = email.includes('@') && password.length >= 8

// Instead of storing `totalPrice`
totalPrice = items.reduce((sum, item) => sum + item.price, 0)
```

## Data Flow Patterns

### Unidirectional Data Flow
- Data flows down (parent to child via props)
- Events flow up (child to parent via callbacks)
- Predictable, easier to debug
- Avoid two-way binding complexity

### Props Patterns

**Required vs Optional**
- Required: Essential for component to work
- Optional: Enhancements with sensible defaults

**Prop Drilling Solutions**
- 2-3 levels: Prop drilling is fine
- 4+ levels: Consider context or state management
- Composition: Pass components instead of data

### Event Handling
- Handler functions passed as props
- Naming convention: `onAction` for prop, `handleAction` for handler
- Keep handlers close to state they modify

## Code Organization

### Feature-Based Structure
```
src/
├── features/
│   ├── auth/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── utils/
│   │   └── index.js
│   ├── dashboard/
│   └── settings/
├── shared/
│   ├── components/
│   ├── hooks/
│   └── utils/
└── app/
    ├── routes/
    └── providers/
```

### Colocation Principle
Keep related files together:
- Component + styles + tests in same folder
- Feature-specific hooks with the feature
- Shared code in `shared/` only when truly shared

### Barrel Exports
Use index files for clean imports:
```
// features/auth/index.js
export { LoginForm } from './components/LoginForm'
export { useAuth } from './hooks/useAuth'
```

## Separation of Concerns

### UI vs Logic
- Keep logic in hooks
- Keep UI in components
- Components compose hooks and render UI

### API Layer
- Centralize API calls
- Abstract away implementation details
- Handle errors consistently
- Transform data at the boundary

### Business Logic
- Pure functions when possible
- Testable without UI
- Reusable across components

## Error Handling

### Error Boundaries
- Catch rendering errors
- Show fallback UI
- Log errors for debugging
- Place strategically (not everywhere)

### Async Error Handling
- Always handle promise rejections
- Show user-friendly error messages
- Provide retry mechanisms
- Log for debugging

### Error States
- Every data-fetching component needs error state
- Be specific about what went wrong
- Offer actionable next steps

## Performance Architecture

### Render Optimization
- Minimize unnecessary re-renders
- Memoize expensive calculations
- Virtualize long lists
- Lazy load non-critical components

### Bundle Optimization
- Code split by route
- Lazy load features
- Tree shake unused code
- Monitor bundle size

### Loading Strategy
- Show skeleton/placeholder immediately
- Prioritize above-the-fold content
- Prefetch likely next actions
- Cache aggressively

## Testing Architecture

### Test Pyramid
- Many unit tests (fast, isolated)
- Some integration tests (component interactions)
- Few E2E tests (critical paths only)

### What to Test
- User interactions (clicks, typing)
- Conditional rendering
- Error states
- Loading states
- Edge cases (empty, many items)

### What Not to Test
- Implementation details
- Third-party libraries
- Styles (unless critical)
- Every possible combination

## Maintainability Checklist

- [ ] Components are small and focused
- [ ] State lives in the right place
- [ ] Data flows predictably
- [ ] Code is organized by feature
- [ ] Error states are handled
- [ ] Performance is considered
- [ ] Tests cover critical paths
- [ ] New developer can understand structure
