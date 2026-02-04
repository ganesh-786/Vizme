# Vizme - Unified Visibility Platform

A lightweight JavaScript library for tracking metrics to your unified visibility platform.

## Installation

```bash
npm install vizme
```

## Quick Start

### Browser

```javascript
import Vizme from 'vizme';

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

## License

MIT