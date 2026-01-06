/**
 * Code Generator Service
 * Generates custom client library code based on metric configurations
 */

const logger = require('../utils/logger');

class CodeGeneratorService {
  /**
   * Generate client library code
   * @param {Object} options - Generation options
   * @param {Object} options.metricConfig - Metric configuration
   * @param {string} options.apiKey - API key
   * @param {string} options.apiSecret - API secret
   * @param {string} options.apiUrl - API base URL
   * @returns {string} Generated JavaScript code
   */
  generateClientCode({ metricConfig, apiKey, apiSecret, apiUrl }) {
    const metricName = metricConfig.metricName;
    const metricType = metricConfig.metricType || 'gauge';
    const labels = metricConfig.labels || {};
    const autoTrack = metricConfig.autoTrack !== false;
    const trackingEvents = metricConfig.trackingEvents || [];

    // Build labels string
    const labelsString = this.buildLabelsString(labels);

    // Build tracking code
    const trackingCode = this.buildTrackingCode(metricConfig, trackingEvents);

    // Generate the code
    const code = `/**
 * Auto-generated Visibility Tracker Code
 * Metric: ${metricConfig.name} (${metricName})
 * Generated: ${new Date().toISOString()}
 * 
 * Instructions:
 * 1. Copy this entire code block
 * 2. Paste it before the closing </body> tag of your HTML
 * 3. The metrics will automatically start tracking
 */

(function() {
  'use strict';

  // Configuration
  const CONFIG = {
    apiUrl: '${apiUrl}',
    apiKey: '${apiKey}',
    apiSecret: '${apiSecret}',
    metricName: '${metricName}',
    metricType: '${metricType}',
    labels: ${JSON.stringify(labels, null, 2)},
    batchSize: 10,
    flushInterval: 5000
  };

  // Internal state
  let metricsQueue = [];
  let flushTimer = null;

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
      viewportHeight: window.innerHeight
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
      referrer: document.referrer || '',
      title: document.title || ''
    };
  }

  /**
   * Flush metrics to API
   */
  function flushMetrics() {
    if (metricsQueue.length === 0) return;

    const metricsToSend = [...metricsQueue];
    metricsQueue = [];

    const url = CONFIG.apiUrl.replace(/\\/$/, '') + '/api/v1/metrics';
    const payload = {
      metrics: metricsToSend,
      job: 'web_client',
      instance: CONFIG.apiKey
    };

    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': CONFIG.apiKey,
        'X-API-Secret': CONFIG.apiSecret
      },
      body: JSON.stringify(payload),
      keepalive: true
    }).catch(function(error) {
      console.error('[VisibilityTracker] Failed to send metrics:', error);
      // Re-queue on failure (up to limit)
      if (metricsToSend.length < 100) {
        metricsQueue.unshift(...metricsToSend);
      }
    });
  }

  /**
   * Schedule metrics flush
   */
  function scheduleFlush() {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(flushMetrics, CONFIG.flushInterval);
  }

  /**
   * Track metric
   */
  function trackMetric(value, additionalLabels = {}) {
    const browserInfo = getBrowserInfo();
    const pageInfo = getPageInfo();

    const metric = {
      name: CONFIG.metricName,
      value: typeof value === 'number' ? value : parseFloat(value) || 0,
      type: CONFIG.metricType,
      labels: {
        ...CONFIG.labels,
        ...additionalLabels,
        ...browserInfo,
        ...pageInfo,
        timestamp: new Date().toISOString()
      }
    };

    metricsQueue.push(metric);

    // Flush if batch size reached
    if (metricsQueue.length >= CONFIG.batchSize) {
      flushMetrics();
    } else {
      scheduleFlush();
    }
  }

  ${trackingCode}

  // Auto-track on page load if enabled
  if (${autoTrack}) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        trackMetric(1, { event: 'page_load' });
      });
    } else {
      trackMetric(1, { event: 'page_load' });
    }

    // Track page views on navigation (for SPAs)
    if (window.history && window.history.pushState) {
      const originalPushState = window.history.pushState;
      window.history.pushState = function() {
        originalPushState.apply(window.history, arguments);
        setTimeout(function() {
          trackMetric(1, { event: 'page_view' });
        }, 100);
      };

      window.addEventListener('popstate', function() {
        setTimeout(function() {
          trackMetric(1, { event: 'page_view' });
        }, 100);
      });
    }

    // Flush on page unload
    window.addEventListener('beforeunload', function() {
      if (navigator.sendBeacon && metricsQueue.length > 0) {
        const url = CONFIG.apiUrl.replace(/\\/$/, '') + '/api/v1/metrics';
        const data = JSON.stringify({
          metrics: metricsQueue,
          job: 'web_client',
          instance: CONFIG.apiKey
        });
        navigator.sendBeacon(url, data);
      } else {
        flushMetrics();
      }
    });
  }

  // Expose public API
  window.VisibilityTracker = {
    track: trackMetric,
    flush: flushMetrics
  };
})();
`;

    return code;
  }

  /**
   * Build labels string for code
   */
  buildLabelsString(labels) {
    if (!labels || Object.keys(labels).length === 0) {
      return '{}';
    }
    return JSON.stringify(labels);
  }

  /**
   * Build tracking code based on events
   */
  buildTrackingCode(metricConfig, trackingEvents) {
    if (!trackingEvents || trackingEvents.length === 0) {
      return '';
    }

    let code = '\n  // Custom event tracking\n';
    
    trackingEvents.forEach(event => {
      switch (event) {
        case 'click':
          code += `  document.addEventListener('click', function(e) {
    trackMetric(1, { event: 'click', element: e.target.tagName });
  });\n`;
          break;
        case 'scroll':
          code += `  let scrollTracked = false;
  window.addEventListener('scroll', function() {
    if (!scrollTracked) {
      scrollTracked = true;
      trackMetric(1, { event: 'scroll' });
    }
  });\n`;
          break;
        case 'form_submit':
          code += `  document.addEventListener('submit', function(e) {
    trackMetric(1, { event: 'form_submit', formId: e.target.id || 'unknown' });
  });\n`;
          break;
        case 'button_click':
          code += `  document.addEventListener('click', function(e) {
    if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
      trackMetric(1, { event: 'button_click', buttonText: e.target.textContent.substring(0, 50) });
    }
  });\n`;
          break;
        default:
          code += `  // Custom event: ${event}\n`;
      }
    });

    return code;
  }
}

module.exports = new CodeGeneratorService();

