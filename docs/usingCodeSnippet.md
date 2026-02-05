# Metrics Workflow: Code Snippet Method (tracker.js)

This document explains how metrics are configured, collected, and sent to the backend when using the code snippet method (tracker.js).

## Overview

When clients use the code snippet method, they paste a small JavaScript snippet into their website. This snippet automatically loads the full tracking library from your server, which already has all their metric configurations embedded in it.

## Step-by-Step Workflow

### Step 1: Client Configures Metrics (Admin Website)

1. Client logs into your admin website
2. Client creates metric configurations:
   - Defines metric names (e.g., "page_views", "button_clicks")
   - Chooses metric types (counter, gauge, histogram, summary)
   - Sets default labels if needed
3. These configurations are saved in the database (`metric_configs` table)

**Example:**
- Metric name: `page_views`
- Type: `counter`
- Labels: `{ "page": "home" }`

### Step 2: Client Generates Code Snippet

1. Client goes to the code generation page
2. Client selects:
   - An API key (to identify their account)
   - Auto-track settings (enable/disable automatic tracking)
   - Custom events settings (enable/disable HTML attribute tracking)
3. Backend generates a small snippet (~150 bytes)

**Backend Process (`codeGeneration.routes.js`):**
- Validates the API key belongs to the user
- Calls `generateMinimalSnippet()` function
- Returns a tiny JavaScript snippet

**The snippet looks like this:**
```javascript
(function(w,d,s,l,i){
  w[l]=w[l]||[];
  w[l].push({'start':Date.now()});
  var f=d.getElementsByTagName(s)[0],
      j=d.createElement(s);
  j.async=true;
  j.src='http://localhost:3000/api/v1/tracker.js?k=API_KEY&a=1&c=1';
  f.parentNode.insertBefore(j,f);
})(window,document,'script','metricsTracker');
```

### Step 3: Client Pastes Snippet into Their Website

1. Client copies the generated snippet
2. Client pastes it into their HTML (usually in the `<head>` or before `</body>`)
3. When the page loads, the snippet runs automatically

**What happens:**
- The snippet creates a `<script>` tag
- The script tag loads `/api/v1/tracker.js` from your server
- The URL includes the API key and settings as query parameters

### Step 4: Server Generates Full Library Code

When the browser requests `/api/v1/tracker.js`, the server:

**Backend Process (`tracker.routes.js`):**

1. **Validates API Key:**
   - Extracts API key from query parameter `k`
   - Checks if API key exists and is active in database
   - Gets the user ID associated with the API key

2. **Fetches Metric Configurations:**
   - Queries database: `SELECT metric_name, metric_type, labels FROM metric_configs WHERE user_id = ?`
   - Gets all metric configs for that user
   - Converts labels from array format to object format

3. **Builds Configuration Object:**
   ```javascript
   {
     "page_views": { t: "counter", l: { "page": "home" } },
     "button_clicks": { t: "counter", l: {} }
   }
   ```

4. **Generates Full Library Code:**
   - Calls `generateLibraryCode()` function
   - Embeds API key, endpoint URL, and metric configs directly into the code
   - Creates a minified, self-contained JavaScript file

5. **Returns the Code:**
   - Sets proper headers (Content-Type, Cache-Control)
   - Sends the generated JavaScript code to the browser

**The generated code includes:**
- API key (embedded)
- Endpoint URL (where to send metrics)
- All metric configurations (embedded)
- Auto-tracking code (if enabled)
- Custom event tracking code (if enabled)
- Batching and queuing logic
- Retry logic

### Step 5: Library Runs in Browser

Once the full library code loads in the browser:

1. **Initialization:**
   - Library reads the embedded configuration
   - Sets up batching (collects metrics before sending)
   - Sets up queuing (stores failed requests for retry)
   - Starts auto-tracking if enabled

2. **Auto-Tracking (if enabled):**
   - Tracks page views automatically
   - Tracks page load time
   - Tracks JavaScript errors
   - Tracks performance metrics (FCP, LCP, FID, CLS)
   - Tracks time on page

3. **Custom Event Tracking (if enabled):**
   - Listens for clicks on elements with `data-track` attribute
   - Listens for form submissions with `data-track` attribute
   - Automatically tracks these events

### Step 6: Metrics Are Collected

Metrics can be collected in three ways:

**A. Auto-Tracking:**
- Library automatically tracks events (page views, errors, performance)
- No code needed from client

**B. HTML Attributes:**
```html
<button data-track="button_click" data-value="1">Click Me</button>
```

**C. JavaScript API:**
```javascript
window.MetricsTracker.track('custom_event', 1, { label: 'value' });
window.MetricsTracker.increment('counter_name', 1);
window.MetricsTracker.decrement('gauge_name', 1);
```

**What happens when a metric is tracked:**
1. Library checks if metric name exists in embedded configs
2. If found, uses the configured type and labels
3. If not found, uses default type (gauge) or method default
4. Adds metric to batch array
5. When batch reaches size limit (default: 10), triggers send

### Step 7: Metrics Are Batched and Sent

**Batching Process:**
1. Metrics are added to a batch array
2. When batch reaches 10 metrics (or timer expires after 5 seconds), batch is sent
3. If send fails, metrics go to queue for retry

**Sending Process (`sendMetrics` function in generated code):**
1. Takes all metrics from batch
2. Formats them as JSON:
   ```json
   {
     "metrics": [
       {
         "name": "page_views",
         "type": "counter",
         "value": 1,
         "labels": { "page": "/home" }
       }
     ]
   }
   ```
3. Sends POST request to `/api/v1/metrics`:
   - Method: POST
   - Headers: `Content-Type: application/json`, `X-API-Key: [embedded key]`
   - Body: JSON with metrics array
   - Uses `fetch` with `keepalive: true` for reliability

### Step 8: Backend Receives and Processes Metrics

**Backend Process (`metrics.routes.js`):**

1. **Authentication:**
   - `authenticateApiKey` middleware validates the API key
   - Extracts user ID from API key
   - Sets `req.user.id`

2. **Validation:**
   - Validates request body structure
   - Checks each metric has required fields (name, type, value)
   - Validates metric types are valid
   - Validates metric values are numbers

3. **Processing:**
   - Loops through each metric
   - Validates metric value based on type (e.g., counters can't be negative)
   - Calls `recordMetric()` for each valid metric

4. **Recording (`metrics.service.js`):**
   - Gets or creates Prometheus metric instance
   - Adds `user_id` to labels
   - Records metric based on type:
     - **Counter:** Increments value
     - **Gauge:** Sets, increments, or decrements based on operation
     - **Histogram:** Observes value
     - **Summary:** Observes value
   - Stores in Prometheus registry

5. **Response:**
   - Returns success response with count of processed metrics
   - Includes any errors for invalid metrics

### Step 9: Metrics Available for Prometheus

1. Metrics are stored in Prometheus registry
2. Prometheus server scrapes `/metrics` endpoint
3. Metrics are available in Grafana dashboards

## Key Points

- **No manual config needed:** All metric configs are embedded in the generated library code
- **Automatic updates:** When client updates configs, they need to clear browser cache or wait for cache expiry (1 hour)
- **Zero code tracking:** Clients can track metrics using just HTML attributes
- **Reliable:** Batching, queuing, and retry logic ensure metrics aren't lost
- **Fast:** Small snippet loads quickly, full library loads asynchronously

## Flow Diagram

```
Client Website                    Your Backend                    Database
     |                                 |                              |
     | 1. Paste snippet                |                              |
     |-------------------------------->|                              |
     |                                 |                              |
     | 2. Request tracker.js           |                              |
     |-------------------------------->|                              |
     |                                 | 3. Validate API key          |
     |                                 |------------------------------>|
     |                                 | 4. Fetch metric configs       |
     |                                 |------------------------------>|
     |                                 |<------------------------------|
     |                                 |                              |
     | 5. Receive full library code    |                              |
     |<--------------------------------|                              |
     |                                 |                              |
     | 6. Track metrics                |                              |
     |    (auto or manual)             |                              |
     |                                 |                              |
     | 7. Send batched metrics         |                              |
     |-------------------------------->|                              |
     |                                 | 8. Process & store           |
     |                                 |------------------------------>|
     |                                 |                              |
     | 9. Success response             |                              |
     |<--------------------------------|                              |
```

