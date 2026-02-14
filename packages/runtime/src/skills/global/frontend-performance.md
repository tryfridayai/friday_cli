---
id: frontend-performance
name: Frontend Performance
type: internal
description: Techniques for optimizing frontend application performance
tags: frontend, performance, optimization, loading
---

# Frontend Performance Optimization

## Rendering Performance

### Avoid Unnecessary Re-renders

**Problem**: Component re-renders when it doesn't need to.

**Solutions**:
1. **Memoize components**: Only re-render when props change
2. **Memoize calculations**: Cache expensive computations
3. **Stable references**: Don't create new objects/arrays/functions on each render
4. **Split components**: Isolate frequently changing parts

### Stable References

**Problem**: New object/array/function created every render causes child re-renders.

**Before**:
```javascript
// New object every render
<UserProfile style={{ margin: 10 }} />

// New array every render
<List items={items.filter(x => x.active)} />

// New function every render
<Button onClick={() => handleClick(id)} />
```

**After**:
```javascript
// Stable reference
const style = useMemo(() => ({ margin: 10 }), []);
<UserProfile style={style} />

// Memoized computation
const activeItems = useMemo(() => items.filter(x => x.active), [items]);
<List items={activeItems} />

// Memoized callback
const handleClickMemo = useCallback(() => handleClick(id), [id]);
<Button onClick={handleClickMemo} />
```

### When to Memoize

**DO memoize**:
- Expensive calculations
- Values passed to memoized children
- Callbacks passed to memoized children
- Context values

**DON'T memoize**:
- Simple calculations
- Primitive values
- Everything "just in case"

## List Performance

### Virtualization

Render only visible items for long lists.

**When to Use**:
- Lists with 100+ items
- Complex list items
- Infinite scroll

**Technique**:
- Render window of visible items
- Placeholder divs for scroll height
- Recycle DOM nodes as user scrolls

### Key Props

**Always use stable, unique keys**:
- Good: Database IDs, unique identifiers
- Bad: Array index (unless list is static)

**Why it matters**:
- Correct keys = efficient DOM updates
- Wrong keys = state bugs, poor performance

### List Optimization Checklist
- [ ] Virtualize if > 100 items
- [ ] Stable, unique keys
- [ ] Memoize list items
- [ ] Avoid inline objects in item props
- [ ] Consider pagination over infinite scroll

## Loading Performance

### Critical Rendering Path

**Goal**: Display meaningful content as fast as possible.

**Strategies**:
1. Inline critical CSS in `<head>`
2. Defer non-critical CSS
3. Load above-the-fold content first
4. Preload important resources
5. Async/defer scripts

### Code Splitting

**Split by**:
- Routes (most common)
- Features (heavy components)
- Libraries (large dependencies)

**Techniques**:
- Dynamic imports: `import('./Component')`
- Route-based splitting
- Component lazy loading

### Lazy Loading

**Images**:
- Use `loading="lazy"` attribute
- Intersection Observer for custom behavior
- Placeholder while loading

**Components**:
- Load on demand
- Show fallback during load
- Preload on hover/likely navigation

### Prefetching

**Strategies**:
- Prefetch links on hover
- Prefetch likely next pages
- Prefetch during idle time
- DNS prefetch for external domains

## Bundle Optimization

### Bundle Analysis

**What to look for**:
- Large dependencies
- Duplicate packages
- Unused code
- Unminified code

### Reducing Bundle Size

1. **Tree shaking**: Import only what you need
2. **Code splitting**: Don't load everything upfront
3. **Smaller alternatives**: lodash → lodash-es, moment → date-fns
4. **Externalize**: CDN for large, stable libraries
5. **Compression**: Gzip/Brotli

### Import Best Practices

**Instead of**:
```javascript
import _ from 'lodash'; // Imports everything
```

**Do**:
```javascript
import debounce from 'lodash/debounce'; // Only what you need
```

## Network Performance

### Caching Strategies

**Static Assets**:
- Long cache times (1 year)
- Content-based file names for cache busting
- Service worker for offline support

**API Responses**:
- Cache-Control headers
- ETag for conditional requests
- Client-side cache (SWR pattern)

### Data Fetching

**Patterns**:
- **Stale-While-Revalidate**: Show cached, fetch fresh in background
- **Optimistic Updates**: Update UI before server confirms
- **Request Deduplication**: Don't fetch same data twice

**Best Practices**:
- Fetch early, not on render
- Parallel fetching when possible
- Cache aggressively
- Show stale data while loading fresh

## Runtime Performance

### Animation Performance

**60fps Target**: 16.67ms per frame

**Performant Properties**:
- transform
- opacity

**Avoid Animating**:
- width, height
- top, left, bottom, right
- margin, padding

**Technique**:
- Use CSS transforms for movement
- Use opacity for show/hide
- Use `will-change` sparingly

### Debouncing & Throttling

**Debounce**: Wait for pause in events
- Use for: Search input, window resize, form validation

**Throttle**: Limit event frequency
- Use for: Scroll events, mouse move, real-time updates

### Web Workers

**Use for**:
- Heavy calculations
- Data processing
- Tasks that would block main thread

**Keep on main thread**:
- DOM manipulation
- Anything requiring quick user feedback

## Measurement & Monitoring

### Key Metrics

**Core Web Vitals**:
- **LCP** (Largest Contentful Paint): Loading performance
- **FID** (First Input Delay): Interactivity
- **CLS** (Cumulative Layout Shift): Visual stability

**Other Important Metrics**:
- Time to First Byte (TTFB)
- First Contentful Paint (FCP)
- Time to Interactive (TTI)

### Tools

**Development**:
- Browser DevTools Performance panel
- React DevTools Profiler
- Lighthouse

**Production**:
- Real User Monitoring (RUM)
- Web Vitals API
- Error tracking

### Performance Budget

Set limits and enforce:
- Max bundle size: 200KB gzipped
- Max LCP: 2.5s
- Max FID: 100ms
- Max CLS: 0.1

## Quick Wins Checklist

- [ ] Compress images, use modern formats (WebP, AVIF)
- [ ] Enable gzip/brotli compression
- [ ] Set appropriate cache headers
- [ ] Lazy load below-fold images
- [ ] Code split by route
- [ ] Remove unused dependencies
- [ ] Virtualize long lists
- [ ] Debounce expensive operations
- [ ] Use production builds
- [ ] Measure before and after optimizations
