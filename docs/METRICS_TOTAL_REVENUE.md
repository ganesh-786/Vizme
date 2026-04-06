# Total Revenue Tracking

Total Revenue (24h) shows the sum of completed transaction amounts in the last 24 hours.

## Correct Implementation

**When checkout completes**, send the order amount once:

```javascript
// Counter (recommended): increment by order amount
tracker.increment('total_revenue', orderAmount);

// Example: order total is 5000 NPR
tracker.increment('total_revenue', 5000);
```

## Metric Configuration

Create a metric config:

- **Name**: `total_revenue` (or `revenue`, `totalRevenue`)
- **Type**: `counter`

## Common Mistakes

1. **Sending on every page view** – Do NOT send total_revenue on page load, visibility change, or timer. Only send when checkout completes.

2. **Sending current cart value repeatedly** – Do NOT send `set('total_revenue', cartValue)` on every cart update. That will cause incorrect values.

3. **Sending cart_value_total as revenue** – `cart_value_total` is the current cart. Revenue = sum of cart values at checkout completion.

## Dashboard Query

The dashboard uses `increase(user_metric_total_revenue[24h])` – the Prometheus increase over the last 24 hours. This correctly accumulates all order amounts when you increment only on checkout.
