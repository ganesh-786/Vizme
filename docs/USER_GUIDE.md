# Unified Visibility Platform - User Guide

## Getting Started

### Step 1: Access the Dashboard

1. Open your web browser and navigate to the frontend dashboard (typically `http://localhost:8000` or the deployed URL)
2. You'll see the sign-in/sign-up interface

### Step 2: Create an Account

1. Click on the **"Sign Up"** tab
2. Fill in the registration form:
   - **First Name:** Your first name
   - **Last Name:** Your last name
   - **Email:** Your email address (will be used for login)
   - **Password:** At least 6 characters
3. Click **"Sign Up"**
4. **Important:** Save your API Key and API Secret when they are displayed! You'll need these for the generated code.

### Step 3: Sign In

1. If you already have an account, use the **"Sign In"** tab
2. Enter your email and password
3. Click **"Sign In"**

## Managing API Keys

### Viewing Your API Keys

After signing in, you'll see a list of your API keys in the dashboard. Each API key includes:
- **Key Name:** A friendly name you assigned
- **API Key:** The actual key (starts with `vp_`)
- **Created Date:** When the key was created
- **Last Used:** When it was last used (if applicable)

### Creating a New API Key

1. Click the **"Create New API Key"** button
2. Enter a name for the key (e.g., "Production Website", "Staging Environment")
3. Click **"Create"**
4. **Important:** Copy and save both the API Key and API Secret immediately. The secret is only shown once!

### Deleting an API Key

1. Find the API key you want to delete
2. Click the **"Delete"** button
3. Confirm the deletion

**Note:** Deleting an API key will stop all tracking code using that key from working.

## Configuring Metrics

### Creating a Metric Configuration

1. Click **"Create New Metric"** button
2. Fill in the form:

   **Configuration Name:**
   - A friendly name for this metric (e.g., "Page Views Tracker")
   
   **Description:**
   - Optional description of what this metric tracks
   
   **Metric Name (Prometheus):**
   - The actual metric name that will appear in Prometheus
   - Must follow Prometheus naming: letters, numbers, underscores, colons
   - Example: `page_views_total`, `user_clicks_counter`
   - Cannot start with a number
   
   **Metric Type:**
   - **Gauge:** A value that can go up or down (e.g., temperature, current users)
   - **Counter:** A value that only increases (e.g., total page views, total clicks)
   - **Histogram:** Distribution of measurements (e.g., request latency)
   - **Summary:** Similar to histogram but with quantiles
   
   **Auto-track page views:**
   - If checked, automatically tracks page views when the code is loaded
   
   **Tracking Events:**
   - **Click Events:** Track all click events on the page
   - **Scroll Events:** Track when users scroll (once per page)
   - **Form Submissions:** Track form submissions
   - **Button Clicks:** Track button click events

3. Click **"Save"**

### Editing a Metric Configuration

1. Find the metric configuration you want to edit
2. Click the **"Edit"** button
3. Modify the fields as needed
4. Click **"Save"**

### Deleting a Metric Configuration

1. Find the metric configuration you want to delete
2. Click the **"Delete"** button
3. Confirm the deletion

## Generating Tracking Code

### Step-by-Step Process

1. **Create a Metric Configuration** (see above)
2. **Ensure you have an API Key** (see API Keys section)
3. Click **"Generate Code"** on the metric configuration you want to use
4. A modal will appear with the generated JavaScript code
5. **Copy the entire code block**
6. **Paste it before the closing `</body>` tag** in your HTML pages

### Code Placement

The generated code should be placed in your HTML like this:

```html
<!DOCTYPE html>
<html>
<head>
    <title>My Website</title>
</head>
<body>
    <!-- Your website content -->
    
    <!-- Paste the generated code here, before </body> -->
    <script>
    // Generated tracking code goes here
    </script>
</body>
</html>
```

### What the Code Does

The generated code will:
- Automatically track page views (if enabled)
- Track custom events you configured (clicks, scrolls, etc.)
- Batch metrics for efficient transmission
- Send metrics to the platform every 5 seconds or when batch size is reached
- Handle page unload to ensure metrics are sent

### Manual Tracking

You can also manually track metrics in your code:

```javascript
// Track a custom metric
VisibilityTracker.track(1, {
    event: 'custom_event',
    category: 'engagement'
});

// Flush metrics immediately
VisibilityTracker.flush();
```

## Viewing Your Metrics

### Grafana Dashboard

1. Click the **"Open Grafana Dashboard"** button in the dashboard
2. Or navigate directly to `http://localhost:3000`
3. Default credentials:
   - Username: `admin`
   - Password: `admin` (change on first login)
4. Create dashboards to visualize your metrics
5. Use PromQL queries to query your metrics

### Example PromQL Queries

```
# Total page views
sum(page_views_total)

# Page views per hour
rate(page_views_total[1h])

# Average page views
avg(page_views_total)
```

## Best Practices

### 1. Naming Metrics

- Use descriptive names: `page_views_total` not `pv`
- Follow Prometheus conventions: lowercase, underscores
- Use suffixes: `_total` for counters, `_duration_seconds` for timing

### 2. Using Labels

Labels help you filter and group metrics:
- `{page: "/home"}`
- `{user_type: "premium"}`
- `{device: "mobile"}`

### 3. API Key Security

- **Never commit API keys to version control**
- Use different keys for different environments (dev, staging, production)
- Rotate keys periodically
- Delete unused keys

### 4. Metric Types

- Use **Counters** for things that only increase (total sales, page views)
- Use **Gauges** for things that can go up or down (current users, temperature)
- Use **Histograms** for distributions (request latency, response sizes)

### 5. Performance

- The tracking code batches metrics automatically
- Metrics are sent asynchronously
- No impact on page load performance
- Metrics are queued if network is unavailable

## Troubleshooting

### Metrics Not Appearing

1. **Check API Key:** Ensure the API key in your code is correct
2. **Check Network:** Open browser console and check for errors
3. **Check API Secret:** Ensure the API secret is correct
4. **Check Metric Name:** Verify the metric name matches your configuration
5. **Check Prometheus:** Verify metrics are reaching Prometheus Pushgateway

### Code Not Working

1. **Check Placement:** Ensure code is before `</body>` tag
2. **Check Console:** Open browser developer console for errors
3. **Check API URL:** Verify the API URL in the code is correct
4. **Check CORS:** Ensure CORS is configured correctly

### Can't Sign In

1. **Check Email:** Ensure you're using the correct email
2. **Check Password:** Ensure password is correct
3. **Reset Password:** Contact support if needed (feature to be added)

### API Key Not Working

1. **Check Key:** Verify the API key is correct
2. **Check Secret:** Verify the API secret is correct
3. **Check Status:** Ensure the API key is active
4. **Check Expiration:** Verify the key hasn't expired

## Support

For issues or questions:
1. Check the documentation
2. Review error messages in browser console
3. Check application logs
4. Contact support team

## Next Steps

1. Create multiple metric configurations for different tracking needs
2. Set up Grafana dashboards for visualization
3. Configure alerts in Grafana
4. Monitor your metrics regularly
5. Optimize based on insights

