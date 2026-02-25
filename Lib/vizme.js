(function () {
  // Vizme - Unified Visibility Platform Tracking Library
  // Core Client - handles batching, queuing, and sending metrics

  class VizmeClient {
    constructor(config) {
      this.configReady = Promise.resolve();
      this.apiKey = config.apiKey;
      this.endpoint = config.endpoint || 'http://localhost:3000/api/v1/metrics';
      this.batchSize = config.batchSize || 10;
      this.flushInterval = config.flushInterval || 5000;

      //store metric configurations (metric name -> type mapping )
      this.metricConfigs = config.metricConfigs || {};

      this.batch = [];
      this.queue = [];
      this.flushTimer = null;
      this.isDestroyed = false;

      this.startFlushTimer();

      // Handle online/offline events
      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('online', () => {
          if (this.queue.length > 0) {
            this.flushQueue();
          }
        });

        // Flush on page unload
        window.addEventListener('beforeunload', () => {
          this.flush();
        });
      }
    }

    track(name, value, labels = {}) {
      if (this.isDestroyed) return this;

      let metricType = 'gauge';

      //first check if this metric has a configuration
      if (this.metricConfigs[name] && this.metricConfigs[name].type) {
        metricType = this.metricConfigs[name].type;
      }

      //if no config, check for _type in labels (backward compatibility)
      else if (labels._type) {
        metricType = labels._type;
      }

      const metric = {
        name: String(name),
        type: metricType,
        value: typeof value === 'number' ? value : parseFloat(value) || 0,
        labels: this.sanitizeLabels(labels),
        operation: labels._operation || 'set',
      };

      // Validate metric
      if (!metric.name || isNaN(metric.value) || !isFinite(metric.value)) {
        console.warn('Vizme: Invalid metric', metric);
        return this;
      }

      this.addToBatch(metric);
      return this;
    }

    async increment(name, value = 1, labels = {}) {
      //Try to wait for config,
      try {
        await this.configReady;
      } catch (error) {
        console.warn('Vizme: Could not wait for config, using fallback', error);
      }
      // only use counter as a fallback when no config exists
      const defaultType = this.metricConfigs[name] ? undefined : 'counter';
      return this.track(name, value, { ...labels, _type: defaultType, _operation: 'increment' });
    }

    async decrement(name, value = 1, labels = {}) {
      //Try to wait for config,
      try {
        await this.configReady;
      } catch (error) {
        console.warn('Vizme: Could not wait for config, using fallback', error);
      }
      //use gauge as a fallback only when no config exists
      const defaultType = this.metricConfigs[name] ? undefined : 'gauge';
      return this.track(name, -Math.abs(value), {
        ...labels,
        _type: defaultType,
        _operation: 'decrement',
      });
    }

    async set(name, value, labels = {}) {
      //Try to wait for config,
      try {
        await this.configReady;
      } catch (error) {
        console.warn('Vizme: Could not wait for config, using fallback', error);
      }
      // only use gauge as a fallback when no config exists
      const defaultType = this.metricConfigs[name] ? undefined : 'gauge';
      return this.track(name, value, { ...labels, _type: defaultType, _operation: 'set' });
    }

    sanitizeLabels(labels) {
      const sanitized = {};
      for (const [key, value] of Object.entries(labels)) {
        if (key !== '_type' && key !== '_operation') {
          sanitized[String(key)] = String(value);
        }
      }
      return sanitized;
    }

    addToBatch(metric) {
      this.batch.push(metric);

      if (this.batch.length >= this.batchSize) {
        this.flush();
      }
    }

    async flush() {
      if (this.batch.length === 0) return;

      const metricsToSend = [...this.batch];
      this.batch = [];

      try {
        await this.sendMetrics(metricsToSend);
      } catch (error) {
        console.warn('Vizme: Failed to send metrics, queuing for retry', error);
        // Add to queue for retry
        this.queue.push(...metricsToSend);
        if (this.queue.length > 100) {
          this.queue.shift(); // Remove oldest if queue is full
        }
      }
    }

    async flushQueue() {
      if (this.queue.length === 0) return;

      const metricsToSend = [...this.queue];
      this.queue = [];

      try {
        await this.sendMetrics(metricsToSend);
      } catch (error) {
        console.warn('Vizme: Failed to flush queue', error);
        // Re-add to queue if still failing
        this.queue.unshift(...metricsToSend);
      }
    }

    async sendMetrics(metrics) {
      if (!this.apiKey) {
        throw new Error('Vizme: API key not configured');
      }

      // Regular fetch request
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
        body: JSON.stringify({ metrics }),
        keepalive: true,
        credentials: 'omit',
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Vizme: HTTP ${response.status} - ${errorText}`);
      }

      return response.json();
    }

    isPageUnloading() {
      if (typeof document === 'undefined') return false;
      return (
        document.visibilityState === 'hidden' ||
        (typeof navigator !== 'undefined' && !navigator.onLine)
      );
    }

    startFlushTimer() {
      if (this.flushTimer) {
        clearInterval(this.flushTimer);
      }

      this.flushTimer = setInterval(() => {
        this.flush();
      }, this.flushInterval);
    }

    getQueueSize() {
      return this.queue.length;
    }

    getBatchSize() {
      return this.batch.length;
    }

    getStatus() {
      return {
        queueSize: this.queue.length,
        batchSize: this.batch.length,
        isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
        endpoint: this.endpoint,
      };
    }

    destroy() {
      this.isDestroyed = true;

      if (this.flushTimer) {
        clearInterval(this.flushTimer);
        this.flushTimer = null;
      }

      // Final flush
      this.flush();
    }
  }

  // Auto-Tracker - automatically tracks common web events
  class AutoTracker {
    constructor(client) {
      this.client = client;
      this.isActive = false;
      this.observers = [];
      this.startTime = Date.now();
    }

    start() {
      if (this.isActive) return;
      this.isActive = true;

      this.trackPageView();
      this.trackPerformance();
      this.trackErrors();
      this.trackInteractions();
      this.trackForms();
      this.trackScroll();
      this.trackTimeOnPage();
    }

    trackPageView() {
      if (typeof window === 'undefined') return;

      // Track initial page view
      this.client.track('page_view', 1, {
        page: window.location.pathname,
        referrer: document.referrer || '',
        url: window.location.href,
      });

      // Track SPA navigation (React Router, Vue Router, etc.)
      this.trackSPANavigation();
    }

    trackSPANavigation() {
      if (typeof window === 'undefined' || typeof history === 'undefined') return;

      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;

      const trackNavigation = (url) => {
        const pathname = new URL(url, window.location.origin).pathname;
        this.client.track('page_view', 1, {
          page: pathname,
          referrer: window.location.pathname,
          url: url,
        });
      };

      history.pushState = function (...args) {
        originalPushState.apply(history, args);
        if (args[2]) {
          trackNavigation(args[2]);
        }
      };

      history.replaceState = function (...args) {
        originalReplaceState.apply(history, args);
        if (args[2]) {
          trackNavigation(args[2]);
        }
      };

      window.addEventListener('popstate', () => {
        this.client.track('page_view', 1, {
          page: window.location.pathname,
          referrer: document.referrer || '',
          url: window.location.href,
        });
      });
    }

    trackPerformance() {
      if (typeof window === 'undefined' || !window.performance) return;

      window.addEventListener('load', () => {
        const timing = performance.timing;
        if (timing) {
          const loadTime = timing.loadEventEnd - timing.navigationStart;
          const ttfb = timing.responseStart - timing.navigationStart;
          const domReady = timing.domContentLoadedEventEnd - timing.navigationStart;

          this.client.track('page_load_time', loadTime, {
            page: window.location.pathname,
          });

          this.client.track('ttfb', ttfb, {
            page: window.location.pathname,
          });

          this.client.track('dom_content_loaded', domReady, {
            page: window.location.pathname,
          });
        }
      });

      // Track Web Vitals if available
      if ('PerformanceObserver' in window) {
        this.trackWebVitals();
      }
    }

    trackWebVitals() {
      // First Contentful Paint (FCP)
      try {
        const fcpObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            if (entry.name === 'first-contentful-paint') {
              this.client.track('fcp', Math.round(entry.startTime), {
                page: window.location.pathname,
              });
            }
          });
        });
        fcpObserver.observe({ entryTypes: ['paint'] });
        this.observers.push(fcpObserver);
      } catch (e) {
        // PerformanceObserver not supported
      }

      // Largest Contentful Paint (LCP)
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          this.client.track('lcp', Math.round(lastEntry.renderTime || lastEntry.loadTime), {
            page: window.location.pathname,
          });
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
        this.observers.push(lcpObserver);
      } catch (e) {
        // Not supported
      }

      // First Input Delay (FID)
      try {
        const fidObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            this.client.track('fid', Math.round(entry.processingStart - entry.startTime), {
              page: window.location.pathname,
            });
          });
        });
        fidObserver.observe({ entryTypes: ['first-input'] });
        this.observers.push(fidObserver);
      } catch (e) {
        // Not supported
      }

      // Cumulative Layout Shift (CLS)
      try {
        let clsValue = 0;
        const clsObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
            }
          });
        });
        clsObserver.observe({ entryTypes: ['layout-shift'] });
        this.observers.push(clsObserver);

        window.addEventListener('beforeunload', () => {
          this.client.track('cls', Math.round(clsValue * 1000), {
            page: window.location.pathname,
          });
        });
      } catch (e) {
        // Not supported
      }
    }

    trackErrors() {
      if (typeof window === 'undefined') return;

      // JavaScript errors
      window.addEventListener('error', (event) => {
        this.client.increment('javascript_errors', 1, {
          page: window.location.pathname,
          message: String(event.message || '').substring(0, 100),
          source: String(event.filename || '').substring(0, 200),
          line: event.lineno || 0,
        });
      });

      // Unhandled promise rejections
      window.addEventListener('unhandledrejection', (event) => {
        this.client.increment('promise_rejections', 1, {
          page: window.location.pathname,
          reason: String(event.reason || '').substring(0, 100),
        });
      });
    }

    /**
     * Extract product context from ancestor elements (data-vizme-product, data-vizme-product-*)
     * or Schema.org Product microdata
     */
    extractProductContext(el) {
      const labels = {};
      const productEl = el.closest('[data-vizme-product], [data-product], [itemtype*="schema.org/Product"]');
      if (!productEl) return labels;

      const attrMap = [
        ['data-vizme-product-id', 'product_id'],
        ['data-product-id', 'product_id'],
        ['data-vizme-product-name', 'product_name'],
        ['data-product-name', 'product_name'],
        ['data-vizme-product-category', 'category'],
        ['data-product-category', 'category'],
        ['data-vizme-product-price', 'price'],
        ['data-product-price', 'price'],
        ['data-vizme-product-currency', 'currency'],
        ['data-product-currency', 'currency'],
      ];
      for (const [attr, labelKey] of attrMap) {
        const val = productEl.getAttribute(attr);
        if (val != null && val !== '') labels[labelKey] = String(val);
      }
      if (Object.keys(labels).length > 0) return labels;

      if (productEl.getAttribute('itemtype')?.includes('Product')) {
        const nameEl = productEl.querySelector('[itemprop="name"]');
        const priceEl = productEl.querySelector('[itemprop="price"]');
        const currEl = productEl.querySelector('[itemprop="priceCurrency"]');
        if (nameEl) labels.product_name = String(nameEl.textContent || nameEl.getAttribute('content') || '').trim();
        if (priceEl) labels.price = String(priceEl.getAttribute('content') || priceEl.textContent || '').trim();
        if (currEl) labels.currency = String(currEl.getAttribute('content') || currEl.textContent || '').trim();
      }
      return labels;
    }

    /**
     * Extract labels from element attributes (data-vizme-label-* or data-label-*)
     */
    extractLabelsFromElement(el) {
      const labels = {};
      Array.from(el.attributes).forEach((attr) => {
        if (attr.name.startsWith('data-vizme-label-')) {
          labels[attr.name.slice(17)] = attr.value;
        } else if (attr.name.startsWith('data-label-')) {
          labels[attr.name.slice(11)] = attr.value;
        }
      });
      return labels;
    }

    /**
     * Resolve metric value from element (data-vizme-value, data-vizme-value-from, or data-value)
     */
    resolveValue(el) {
      const valueFrom = el.getAttribute('data-vizme-value-from');
      if (valueFrom) {
        const scope = el.closest('[data-vizme-product], [data-product]') || document;
        const target = scope.querySelector(valueFrom);
        if (target) {
          const v = parseFloat(target.value ?? target.textContent);
          if (!isNaN(v) && isFinite(v)) return v;
        }
      }
      const v1 = parseFloat(el.getAttribute('data-vizme-value'));
      if (!isNaN(v1) && isFinite(v1)) return v1;
      const v2 = parseFloat(el.getAttribute('data-value'));
      if (!isNaN(v2) && isFinite(v2)) return v2;
      return 1;
    }

    /**
     * Get metric name from element (data-vizme-track or data-track)
     */
    getMetricName(el) {
      return el.getAttribute('data-vizme-track') || el.getAttribute('data-track') || '';
    }

    trackInteractions() {
      if (typeof document === 'undefined') return;

      document.addEventListener(
        'click',
        (e) => {
          const el = e.target.closest('[data-vizme-track], [data-track]');
          if (!el) return;
          const metricName = this.getMetricName(el);
          if (!metricName) return;

          const value = this.resolveValue(el);
          const labels = {
            ...this.extractProductContext(el),
            ...this.extractLabelsFromElement(el),
          };

          this.client.increment(metricName, value, {
            page: window.location.pathname,
            ...labels,
          });
        },
        true
      );
    }

    trackForms() {
      if (typeof document === 'undefined') return;

      document.addEventListener('submit', (e) => {
        const form = e.target;
        const metricName = form.getAttribute('data-vizme-track') || form.getAttribute('data-track');
        if (!metricName) return;

        const value = this.resolveValue(form);
        const labels = {
          form_id: form.id || '',
          ...this.extractLabelsFromElement(form),
        };

        this.client.increment(metricName, value, {
          page: window.location.pathname,
          ...labels,
        });
      });
    }

    trackScroll() {
      if (typeof window === 'undefined') return;

      let maxScroll = 0;
      let ticking = false;

      const trackScrollDepth = () => {
        if (ticking) return;
        ticking = true;

        requestAnimationFrame(() => {
          const scrollHeight = document.documentElement.scrollHeight;
          const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
          const clientHeight = document.documentElement.clientHeight;
          const scrollPercent = Math.round(((scrollTop + clientHeight) / scrollHeight) * 100);

          if (scrollPercent > maxScroll) {
            maxScroll = scrollPercent;
            this.client.set('scroll_depth', scrollPercent, {
              page: window.location.pathname,
            });
          }

          ticking = false;
        });
      };

      window.addEventListener('scroll', trackScrollDepth, { passive: true });

      // Track final scroll depth on page unload
      window.addEventListener('beforeunload', () => {
        this.client.set('max_scroll_depth', maxScroll, {
          page: window.location.pathname,
        });
      });
    }

    trackTimeOnPage() {
      if (typeof window === 'undefined') return;

      window.addEventListener('beforeunload', () => {
        const timeOnPage = Math.round((Date.now() - this.startTime) / 1000);
        this.client.track('time_on_page', timeOnPage, {
          page: window.location.pathname,
        });
      });
    }

    stop() {
      this.isActive = false;
      // Cleanup observers
      this.observers.forEach((observer) => {
        try {
          observer.disconnect();
        } catch (e) {
          // Ignore errors
        }
      });
      this.observers = [];
    }
  }

  // Main Vizme class
  class Vizme {
    constructor(config) {
      if (!config || !config.apiKey) {
        throw new Error('Vizme: API key is required');
      }

      this.config = {
        apiKey: config.apiKey,
        endpoint: config.endpoint || 'http://localhost:3000/api/v1/metrics',
        autoTrack: config.autoTrack !== false, // Default: true
        batchSize: config.batchSize || 10,
        flushInterval: config.flushInterval || 5000,
        metricConfigs: config.metricConfigs || {}, //store metric configurations
        autofetchConfigs: config.autofetchConfigs !== false, // Default: true
        ...config,
      };

      // Initialize core client
      this.client = new VizmeClient({
        apiKey: this.config.apiKey,
        endpoint: this.config.endpoint,
        batchSize: this.config.batchSize,
        flushInterval: this.config.flushInterval,
        metricConfigs: this.config.metricConfigs, //pass metric configurations to the client
      });

      // Auto-fetch metric configs from backend
      if (this.config.autofetchConfigs && !config.metricConfigs) {
        this.configReady = this.fetchMetricConfigs()
          .then((configs) => {
            this.client.metricConfigs = configs;
          })
          .catch((error) => {
            console.warn('Vizme: Could not fetch metric configs, using defaults', error);
          });

        this.client.configReady = this.configReady;
      }

      // Initialize auto-tracker if enabled
      if (this.config.autoTrack) {
        this.autoTracker = new AutoTracker(this.client);
        this.autoTracker.start();
      }

      // Listen for vizme:track CustomEvent (minimal-code API for dynamic flows)
      if (typeof window !== 'undefined' && window.addEventListener) {
        this._vizmeTrackHandler = (e) => {
          const { event, value = 1, ...labels } = e.detail || {};
          if (event) this.client.increment(event, value, labels);
        };
        window.addEventListener('vizme:track', this._vizmeTrackHandler);
      }
    }

    // Method to fetch metric configs from backend
    async fetchMetricConfigs() {
      try {
        // Extract base URL from endpoint
        const baseUrl = this.config.endpoint.replace('/api/v1/metrics', '');
        const configUrl = `${baseUrl}/api/v1/metric-configs/by-api-key`;

        const response = await fetch(configUrl, {
          method: 'GET',
          headers: {
            'X-API-Key': this.config.apiKey,
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        if (data.success && data.data) {
          return data.data;
        }

        return {};
      } catch (error) {
        console.warn('Vizme: Failed to fetch metric configs', error);
        return {};
      }
    }

    // Manual tracking API
    track(name, value, labels = {}) {
      return this.client.track(name, value, labels);
    }

    increment(name, value = 1, labels = {}) {
      return this.client.increment(name, value, labels);
    }

    decrement(name, value = 1, labels = {}) {
      return this.client.decrement(name, value, labels);
    }

    set(name, value, labels = {}) {
      return this.client.set(name, value, labels);
    }

    // Force flush
    flush() {
      return this.client.flush();
    }

    // Get status
    getStatus() {
      return this.client.getStatus();
    }

    // Destroy/cleanup
    destroy() {
      if (typeof window !== 'undefined' && this._vizmeTrackHandler) {
        window.removeEventListener('vizme:track', this._vizmeTrackHandler);
      }
      if (this.autoTracker) {
        this.autoTracker.stop();
      }
      this.client.destroy();
    }
  }

  // Export for browser
  if (typeof window !== 'undefined') {
    window.Vizme = Vizme;
  }

  // Export for Node.js/ES modules

  // Expose to global scope
  if (typeof window !== 'undefined') {
    window.Vizme = Vizme;
  }
})();
