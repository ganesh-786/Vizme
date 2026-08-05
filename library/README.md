# Vizme - Unified Visibility Platform

A lightweight JavaScript library for tracking metrics to your unified visibility platform.

## Installation

```bash
npm install visualizemet
```

The package is published on npm as **`visualizemet`** (public).

## Package entry points

| Use case                       | Import / path                                                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Bundlers (Vite, Webpack, etc.) | `import Vizme from 'visualizemet'` (ESM) or `const { Vizme } = require('visualizemet')` / `require('visualizemet').default` (CJS) |
| Script tag (no bundler)        | Copy or serve `node_modules/visualizemet/dist/vizme.js`; exposes `window.Vizme`                                                   |

## Quick Start

### Browser (bundler)

```javascript
import Vizme from 'visualizemet';

// Initialize
const tracker = new Vizme({
  apiKey: 'mk_your_api_key_here',
  endpoint: 'http://localhost:3000/api/v1/metrics',
  autoTrack: true, // Automatically track page views, errors, performance
});

// Make it globally available
window.vizme = tracker;

// Track custom events
window.vizme.increment('add_to_cart', 1, {
  product_id: '123',
  product_name: 'Product Name',
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
    autoTrack: true,
  });
</script>
```

`Vizme` is available as `window.Vizme` after the script loads.

### HTML Attributes (Zero Code)

```html
<button data-vizme-track="add_to_cart" data-vizme-value="1" data-vizme-label-product-id="123">
  Add to Cart
</button>
```

`data-vizme-value-from` reads the value from another element instead of a fixed attribute — handy
for things like a quantity input next to an "Add to cart" button:

```html
<input type="number" id="qty" value="2" />
<button data-vizme-track="add_to_cart" data-vizme-value-from="#qty">Add to Cart</button>
```

#### Product context

Wrap a tracked element in a container carrying `data-vizme-product*` attributes (or their
`data-product*` aliases) and the library automatically attaches that product's context —
id/name/category/price/currency — to any tracking event fired from inside it:

```html
<div
  data-vizme-product
  data-vizme-product-id="123"
  data-vizme-product-name="Blue Widget"
  data-vizme-product-category="electronics"
  data-vizme-product-price="29.99"
>
  <button data-vizme-track="add_to_cart" data-vizme-value="1">Add to Cart</button>
</div>
```

If no `data-vizme-product` container is present, the library falls back to reading
[Schema.org Product microdata](https://schema.org/Product) (`[itemtype*="schema.org/Product"]`)
from the nearest ancestor, so sites that already mark up products for SEO get product context for
free.

#### `vizme:track` custom event (dynamic flows)

For events that don't map cleanly to a static DOM element (e.g. dispatched from a framework
component after an async action), dispatch a `CustomEvent` instead of using `data-*` attributes:

```javascript
window.dispatchEvent(
  new CustomEvent('vizme:track', {
    detail: {
      event: 'add_to_cart',
      value: 1,
      product_id: '123',
      product_name: 'Widget',
      category: 'electronics',
      price: '29.99',
    },
  })
);
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
