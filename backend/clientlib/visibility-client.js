/**
 * Unified Visibility Platform - Client Library
 * Embeddable JavaScript library for tracking metrics from websites
 *
 * Usage:
 * <script src="http://your-api-url/api/v1/client/script.js"></script>
 * <script>
 *   VisibilityTracker.init({ apiUrl: 'http://your-api-url', clientId: 'your-id' });
 * </script>
 */

(function (window) {
  "use strict";

  // Default configuration
  const DEFAULT_CONFIG = {
    apiUrl: "{{API_URL}}",
    clientId: null,
    autoTrack: true,
    batchSize: 10,
    flushInterval: 5000, // 5 seconds
    enableDebug: false,
  };

  // Internal state
  let config = { ...DEFAULT_CONFIG };
  let metricsQueue = [];
  let flushTimer = null;
  let isInitialized = false;

  /**
   * Log debug messages
   */
  function debug(...args) {
    if (config.enableDebug && window.console && console.log) {
      console.log("[VisibilityTracker]", ...args);
    }
  }

  /**
   * Generate unique client ID if not provided
   */
  function generateClientId() {
    let clientId = localStorage.getItem("visibility_client_id");
    if (!clientId) {
      clientId =
        "client_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
      try {
        localStorage.setItem("visibility_client_id", clientId);
      } catch (e) {
        debug("Failed to store client ID in localStorage", e);
      }
    }
    return clientId;
  }

  /**
   * Get browser information
   */
  function getBrowserInfo() {
    return {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      screenWidth: window.screen ? window.screen.width : null,
      screenHeight: window.screen ? window.screen.height : null,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    };
  }

  /**
   * Get page information
   */
  function getPageInfo() {
    return {
      url: window.location.href,
      path: window.location.pathname,
      host: window.location.host,
      referrer: document.referrer || "",
      title: document.title || "",
    };
  }

  /**
   * Flush metrics queue to API
   */
  function flushMetrics() {
    if (metricsQueue.length === 0) {
      return;
    }

    const metricsToSend = [...metricsQueue];
    metricsQueue = [];

    debug("Flushing metrics", metricsToSend.length);

    const url = config.apiUrl.replace(/\/$/, "") + "/api/v1/metrics";
    const clientId = config.clientId || generateClientId();

    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Client-Id": clientId,
      },
      body: JSON.stringify({
        metrics: metricsToSend,
        job: "web_client",
        instance: clientId,
      }),
      keepalive: true, // Important for page unload scenarios
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
      })
      .then((data) => {
        debug("Metrics sent successfully", data);
      })
      .catch((error) => {
        debug("Failed to send metrics", error);
        // Re-queue metrics on failure (up to a limit)
        if (metricsToSend.length < 100) {
          metricsQueue.unshift(...metricsToSend);
        }
      });
  }

  /**
   * Schedule metrics flush
   */
  function scheduleFlush() {
    if (flushTimer) {
      clearTimeout(flushTimer);
    }
    flushTimer = setTimeout(flushMetrics, config.flushInterval);
  }

  /**
   * Track a metric
   */
  function track(metricName, value, labels = {}) {
    if (!isInitialized) {
      debug(
        "VisibilityTracker not initialized. Call VisibilityTracker.init() first."
      );
      return;
    }

    if (!metricName || value === undefined || value === null) {
      debug("Invalid metric: name and value are required");
      return;
    }

    const browserInfo = getBrowserInfo();
    const pageInfo = getPageInfo();

    const metric = {
      name: metricName,
      value: typeof value === "number" ? value : parseFloat(value) || 0,
      type: "gauge",
      labels: {
        ...labels,
        ...browserInfo,
        ...pageInfo,
        timestamp: new Date().toISOString(),
      },
    };

    metricsQueue.push(metric);
    debug("Metric queued", metric);

    // Flush if batch size reached
    if (metricsQueue.length >= config.batchSize) {
      flushMetrics();
    } else {
      scheduleFlush();
    }
  }

  /**
   * Track page view
   */
  function trackPageView() {
    track("page_views_total", 1, {
      event: "page_view",
    });
  }

  /**
   * Track custom event
   */
  function trackEvent(eventName, value = 1, additionalLabels = {}) {
    track("custom_events_total", value, {
      event: eventName,
      ...additionalLabels,
    });
  }

  /**
   * Initialize the tracker
   */
  function init(userConfig = {}) {
    config = { ...DEFAULT_CONFIG, ...userConfig };

    // Validate API URL
    if (!config.apiUrl || config.apiUrl === "{{API_URL}}") {
      debug("Warning: API URL not configured. Please provide apiUrl in init()");
    }

    // Generate client ID if not provided
    if (!config.clientId) {
      config.clientId = generateClientId();
    }

    isInitialized = true;
    debug("VisibilityTracker initialized", config);

    // Auto-track page views if enabled
    if (config.autoTrack) {
      // Track initial page view
      trackPageView();

      // Track page views on navigation (for SPAs)
      if (window.history && window.history.pushState) {
        const originalPushState = window.history.pushState;
        window.history.pushState = function () {
          originalPushState.apply(window.history, arguments);
          setTimeout(trackPageView, 100);
        };

        window.addEventListener("popstate", () => {
          setTimeout(trackPageView, 100);
        });
      }

      // Track page unload
      window.addEventListener("beforeunload", () => {
        flushMetrics();
      });

      // Track visibility changes
      document.addEventListener("visibilitychange", () => {
        if (document.hidden) {
          flushMetrics();
        }
      });
    }

    // Flush metrics on page unload
    window.addEventListener("beforeunload", () => {
      // Use sendBeacon for more reliable delivery on page unload
      if (metricsQueue.length > 0 && navigator.sendBeacon) {
        const url = config.apiUrl.replace(/\/$/, "") + "/api/v1/metrics";
        const clientId = config.clientId || generateClientId();
        const data = JSON.stringify({
          metrics: metricsQueue,
          job: "web_client",
          instance: clientId,
        });
        navigator.sendBeacon(url, data);
      }
    });
  }

  /**
   * Manually flush metrics
   */
  function flush() {
    flushMetrics();
  }

  /**
   * Get current configuration
   */
  function getConfig() {
    return { ...config };
  }

  /**
   * Get queue size
   */
  function getQueueSize() {
    return metricsQueue.length;
  }

  // Public API
  window.VisibilityTracker = {
    init,
    track,
    trackPageView,
    trackEvent,
    flush,
    getConfig,
    getQueueSize,
  };

  // Auto-initialize if script has data attributes
  if (document.currentScript) {
    const script = document.currentScript;
    const apiUrl = script.getAttribute("data-api-url");
    const clientId = script.getAttribute("data-client-id");
    const autoTrack = script.getAttribute("data-auto-track") !== "false";

    if (apiUrl) {
      init({
        apiUrl,
        clientId: clientId || null,
        autoTrack,
      });
    }
  }
})(window);
