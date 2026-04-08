# Vizme - Unified Visibility Platform

A lightweight JavaScript library for tracking metrics to your unified visibility platform.

## Installation

```bash
npm install @ganesh/vizme
```

The package is published under the **`@ganesh`** scope on npm (public). Use this scoped name; the unscoped name `vizme` is blocked by npm (similarity with other packages).

## Package entry points

| Use case | Import / path |
|----------|----------------|
| Bundlers (Vite, Webpack, etc.) | `import Vizme from '@ganesh/vizme'` (ESM) or `const { Vizme } = require('@ganesh/vizme')` / `require('@ganesh/vizme').default` (CJS) |
| Script tag (no bundler) | Copy or serve `node_modules/@ganesh/vizme/dist/vizme.js`; exposes `window.Vizme` |

## Quick Start

### Browser (bundler)

```javascript
import Vizme from '@ganesh/vizme';

// Initialize
const tracker = new Vizme({
  apiKey: 'mk_your_api_key_here',
  endpoint: 'http://localhost:3000/api/v1/metrics',
  autoTrack: true // Automatically track page views, errors, performance
});

// Make it globally available
window.vizme = tracker;

// Track custom events
window.vizme.increment('add_to_cart', 1, {
  product_id: '123',
  product_name: 'Product Name'
});
```

### Browser (script tag, no bundler)

Serve or copy `node_modules/@ganesh/vizme/dist/vizme.js` and include:

```html
<script src="/path/to/vizme.js"></script>
<script>
  window.vizme = new Vizme({
    apiKey: 'mk_your_api_key_here',
    endpoint: 'https://api.example.com/api/v1/metrics',
    autoTrack: true
  });
</script>
```

`Vizme` is available as `window.Vizme` after the script loads.

### HTML Attributes (Zero Code)

```html
<button 
  data-vizme-track="add_to_cart"
  data-vizme-value="1"
  data-vizme-label-product-id="123">
  Add to Cart
</button>
```

## API

### `track(name, value, labels)`
Track any metric with a value.

### `increment(name, value, labels)`
Increment a counter metric.

### `decrement(name, value, labels)`
Decrement a gauge metric.

### `set(name, value, labels)`
Set a gauge metric value.

### `flush()`
Force immediate send of batched metrics.

### `getStatus()`
Get current status (queue size, batch size, etc.).

## Auto-Tracking

When `autoTrack: true`, the library automatically tracks:
- Page views
- Page load time
- JavaScript errors
- Web Vitals (FCP, LCP, FID, CLS)
- Scroll depth
- Time on page

## Publishing (maintainers)

1. **Scope**: The package name is `@ganesh/vizme`. Your npm user must match the scope (`ganesh`) or you must be a member of the `@ganesh` org with publish access.
2. **Rename**: To publish under a different user/org, change `"name"` in `package.json` to `@your-npm-username/vizme`, then run `npm publish` from `library/` (`publishConfig.access` is already `public`).
3. **Login**: `npm login` and `npm whoami` before publishing.

## License

MIT
