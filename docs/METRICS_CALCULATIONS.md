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
