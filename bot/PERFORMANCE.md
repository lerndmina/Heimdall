# Dashboard Performance Optimization Guide

This configuration prioritizes **fast page loads** and **responsive user experience**.

## What's Optimized

### ✅ Automatic Optimizations (Already Applied)

1. **Aggressive Image Optimization**
   - Serves modern formats (AVIF, WebP) automatically
   - 30-day cache for images
   - Optimized Discord avatars and Minecraft heads

2. **Smart Caching Strategy**
   - Static assets: Cached forever (immutable)
   - Images: 30-day cache with background refresh
   - Pages: 1-minute cache with 5-minute background refresh
   - API calls: No cache (always fresh data)

3. **Code Splitting**
   - Optimized React Icons, Lucide Icons, date-fns imports
   - Each page loads only what it needs
   - Shared components cached across pages

4. **Production Optimizations**
   - Console logs removed (except errors/warnings)
   - Gzip/Brotli compression enabled
   - ETags for efficient caching
   - Remove powered-by header

5. **Bundle Optimization**
   - Tree-shaking removes unused code
   - Minification reduces file sizes
   - Standalone mode creates minimal production bundle

## Performance Results

### Expected Load Times (Production)

| Metric                   | Target | Notes                    |
| ------------------------ | ------ | ------------------------ |
| First Load JS            | <100KB | Initial page load        |
| Time to Interactive      | <1.5s  | Page becomes interactive |
| Largest Contentful Paint | <2.5s  | Largest element visible  |
| First Contentful Paint   | <1s    | First content visible    |
| Cumulative Layout Shift  | <0.1   | Visual stability         |

### Bundle Size Breakdown

After optimization:

- **Shared chunks**: ~80-100KB (React, Next.js core)
- **Page chunks**: 10-30KB per page (page-specific code)
- **Total First Load**: ~90-130KB gzipped

## Runtime Best Practices

### Code-Level Optimizations

1. **Use React.memo for expensive components**

   ```tsx
   const ExpensiveComponent = React.memo(({ data }) => {
     // Only re-renders when data changes
   });
   ```

2. **Lazy load heavy components**

   ```tsx
   const HeavyChart = dynamic(() => import("./HeavyChart"), {
     loading: () => <Spinner />,
     ssr: false, // Don't render on server
   });
   ```

3. **Virtualize long lists**
   - Use `react-window` or `react-virtualized` for lists >100 items
   - Only renders visible items

4. **Debounce search inputs**
   ```tsx
   const debouncedSearch = useMemo(() => debounce((value) => search(value), 300), []);
   ```

### Data Fetching Patterns

**Good** - Use SWR/React Query with stale-while-revalidate:

```tsx
const { data } = useSWR("/api/users", fetcher, {
  revalidateOnFocus: false,
  dedupingInterval: 10000,
});
```

**Better** - Prefetch on hover:

```tsx
<Link href="/profile" onMouseEnter={() => prefetch('/api/profile')}>
```

**Best** - Server Components for static data:

```tsx
// app/page.tsx (Server Component)
async function Page() {
  const data = await fetchData(); // Runs on server
  return <ClientComponent data={data} />;
}
```

## Monitoring Performance

### Analyze Bundle Size

```bash
npm run build:dashboard:analyze
```

Opens bundle analyzer showing:

- Which packages are largest
- Duplicate dependencies
- Opportunities for code splitting

### Lighthouse Audit

```bash
# Install Lighthouse CLI
npm install -g lighthouse

# Run audit on production build
lighthouse http://localhost:3000 --view
```

### Next.js Built-in Analytics

Production builds show:

```
Route (app)              Size     First Load JS
┌ ƒ /                    142 B   87.4 kB
├ ƒ /[guildId]          3.45 kB  90.8 kB
└ ƒ /dev/migration      8.92 kB  96.3 kB
```

- **Size**: Route-specific code
- **First Load JS**: Total JS needed for that route

## Performance Monitoring (Runtime)

### Web Vitals Tracking

Add to `app/layout.tsx`:

```tsx
import { Analytics } from "@vercel/analytics/react";

export default function Layout({ children }) {
  return (
    <>
      {children}
      <Analytics /> {/* Tracks Core Web Vitals */}
    </>
  );
}
```

### Custom Performance Marks

```tsx
useEffect(() => {
  performance.mark("data-fetch-start");
  fetchData().then(() => {
    performance.mark("data-fetch-end");
    performance.measure("data-fetch", "data-fetch-start", "data-fetch-end");
    console.log(performance.getEntriesByName("data-fetch")[0].duration);
  });
}, []);
```

## Caching Strategy Details

### Static Assets (\_next/static/)

```
Cache-Control: public, max-age=31536000, immutable
```

- Cached for 1 year
- Never changes (filename includes hash)
- Perfect cache hit rate after first load

### Images (\_next/image)

```
Cache-Control: public, max-age=2592000, stale-while-revalidate=86400
```

- Cached for 30 days
- Serves stale for 24 hours while revalidating
- Balances freshness with performance

### Dynamic Pages

```
Cache-Control: public, max-age=60, stale-while-revalidate=300
```

- Cached for 1 minute
- Serves stale for 5 minutes while fetching fresh
- Near-instant page loads for repeat visits

### API Routes

```
Cache-Control: no-cache, must-revalidate
```

- Always fetch fresh data
- Ensures real-time Discord data

## Advanced: CDN Integration

### Cloudflare Setup

1. Add site to Cloudflare
2. Enable "Cache Everything" page rule for `/_next/static/*`
3. Set Browser Cache TTL to "Respect Existing Headers"
4. Enable Polish (image optimization)
5. Enable Brotli compression

### Redis Caching (Bot API)

Already configured in bot. API responses cached in Redis:

- Reduces database load
- Sub-millisecond response times
- Automatic invalidation

## Database Query Optimization

Since dashboard fetches from bot API, optimize bot MongoDB queries:

**Add indexes for common queries:**

```typescript
// In plugin models
ModmailSchema.index({ guildId: 1, status: 1, lastActivity: -1 });
TagSchema.index({ guildId: 1, name: "text" }); // Text search
```

**Use projections to reduce data transfer:**

```typescript
Modmail.find({ guildId })
  .select("userId status lastActivity -_id") // Only needed fields
  .lean(); // Skip Mongoose overhead
```

## When to Invalidate Cache

Auto-revalidation happens, but force refresh after:

- User creates/updates data (mutate SWR cache)
- Bot events (use EventEmitter to broadcast)
- Configuration changes (invalidate via API)

```tsx
// Optimistic update + revalidate
mutate(
  "/api/users",
  async () => {
    await updateUser(data);
    return newData;
  },
  { revalidate: true },
);
```

## Troubleshooting Slow Pages

### 1. Check Bundle Size

```bash
npm run build:dashboard:analyze
```

Look for:

- Large packages that could be lazy loaded
- Duplicate packages (fix with npm dedupe)
- Unused dependencies

### 2. Profile React Rendering

```tsx
// Use React DevTools Profiler
<Profiler id="UserList" onRender={onRenderCallback}>
  <UserList />
</Profiler>
```

### 3. Network Waterfall

- Open DevTools → Network tab
- Look for sequential API calls (should be parallel)
- Check for large payloads (paginate or compress)

### 4. Memory Leaks

- Check DevTools → Performance → Memory
- Profile over time to find growing memory
- Common culprits: setInterval, event listeners, subscriptions

## Quick Wins Checklist

- [ ] Images use `<Image>` component (automatic optimization)
- [ ] Heavy components are lazy loaded with `dynamic()`
- [ ] API calls use SWR/React Query (caching + deduplication)
- [ ] Long lists use virtualization
- [ ] Search inputs are debounced (300ms+)
- [ ] Expensive calculations use `useMemo`
- [ ] Event handlers use `useCallback`
- [ ] No unnecessary re-renders (check with React DevTools)
- [ ] Database queries have indexes
- [ ] Bundle analyzed for bloat

## Further Reading

- [Next.js Performance Docs](https://nextjs.org/docs/app/building-your-application/optimizing)
- [Web.dev Performance](https://web.dev/performance/)
- [React Performance Optimization](https://react.dev/learn/render-and-commit)
- [Core Web Vitals](https://web.dev/vitals/)
