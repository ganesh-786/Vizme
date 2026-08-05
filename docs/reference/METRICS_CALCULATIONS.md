# Metrics Calculations Reference

This document describes how each dashboard metric is calculated and which PromQL functions are used.

## PromQL Functions Used

| Function                | Use Case                                | Example                                     |
| ----------------------- | --------------------------------------- | ------------------------------------------- |
| `increase(metric[24h])` | Counter: total increase over period     | Page views, add to cart, orders             |
| `sum(increase(...))`    | Aggregate across multiple series/labels | When metric has multiple label combinations |
| `max(metric)`           | Gauge: latest value                     | Cart items, cart value                      |
| `count(selector)`       | Count of active time series             | Metric series count                         |

## Why NOT count_over_time for Page Views

`count_over_time(metric[24h])` returns the **number of samples** in the range, not the metric value. For a counter that receives batched updates (e.g. 10 page views in one request = 1 sample with value 10), `count_over_time` would return 1, not 10. **Use `increase()` for counters.**

## Metric Name Variants Supported

| Dashboard Metric | Supported Names                            | Reason                                             |
| ---------------- | ------------------------------------------ | -------------------------------------------------- |
| Page Views       | `page_view`, `page_views`                  | Library uses page_view, tracker.js uses page_views |
| Add to Cart      | `add_to_cart`, `addtocart`                 | Common variants                                    |
| Products Sold    | `products_sold`, `product_sold`            | Singular/plural                                    |
| Revenue          | `total_revenue`, `revenue`, `totalRevenue` | Common naming                                      |

## Backend Rounding

- **Count metrics** (page views, add to cart, orders, etc.): `Math.round()` — Prometheus `increase()` can return fractional values due to extrapolation.
- **Currency** (revenue, cart value): Kept as-is for display; frontend uses `toLocaleString()`.
- **Avg Order Value**: `Math.round(rev / ord)` when ord > 0.

## Verification

Run `./scripts/verify-metrics-calculations.sh <USER_ID>` to compare Mimir PromQL results with the dashboard. Set `MIMIR_DEBUG=1` when starting the backend to log raw query results.

## Worked example: Total Revenue

Total Revenue (24h) shows the sum of completed transaction amounts in the last 24 hours.

**Metric configuration:** name `total_revenue` (or `revenue`, `totalRevenue`), type `counter`.

**When checkout completes**, send the order amount once:

```javascript
// Counter (recommended): increment by order amount
tracker.increment('total_revenue', orderAmount);

// Example: order total is 5000 NPR
tracker.increment('total_revenue', 5000);
```

**Common mistakes:**

1. Sending on every page view — do NOT send `total_revenue` on page load, visibility change, or a timer. Only send when checkout completes.
2. Sending the current cart value repeatedly — do NOT `set('total_revenue', cartValue)` on every cart update; that produces incorrect totals.
3. Sending `cart_value_total` as revenue — `cart_value_total` is the current cart. Revenue is the sum of cart values at checkout completion, which is a different metric.

**Dashboard query:** `increase(user_metric_total_revenue[24h])` — the Prometheus increase over the last 24 hours. This correctly accumulates all order amounts as long as you increment only on checkout.
