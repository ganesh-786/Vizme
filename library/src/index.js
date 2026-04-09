// Vizme - Unified Visibility Platform Tracking Library
// Core Client - handles batching, queuing, and sending metrics

class VizmeClient {
    constructor(config) {
      this.configReady = Promise.resolve()
      this.apiKey = config.apiKey;
      this.endpoint = config.endpoint || 'http://localhost:3000/api/v1/metrics';
      this.batchSize = config.batchSize || 5;
      this.flushInterval = config.flushInterval || 1000;
      this.maxRetries = config.maxRetries ?? 5;
      this.retryBaseMs = config.retryBaseMs ?? 1000;
      this.sampleRate = config.sampleRate ?? 1;

      //store metric configurations (metric name -> type mapping )
      this.metricConfigs = config.metricConfigs || {};
      
      this.batch = [];
      this.queue = [];
      this.flushTimer = null;
      this.isDestroyed = false;
      this.retryAttempt = 0;
      this.retryTimer = null;
      
      this.startFlushTimer();
      
      // Handle online/offline events
      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('online', () => {
          this.retryAttempt = 0;
          if (this.queue.length > 0) {
            this.flushQueue();
          }
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
        operation: labels._operation || 'set'
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
      try{
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
      try{
        await this.configReady;
      } catch (error) {
        console.warn('Vizme: Could not wait for config, using fallback', error);
      }
      //use gauge as a fallback only when no config exists
      const defaultType = this.metricConfigs[name] ? undefined : 'gauge';
      return this.track(name, -Math.abs(value), { ...labels, _type: defaultType, _operation: 'decrement' });
    }
    
    async set(name, value, labels = {}) {
      //Try to wait for config, 
      try{
        await this.configReady;
      } catch (error) {
        console.warn('Vizme: Could not wait for config, using fallback', error);
      }
      // only use gauge as a fallback when no config exists
      const defaultType = this.metricConfigs[name] ? undefined : "gauge";
      return this.track(name, value, { ...labels, _type: defaultType, _operation: 'set' });
    }
    
    sanitizeLabels(labels) {
      const maxLen = 128;
      const sanitized = {};
      const keys = Object.keys(labels || {}).filter(k => k !== '_type' && k !== '_operation').slice(0, 10);
      for (const key of keys) {
        let val = String(labels[key]);
        if (val.length > maxLen) val = val.slice(0, maxLen);
        sanitized[String(key)] = val;
      }
      return sanitized;
    }
    
    addToBatch(metric) {
      if (this.sampleRate < 1 && Math.random() >= this.sampleRate) return;
      this.batch.push(metric);
      
      if (this.batch.length >= this.batchSize) {
        this.flush();
      } else if (metric.operation === 'set') {
        // Flush gauge set immediately for real-time dashboard updates
        this.flush();
      }
    }
    
    async flush(useSendBeacon = false) {
      const metricsToSend = [...this.batch];
      if (metricsToSend.length > 0) this.batch = [];
      
      if (useSendBeacon) {
        const all = metricsToSend.length > 0 ? [...metricsToSend, ...this.queue] : [...this.queue];
        this.queue = [];
        if (all.length > 0) this.sendMetricsSync(all);
        return;
      }
      
      if (metricsToSend.length === 0) return;
      
      try {
        await this.sendMetrics(metricsToSend);
        this.retryAttempt = 0;
      } catch (error) {
        this.queue.push(...metricsToSend);
        if (this.queue.length > 100) this.queue.shift();
        this.scheduleRetryWithBackoff();
      }
    }
    
    sendMetricsSync(metrics) {
      if (!this.apiKey || !metrics.length) return;
      const payload = JSON.stringify({ metrics });
      const url = `${this.endpoint}?api_key=${encodeURIComponent(this.apiKey)}`;
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
      }
    }
    
    scheduleRetryWithBackoff() {
      if (this.retryTimer || this.queue.length === 0) return;
      const delay = Math.min(
        this.retryBaseMs * Math.pow(2, this.retryAttempt),
        30000
      );
      this.retryAttempt = Math.min(this.retryAttempt + 1, this.maxRetries);
      this.retryTimer = setTimeout(() => {
        this.retryTimer = null;
        this.flushQueue();
      }, delay);
    }
    
    async flushQueue() {
      if (this.queue.length === 0) return;
      
      const metricsToSend = [...this.queue];
      this.queue = [];
      
      try {
        await this.sendMetrics(metricsToSend);
        this.retryAttempt = 0;
      } catch (error) {
        this.queue.unshift(...metricsToSend);
        this.scheduleRetryWithBackoff();
      }
    }
    
    async sendMetrics(metrics) {
      if (!this.apiKey) {
        throw new Error('Vizme: API key not configured');
      }
      
      const payload = JSON.stringify({ metrics });
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey
        },
        body: payload,
        keepalive: true,
        credentials: 'omit'
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Vizme: HTTP ${response.status} - ${errorText}`);
      }
      
      return response.json();
    }
    
    isPageUnloading() {
      if (typeof document === 'undefined') return false;
      return document.visibilityState === 'hidden' || 
             (typeof navigator !== 'undefined' && !navigator.onLine);
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
        endpoint: this.endpoint
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
    constructor(client, options = {}) {
      this.client = client;
      this.isActive = false;
      this.observers = [];
      this.autoInteractions = options.autoInteractions || false;
      this._lastAutoClick = { ts: 0, id: '' };

      this.currentPage = typeof window !== 'undefined' ? window.location.pathname : '/';
      this.currentPageStartTime = Date.now();
      this._maxScroll = 0;
      this._clsValue = 0;
      this._latestLcp = 0;
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
      if (this.autoInteractions) {
        this.trackAutoInteractions();
      }
    }
    
    trackPageView() {
      if (typeof window === 'undefined') return;
      
      this.client.increment('page_view', 1, {
        page: window.location.pathname,
        referrer: document.referrer || '',
        url: window.location.href
      });
      
      this.trackSPANavigation();
    }
    
    trackSPANavigation() {
      if (typeof window === 'undefined' || typeof history === 'undefined') return;
      
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      
      const onNavigate = (url) => {
        const pathname = new URL(url, window.location.origin).pathname;
        const previousPage = this.currentPage;
        const elapsed = Math.round((Date.now() - this.currentPageStartTime) / 1000);
        if (elapsed > 0) {
          this.client.track('time_on_page', elapsed, { page: previousPage });
        }
        this.currentPage = pathname;
        this.currentPageStartTime = Date.now();
        this._maxScroll = 0;
        
        this.client.increment('page_view', 1, {
          page: pathname,
          referrer: previousPage,
          url: url
        });
      };
      
      history.pushState = function(...args) {
        originalPushState.apply(history, args);
        if (args[2]) {
          onNavigate(args[2]);
        }
      };
      
      history.replaceState = function(...args) {
        originalReplaceState.apply(history, args);
        if (args[2]) {
          onNavigate(args[2]);
        }
      };
      
      window.addEventListener('popstate', () => {
        const previousPage = this.currentPage;
        const elapsed = Math.round((Date.now() - this.currentPageStartTime) / 1000);
        if (elapsed > 0) {
          this.client.track('time_on_page', elapsed, { page: previousPage });
        }
        this.currentPage = window.location.pathname;
        this.currentPageStartTime = Date.now();
        this._maxScroll = 0;
        
        this.client.increment('page_view', 1, {
          page: window.location.pathname,
          referrer: previousPage,
          url: window.location.href
        });
      });
    }
    
    trackPerformance() {
      if (typeof window === 'undefined' || !window.performance) return;
      
      window.addEventListener('load', () => {
        // Defer so the browser populates loadEventEnd after all load handlers complete
        setTimeout(() => {
          const page = window.location.pathname;
          const navEntries = performance.getEntriesByType('navigation');
          if (navEntries && navEntries.length > 0) {
            const nav = navEntries[0];
            const pageLoad = Math.round(nav.loadEventEnd - nav.startTime);
            const ttfb = Math.round(nav.responseStart - nav.startTime);
            const domReady = Math.round(nav.domContentLoadedEventEnd - nav.startTime);
            if (pageLoad > 0) this.client.track('page_load_time', pageLoad, { page });
            if (ttfb > 0) this.client.track('ttfb', ttfb, { page });
            if (domReady > 0) this.client.track('dom_content_loaded', domReady, { page });
          } else if (performance.timing) {
            const timing = performance.timing;
            const pageLoad = timing.loadEventEnd - timing.navigationStart;
            const ttfb = timing.responseStart - timing.navigationStart;
            const domReady = timing.domContentLoadedEventEnd - timing.navigationStart;
            if (pageLoad > 0) this.client.track('page_load_time', pageLoad, { page });
            if (ttfb > 0) this.client.track('ttfb', ttfb, { page });
            if (domReady > 0) this.client.track('dom_content_loaded', domReady, { page });
          }

          if (this._latestLcp > 0) {
            this.client.track('lcp', this._latestLcp, { page });
          }
        }, 0);
      });
      
      if ('PerformanceObserver' in window) {
        this.trackWebVitals();
      }
    }
    
    trackWebVitals() {
      try {
        const fcpObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            if (entry.name === 'first-contentful-paint') {
              this.client.track('fcp', Math.round(entry.startTime), {
                page: window.location.pathname
              });
            }
          });
        });
        fcpObserver.observe({ entryTypes: ['paint'] });
        this.observers.push(fcpObserver);
      } catch (e) { /* not supported */ }
      
      try {
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          this._latestLcp = Math.round(lastEntry.renderTime || lastEntry.loadTime);
        });
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
        this.observers.push(lcpObserver);
      } catch (e) { /* not supported */ }
      
      try {
        const fidObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            this.client.track('fid', Math.round(entry.processingStart - entry.startTime), {
              page: window.location.pathname
            });
          });
        });
        fidObserver.observe({ entryTypes: ['first-input'] });
        this.observers.push(fidObserver);
      } catch (e) { /* not supported */ }
      
      try {
        const clsObserver = new PerformanceObserver((list) => {
          list.getEntries().forEach((entry) => {
            if (!entry.hadRecentInput) {
              this._clsValue += entry.value;
            }
          });
        });
        clsObserver.observe({ entryTypes: ['layout-shift'] });
        this.observers.push(clsObserver);
      } catch (e) { /* not supported */ }
    }
    
    trackErrors() {
      if (typeof window === 'undefined') return;
      
      // JavaScript errors
      window.addEventListener('error', (event) => {
        this.client.increment('javascript_errors', 1, {
          page: window.location.pathname,
          message: String(event.message || '').substring(0, 100),
          source: String(event.filename || '').substring(0, 200),
          line: event.lineno || 0
        });
      });
      
      // Unhandled promise rejections
      window.addEventListener('unhandledrejection', (event) => {
        this.client.increment('promise_rejections', 1, {
          page: window.location.pathname,
          reason: String(event.reason || '').substring(0, 100)
        });
      });
    }
    
    trackInteractions() {
      if (typeof document === 'undefined') return;
      
      // Track clicks on elements with data-vizme-track attribute
      document.addEventListener('click', (e) => {
        const el = e.target.closest('[data-vizme-track]');
        if (el) {
          const metricName = el.getAttribute('data-vizme-track');
          const value = parseFloat(el.getAttribute('data-vizme-value')) || 1;
          const labels = {};
          
          // Extract data-vizme-label-* attributes
          Array.from(el.attributes).forEach(attr => {
            if (attr.name.startsWith('data-vizme-label-')) {
              labels[attr.name.slice(17)] = attr.value;
            }
          });
          
          this.client.increment(metricName, value, {
            page: window.location.pathname,
            ...labels
          });
        }
      }, true);
    }
    
    trackForms() {
      if (typeof document === 'undefined') return;
      
      document.addEventListener('submit', (e) => {
        const form = e.target;
        if (form.hasAttribute('data-vizme-track')) {
          const metricName = form.getAttribute('data-vizme-track');
          const value = parseFloat(form.getAttribute('data-vizme-value')) || 1;
          const labels = {};
          
          Array.from(form.attributes).forEach(attr => {
            if (attr.name.startsWith('data-vizme-label-')) {
              labels[attr.name.slice(17)] = attr.value;
            }
          });
          
          this.client.increment(metricName, value, {
            page: window.location.pathname,
            form_id: form.id || '',
            ...labels
          });
        }
      });
    }
    
    trackScroll() {
      if (typeof window === 'undefined') return;
      
      let ticking = false;
      
      const trackScrollDepth = () => {
        if (ticking) return;
        ticking = true;
        
        requestAnimationFrame(() => {
          const scrollHeight = document.documentElement.scrollHeight;
          const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
          const clientHeight = document.documentElement.clientHeight;
          const scrollPercent = Math.round((scrollTop + clientHeight) / scrollHeight * 100);
          
          if (scrollPercent > this._maxScroll) {
            this._maxScroll = scrollPercent;
            this.client.set('scroll_depth', scrollPercent, {
              page: this.currentPage || window.location.pathname
            });
          }
          
          ticking = false;
        });
      };
      
      window.addEventListener('scroll', trackScrollDepth, { passive: true });
    }
    
    trackTimeOnPage() {
      // Handled by trackSPANavigation (on route change) and collectFinalMetrics (on unload)
    }
    
    collectFinalMetrics() {
      if (typeof window === 'undefined') return;
      const page = this.currentPage || window.location.pathname;
      
      const elapsed = Math.round((Date.now() - this.currentPageStartTime) / 1000);
      if (elapsed > 0) {
        this.client.track('time_on_page', elapsed, { page });
      }
      
      if (this._maxScroll > 0) {
        this.client.set('max_scroll_depth', this._maxScroll, { page });
      }
      
      if (this._clsValue > 0) {
        this.client.track('cls', Math.round(this._clsValue * 1000), { page });
      }
    }
    
    trackAutoInteractions() {
      if (typeof document === 'undefined') return;

      const DEDUP_MS = 300;

      document.addEventListener('click', (e) => {
        const el = this.findTrackableAncestor(e.target);
        if (!el) return;
        // Skip elements already handled by the opt-in data-vizme-track path
        if (el.hasAttribute('data-vizme-track')) return;

        const elId = (el.id || '') + '|' + (el.tagName || '');
        const now = Date.now();
        if (elId === this._lastAutoClick.id && now - this._lastAutoClick.ts < DEDUP_MS) return;
        this._lastAutoClick = { ts: now, id: elId };

        const labels = {
          page: window.location.pathname,
          element: el.tagName.toLowerCase(),
          interaction_type: 'click'
        };
        if (el.id) labels.element_id = el.id;
        const text = (el.innerText || '').substring(0, 50).trim();
        if (text) labels.element_text = text;
        if (el.href) labels.element_href = el.href.substring(0, 200);

        this.client.increment('user_interaction', 1, labels);
      }, true);

      document.addEventListener('change', (e) => {
        const el = e.target;
        if (!['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return;
        if (el.hasAttribute('data-vizme-track')) return;

        const labels = {
          page: window.location.pathname,
          element: el.tagName.toLowerCase(),
          interaction_type: 'input_change'
        };
        if (el.id) labels.element_id = el.id;
        else if (el.name) labels.element_id = el.name;
        if (el.type) labels.input_type = el.type;

        this.client.increment('user_interaction', 1, labels);
      }, true);
    }

    findTrackableAncestor(target) {
      const TRACKABLE = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'];
      let el = target;
      let depth = 0;
      while (el && el !== document && depth < 5) {
        if (TRACKABLE.includes(el.tagName) || el.getAttribute('role') === 'button') {
          return el;
        }
        el = el.parentNode;
        depth++;
      }
      return null;
    }

    stop() {
      this.isActive = false;
      // Cleanup observers
      this.observers.forEach(observer => {
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
        batchSize: config.batchSize || 5,
        flushInterval: config.flushInterval || 1000,
        metricConfigs: config.metricConfigs || {},
        autoFetchConfigs: config.autoFetchConfigs !== false,
        sampleRate: config.sampleRate ?? 1,
        maxRetries: config.maxRetries ?? 5,
        retryBaseMs: config.retryBaseMs ?? 1000,
        ...config
      };
      
      // Initialize core client
      this.client = new VizmeClient({
        apiKey: this.config.apiKey,
        endpoint: this.config.endpoint,
        batchSize: this.config.batchSize,
        flushInterval: this.config.flushInterval,
        metricConfigs: this.config.metricConfigs,
        sampleRate: this.config.sampleRate,
        maxRetries: this.config.maxRetries,
        retryBaseMs: this.config.retryBaseMs
      });

          // Auto-fetch metric configs from backend
    if (this.config.autoFetchConfigs && !config.metricConfigs) {
      this.configReady = this.fetchMetricConfigs().then(configs=>{
        this.client.metricConfigs = configs;
      })
      .catch(error => {
        console.warn('Vizme: Could not fetch metric configs, using defaults', error);
      });

      this.client.configReady = this.configReady;
    }
      
      // Initialize auto-tracker if enabled
      if (this.config.autoTrack) {
        this.autoTracker = new AutoTracker(this.client, {
          autoInteractions: this.config.autoInteractions || false
        });
        this.autoTracker.start();
      }

      // Listen for vizme:track CustomEvent (minimal-code API for dynamic flows)
      // Supports operation: "increment" (default), "set", "decrement" for gauges
      if (typeof window !== 'undefined' && window.addEventListener) {
        this._vizmeTrackHandler = (e) => {
          const { event, value = 1, operation = 'increment', ...labels } = e.detail || {};
          if (!event) return;
          const numValue = typeof value === 'number' && isFinite(value) ? value : parseFloat(value) || 0;
          if (operation === 'set') {
            this.client.set(event, numValue, labels);
          } else if (operation === 'decrement') {
            this.client.decrement(event, Math.abs(numValue), labels);
          } else {
            this.client.increment(event, numValue, labels);
          }
        };
        window.addEventListener('vizme:track', this._vizmeTrackHandler);
      }

      // Unified beforeunload: collect final metrics THEN flush via sendBeacon
      if (typeof window !== 'undefined' && window.addEventListener) {
        this._beforeUnloadHandler = () => {
          if (this.autoTracker) this.autoTracker.collectFinalMetrics();
          this.client.flush(true);
        };
        window.addEventListener('beforeunload', this._beforeUnloadHandler);
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
          'X-API-Key': this.config.apiKey
        }
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
      if (typeof window !== 'undefined') {
        if (this._vizmeTrackHandler) {
          window.removeEventListener('vizme:track', this._vizmeTrackHandler);
        }
        if (this._beforeUnloadHandler) {
          window.removeEventListener('beforeunload', this._beforeUnloadHandler);
        }
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
  export default Vizme;
  export { Vizme };
  