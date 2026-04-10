# Vizme - Unified Visibility Platform

A lightweight JavaScript library for tracking metrics to your unified visibility platform.

## Installation

```bash
npm install visualizemet
```

The package is published on npm as **`visualizemet`** (public).

## Package entry points

| Use case | Import / path |
|----------|----------------|
| Bundlers (Vite, Webpack, etc.) | `import Vizme from 'visualizemet'` (ESM) or `const { Vizme } = require('visualizemet')` / `require('visualizemet').default` (CJS) |
| Script tag (no bundler) | Copy or serve `node_modules/visualizemet/dist/vizme.js`; exposes `window.Vizme` |

## Quick Start

### Browser (bundler)

```javascript
import Vizme from 'visualizemet';

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

Serve or copy `node_modules/visualizemet/dist/vizme.js` and include:

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

1. **Package name**: The package name is `visualizemet`.
2. **Rename**: To publish under a different name, change `"name"` in `package.json`, then run `npm publish` from `library/` (`publishConfig.access` is already `public`).
3. **Login**: `npm login` and `npm whoami` before publishing.

## License

MIT
