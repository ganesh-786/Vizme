# Metrics Workflow: NPM Package Method

This document explains how metrics are configured, collected, and sent to the backend when using the NPM package method (direct library installation).

## Overview

When clients use the NPM package method, they install the library as a package and initialize it in their code. The library can fetch metric configurations dynamically from your server, or clients can provide them manually.

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

### Step 2: Client Installs Library

1. Client installs the library via npm:
   ```bash
   npm install vizme
   ```

2. Client imports the library in their code:
   ```javascript
   import Vizme from 'vizme';
   // or
   const Vizme = require('vizme');
   ```

### Step 3: Client Initializes Library

Client creates a new Vizme instance with their API key and endpoint:

```javascript
const tracker = new Vizme({
  apiKey: 'mk_your_api_key_here',
  endpoint: 'http://localhost:3000/api/v1/metrics',
  autoTrack: true,           // Enable auto-tracking
  autoFetchConfigs: true,    // Fetch configs from server
  batchSize: 10,            // Send metrics in batches of 10
  flushInterval: 5000       // Send every 5 seconds
});
```

**What happens during initialization:**

1. **VizmeClient is created:**
   - Stores API key, endpoint, and settings
   - Initializes batch array (temporary storage)
   - Initializes queue array (for failed requests)
   - Starts flush timer (sends metrics periodically)

2. **Config Fetching (if `autoFetchConfigs: true`):**
   - Library calls `fetchMetricConfigs()` method
   - Makes GET request to `/api/v1/metric-configs/by-api-key`
   - Sends API key in `X-API-Key` header

### Step 4: Backend Returns Metric Configurations

**Backend Process (`metricconfig.routes.js` - `/by-api-key` endpoint):**

1. **Authentication:**
   - `authenticateApiKey` middleware validates the API key
   - Extracts user ID from API key
   - Sets `req.user.id`

2. **Fetch Configurations:**
   - Queries database: `SELECT metric_name, metric_type, labels FROM metric_configs WHERE user_id = ?`
   - Gets all metric configs for that user

3. **Format Response:**
   - Converts labels from array format to object format
   - Returns configs in library-compatible format:
     ```json
     {
       "success": true,
       "data": {
         "page_views": {
           "type": "counter",
           "labels": { "page": "home" }
         },
         "button_clicks": {
           "type": "counter",
           "labels": {}
         }
       }
     }
     ```

4. **Library Receives Configs:**
   - Library updates `client.metricConfigs` with fetched configs
   - Now library knows which metrics exist and their types

**Alternative: Manual Configs**

If client doesn't want to fetch configs, they can provide them manually:

```javascript
const tracker = new Vizme({
  apiKey: 'mk_...',
  endpoint: 'http://localhost:3000/api/v1/metrics',
  metricConfigs: {
    'page_views': { type: 'counter', labels: {} },
    'button_clicks': { type: 'counter', labels: {} }
  },
  autoFetchConfigs: false  // Don't fetch from server
});
```

### Step 5: Library Sets Up Auto-Tracking (if enabled)

If `autoTrack: true`, library initializes AutoTracker:

1. **Listens for page load:**
   - Tracks page views
   - Tracks page load time
   - Tracks TTFB (Time to First Byte)
   - Tracks DOM content loaded time

2. **Listens for performance events:**
   - Tracks FCP (First Contentful Paint)
   - Tracks LCP (Largest Contentful Paint)
   - Tracks FID (First Input Delay)
   - Tracks CLS (Cumulative Layout Shift)

3. **Listens for errors:**
   - Tracks JavaScript errors
   - Tracks unhandled promise rejections

4. **Tracks time on page:**
   - Records time spent on page when user leaves

### Step 6: Metrics Are Collected

Metrics can be collected in three ways:

**A. Auto-Tracking:**
- Library automatically tracks events (no code needed)

**B. Manual Tracking:**
```javascript
// Track any metric
tracker.track('custom_event', 1, { label: 'value' });

// Increment counter or gauge
tracker.increment('page_views', 1, { page: '/home' });

// Decrement gauge
tracker.decrement('available_slots', 1, { resource: 'database' });

// Set gauge to specific value
tracker.set('temperature', 25, { location: 'server-room' });
```

**C. HTML Attributes (if custom events enabled):**
```html
<button data-vizme-track="button_click" data-vizme-value="1">
  Click Me
</button>
```

**What happens when a metric is tracked:**

1. **Library checks configuration:**
   - Looks up metric name in `metricConfigs`
   - If found, uses configured type and default labels
   - If not found, uses default type based on method (gauge for track, counter for increment, etc.)

2. **Creates metric object:**
   ```javascript
   {
     name: "page_views",
     type: "counter",  // from config or default
     value: 1,
     labels: { "page": "/home" },
     operation: "increment"  // for gauge operations
   }
   ```

3. **Adds to batch:**
   - Metric is added to `batch` array
   - If batch reaches `batchSize` (default: 10), triggers flush
   - Otherwise, waits for flush timer (default: 5 seconds)

### Step 7: Metrics Are Batched and Sent

**Batching Process:**

1. **Automatic Flush:**
   - Flush timer runs every 5 seconds (configurable)
   - When timer fires, sends all metrics in batch

2. **Size-Based Flush:**
   - When batch reaches 10 metrics (configurable), immediately sends

3. **Manual Flush:**
   - Client can call `tracker.flush()` to send immediately

**Sending Process (`sendMetrics` method):**

1. **Prepares metrics:**
   - Takes all metrics from batch array
   - Formats them as JSON:
     ```json
     {
       "metrics": [
         {
           "name": "page_views",
           "type": "counter",
           "value": 1,
           "labels": { "page": "/home" },
           "operation": "increment"
         }
       ]
     }
     ```

2. **Sends POST request:**
   - URL: `/api/v1/metrics` (from config)
   - Method: POST
   - Headers:
     - `Content-Type: application/json`
     - `X-API-Key: [api key]`
   - Body: JSON with metrics array
   - Options: `keepalive: true`, `credentials: 'omit'`

3. **Handles response:**
   - If successful: Clears batch, returns response
   - If failed: Adds metrics to queue for retry

**Retry Logic:**

1. **On failure:**
   - Metrics are added to `queue` array
   - Library retries with exponential backoff (1s, 2s, 4s)
   - After 3 retries, keeps in queue

2. **Queue processing:**
   - When browser comes online, automatically retries queue
   - Client can manually retry with `tracker.flush()`

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
   - Validates counter values are non-negative

3. **Processing:**
   - Loops through each metric
   - Calls `recordMetric()` for each valid metric
   - Collects errors for invalid metrics

4. **Recording (`metrics.service.js`):**
   - Gets or creates Prometheus metric instance
   - Adds `user_id` to labels
   - Records metric based on type:
     - **Counter:** Increments value
     - **Gauge:** 
       - If operation is "set": Sets absolute value
       - If operation is "increment": Increases value
       - If operation is "decrement": Decreases value
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

## Key Differences from Snippet Method

- **Dynamic configs:** Library can fetch configs at runtime (or use manual configs)
- **More control:** Client has full control over initialization and settings
- **Better for bundlers:** Works with webpack, rollup, etc.
- **TypeScript support:** Can be used with TypeScript
- **Server-side:** Can be used in Node.js environments
- **Updates:** Config changes take effect immediately (no cache to clear)

## Flow Diagram

```
Client Code                    Your Backend                    Database
     |                              |                              |
     | 1. Install & import          |                              |
     |    library                   |                              |
     |                              |                              |
     | 2. Initialize Vizme           |                              |
     |    (with API key)            |                              |
     |                              |                              |
     | 3. Fetch configs (optional)   |                              |
     |------------------------------>|                              |
     |                              | 4. Validate API key           |
     |                              |------------------------------>|
     |                              | 5. Fetch metric configs       |
     |                              |------------------------------>|
     |                              |<------------------------------|
     | 6. Receive configs           |                              |
     |<------------------------------|                              |
     |                              |                              |
     | 7. Track metrics              |                              |
     |    (auto or manual)           |                              |
     |                              |                              |
     | 8. Send batched metrics       |                              |
     |------------------------------>|                              |
     |                              | 9. Process & store            |
     |                              |------------------------------>|
     |                              |                              |
     | 10. Success response          |                              |
     |<------------------------------|                              |
```

## Example Usage

```javascript
import Vizme from 'vizme';

// Initialize
const tracker = new Vizme({
  apiKey: 'mk_your_api_key',
  endpoint: 'http://localhost:3000/api/v1/metrics',
  autoTrack: true,
  autoFetchConfigs: true
});

// Track custom events
tracker.increment('button_click', 1, { button_id: 'submit' });
tracker.set('temperature', 25, { location: 'server-room' });
tracker.decrement('available_slots', 1);

// Manual flush if needed
tracker.flush();

// Check status
console.log(tracker.getStatus());
```

