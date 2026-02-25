# Vizme Enhancement Summary

## What Was Implemented

### 1. Library Enhancements (Lib/vizme.js) — Zero/Minimal Code Tracking

#### DOM Product Context Extraction
- **Attributes:** `data-vizme-product`, `data-vizme-product-id`, `data-vizme-product-name`, `data-vizme-product-category`, `data-vizme-product-price`, `data-vizme-product-currency`
- **Aliases:** `data-product`, `data-product-id`, etc.
- **Zero-code example:**
  ```html
  <div data-vizme-product data-vizme-product-id="123" data-vizme-product-name="Blue Widget"
       data-vizme-product-category="electronics" data-vizme-product-price="29.99">
    <button data-vizme-track="add_to_cart" data-vizme-value="1">Add to Cart</button>
  </div>
  ```

#### Value-from-Element (`data-vizme-value-from`)
- Read value from another element (e.g. quantity input):
  ```html
  <input type="number" id="qty" value="2">
  <button data-vizme-track="add_to_cart" data-vizme-value-from="#qty">Add to Cart</button>
  ```

#### Custom Event (`vizme:track`)
- One-line tracking for dynamic flows:
  ```javascript
  window.dispatchEvent(new CustomEvent('vizme:track', {
    detail: { event: 'add_to_cart', value: 1, product_id: '123', product_name: 'Widget', category: 'electronics', price: '29.99' }
  }));
  ```

#### Dual Attribute Support
- Supports both `data-vizme-track` / `data-vizme-value` / `data-vizme-label-*` and `data-track` / `data-value` / `data-label-*`

#### Schema.org Microdata Fallback
- Automatically extracts product info from `[itemtype*="schema.org/Product"]` when no `data-vizme-product` is found

---

### 2. Grafana User Isolation

#### Backend Grafana Proxy
- **`GET /api/v1/grafana/embed-url`** — Returns signed embed URL (requires JWT). Forces `var-user_id` to the authenticated user.
- **`GET /grafana/*`** — Proxies to Grafana. Validates embed token, sets cookie for subsequent requests, forces `var-user_id` from token.

#### Grafana Configuration
- Anonymous access disabled (`GF_AUTH_ANONYMOUS_ENABLED=false`)
- Subpath: `/grafana` (`GF_SERVER_SERVE_FROM_SUB_PATH=true`)
- Dashboard `user_id` variable: `includeAll: false`, `hide: 2` (locked, not editable)

#### Frontend
- `GrafanaEmbed` fetches embed URL from `/api/v1/grafana/embed-url` and uses it for the iframe
- "Open Full Dashboard" / "Open Grafana" buttons fetch the URL and open in a new tab

---

## How to Proceed

### 1. Run Locally (Without Docker)

1. **Backend:** Ensure `GRAFANA_URL=http://localhost:3001` in `.env`
2. **Grafana:** Run Grafana with:
   ```bash
   GF_SERVER_SERVE_FROM_SUB_PATH=true
   GF_SERVER_ROOT_URL=http://localhost:3001/grafana
   GF_AUTH_ANONYMOUS_ENABLED=false
   ```
3. **Frontend:** `npm run dev` (uses `getApiBaseUrl()` for API)
4. **Library:** Use `Lib/vizme.js` in your client site with `data-vizme-*` attributes

### 2. Run with Docker

1. **docker-compose:** `cd docker && docker compose up`
2. **Backend** uses `GRAFANA_URL=http://grafana:3000` (internal)
3. **Grafana** is configured with subpath and no anonymous access
4. **Frontend** must point to backend (e.g. `VITE_API_BASE_URL=http://localhost:3000`)

### 3. Client Integration (Zero-Code)

**HTML only (no JavaScript):**
```html
<div data-vizme-product data-vizme-product-id="123" data-vizme-product-name="Blue Widget"
     data-vizme-product-category="electronics" data-vizme-product-price="29.99">
  <button data-vizme-track="add_to_cart" data-vizme-value="1">Add to Cart</button>
</div>
```

**Minimal JavaScript (dynamic data):**
```javascript
window.dispatchEvent(new CustomEvent('vizme:track', {
  detail: { event: 'add_to_cart', value: quantity, product_id: id, product_name: name, category, price }
}));
```

### 4. Verify Grafana Isolation

1. Log in as User A
2. Open Dashboard → see embedded Grafana
3. Confirm metrics are only for User A
4. Log in as User B
5. Confirm User B sees only their metrics

### 5. Cookie / SameSite

For the Grafana embed cookie to work:
- Frontend and backend should be on the same site (or configure CORS/credentials)
- `cookieParser` is installed in the backend
- Cookie path: `/grafana`

---

## Files Changed

| File | Changes |
|------|---------|
| `Lib/vizme.js` | Product context, value-from, vizme:track, dual attrs, Schema.org |
| `backend/src/routes/grafana.routes.js` | New: embed-url, proxy middleware |
| `backend/index.js` | cookie-parser, grafana routes |
| `docker/docker-compose.yml` | Grafana subpath, no anonymous |
| `frontend/src/api/grafana.js` | New: getEmbedUrl |
| `frontend/src/components/GrafanaEmbed/index.jsx` | Fetch embed URL from API |
| `frontend/src/pages/Dashboard/index.jsx` | handleOpenGrafana, getEmbedUrl |
| `docker/grafana/dashboards/metrics-dashboard.json` | uid, lock user_id variable |
