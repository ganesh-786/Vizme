import express from 'express';
import axios from 'axios';
import { body, validationResult } from 'express-validator';
import { authenticateApiKey, authenticate } from '../middleware/auth.middleware.js';
import { metricsLimiter } from '../middleware/rateLimiter.js';
import { BadRequestError } from '../middleware/errorHandler.js';
import { query } from '../database/connection.js';

const router = express.Router();

const PUSHGATEWAY_URL = process.env.PUSHGATEWAY_URL || 'http://localhost:9091';
const METRIC_TYPES = ['counter', 'gauge', 'histogram', 'summary'];

  // In-Memory store for counter Aggregation
  // key format: `${userId}_${metricName}_${labelString}`
  //value: cumulative counter value
  const counterAggregation = new Map();

  // In-Memory store for gauge state
  // key format: `${userId}_${metricName}_${labelString}`
  //value: current gauge value
  const gaugeState = new Map();


// Validate metric value
const validateMetricValue = (value, type) => {
  const numValue = typeof value === 'number' ? value : parseFloat(value);
  
  if (isNaN(numValue)) {
    return false;
  }

  // Prometheus values must be non-negative for counters
  if (type === 'counter' && numValue < 0) {
    return false;
  }

  return true;
};

// Push metric to Prometheus Pushgateway
const pushToPrometheus = async (metric, userId) => {
  let { name, type, value, labels } = metric;

  const labelStringForKey = Object.entries(labels || {})
    .sort(([a], [b]) => a.localeCompare(b)) //sort for consistent key
    .map(([k, v]) => `${k}=${v}`)
    .join(',');

    const aggregationKey = `${userId}_${name}_${labelStringForKey}`;
    
  //Debug: Log incoming metric
  console.log("📥 [Metric] Received:", {
    name,
    type,
    incomingValue: value,
    labels,
    aggregationKey
  });

  //For counter metrics, we need to aggregate values before pushing
  // Pushgateway replaces metrics, so we need to maintain cumulative value
  if (type === 'counter') {
    const currentValue = counterAggregation.get(aggregationKey) || 0;
    const cumulativeValue = currentValue + value;

    //Debug: Log aggregated value
    console.log(" 🔢[COUNTER] Aggregated:", {
      key: aggregationKey,
      current: currentValue,
      incoming: value,
      cumulative: cumulativeValue
    });

    //store the new cumulative value
    counterAggregation.set(aggregationKey, cumulativeValue);

    //we would use this cumulative value for pushing to Pushgateway
    value = cumulativeValue;
  }

  //for gauge metrics, track state and handle increment/decrements
  //Gauges can increase or decrease, so we need to maintain current state
  else if (type === 'gauge') {
    //get the current value from the state or start at 0 if not set
    const currentValue = gaugeState.get(aggregationKey) || 0;

  //For gauge metrics, we should always treat incoming values as deltas which is basically increment/decrement because gauges can go up or down
  //the client frontend code will send positive values for increment() and will send negative values for decrement()
  //add the value to the current value to get the new gauge state
    let newValue = currentValue + value;

    //Ensure gauge doesn't go below 0 (optional for now can be removed when negative values are allowed)
    newValue = Math.max(0, newValue)

    //Debug: Log aggregated value
    console.log(" [GAUGE] Aggregated:", {
      key: aggregationKey,
      current: currentValue,
      incoming: value,
      newValue,
    });

    //store the new gauge value
    gaugeState.set(aggregationKey, newValue);

    // Use the new value for pushing
    value = newValue;
  }else{
    // DEBUG: Log if type is neither counter nor gauge
    console.log(" [OTHER] Metric type:", type, "No aggregation applied");
  }


  
    // Build Prometheus metric format
    const labelString = Object.entries(labels || {})
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, '\\"')}"`)
    .join(',');

    const metricLine = labelString 
    ? `${name}{${labelString}} ${value}`
    : `${name} ${value}`;

  // Pushgateway requires TYPE declaration and trailing newline
  const metricString = `# TYPE ${name} ${type}\n${metricLine}\n`;

   // 🔍 DEBUG: Log what's being pushed
   console.log("📤 [PUSH] To Pushgateway:", {
    name,
    type,
    finalValue: value,
    url: `${PUSHGATEWAY_URL}/metrics/job/user_${userId}`,
  });

  // Push to Pushgateway
  // Format: /metrics/job/<job_name>/<label>/<label_value>
  const jobName = `user_${userId}`;
  const pushUrl = `${PUSHGATEWAY_URL}/metrics/job/${jobName}`;

  try {
    await axios.post(pushUrl, metricString, {
      headers: {
        'Content-Type': 'text/plain'
      },
      timeout: 5000,
    });
  // 🔍 DEBUG: Log success
  console.log("✅ [SUCCESS] Pushed to Pushgateway:", name, "=", value);
} catch (error) {
  console.error("❌ [ERROR] Failed to push to Pushgateway:", error.message);
  throw new Error('Failed to push metric to Prometheus');
}
};

// Metrics ingestion endpoint (requires API key)
router.post('/',
    // Add CORS middleware
    (req, res, next) => {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
      if (req.method === 'OPTIONS') {
        return res.status(200).end();
      }
      next();
    },
    authenticateApiKey,
    metricsLimiter,
  [
    body('metrics').isArray({ min: 1, max: 100 }).withMessage('Metrics must be an array with 1-100 items'),
    body('metrics.*.name').trim().isLength({ min: 1 }).withMessage('Metric name is required'),
    body('metrics.*.type').isIn(METRIC_TYPES).withMessage(`Metric type must be one of: ${METRIC_TYPES.join(', ')}`),
    body('metrics.*.value').custom((value) => {
      const numValue = typeof value === 'number' ? value : parseFloat(value);
      if (isNaN(numValue)) {
        throw new Error('Metric value must be a number');
      }
      return true;
    }),
    body('metrics.*.labels').optional().isObject()
  ],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        throw new BadRequestError('Validation failed', errors.array());
      }

      const { metrics } = req.body;
      const userId = req.user.id;

      //Fetch all metric configs for this user to get correct types
      // This ensusres we use the type configured by the user in the dashboard
      const configsResult = await query(
        "SELECT metric_name, metric_type FROM metric_configs WHERE user_id = $1",
        [userId]
      );

      // Create a map for quick lookup: metric_name -> metric_type
      const metricConfigMap = {};
      configsResult.rows.forEach((config) => {
        metricConfigMap[config.metric_name] = config.metric_type;
      });

      // Validate and process each metric
      const validMetrics = [];
      const errors_list = [];

      for (let i = 0; i < metrics.length; i++) {
        const metric = metrics[i];

         // Use type from user's metric config if it exists, otherwise use client's type
        // This ensures the backend is the source of truth for metric types
        const metricType = metricConfigMap[metric.name] || metric.type;

        // 🔍 DEBUG: Log type resolution
        console.log("🔍 [TYPE] Resolution:", {
          metricName: metric.name,
          clientType: metric.type,
          configType: metricConfigMap[metric.name] || "not found",
          finalType: metricType,
          hasConfig: !!metricConfigMap[metric.name],
        });

        // Validate metric value using the correct type
        if (!validateMetricValue(metric.value, metricType)) {
          errors_list.push({
            index: i,
            error: `Invalid value for ${metricType} metric`,
          });
          continue;
        }

        // Verify metric config exists (optional - can allow custom metrics)
        // For MVP, we'll allow any metric but log it
        //Use the type from config (or Client's type if no config exists)
        validMetrics.push({
          name: metric.name,
          type: metricType,
          value: typeof metric.value === 'number' ? metric.value : parseFloat(metric.value),
          labels: {
            ...metric.labels,
            user_id: userId.toString()
          }
        });
      }

      if (validMetrics.length === 0) {
        throw new BadRequestError('No valid metrics to process', errors_list);
      }

      // Push to Prometheus Pushgateway
      const pushPromises = validMetrics.map(metric => pushToPrometheus(metric, userId));
      await Promise.allSettled(pushPromises);

      res.json({
        success: true,
        data: {
          processed: validMetrics.length,
          total: metrics.length,
          errors: errors_list.length > 0 ? errors_list : undefined
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

// Get metrics (for authenticated users to view their metrics)
router.get('/',
  authenticate,
  async (req, res, next) => {
    try {
      // This would typically query Prometheus API or a metrics database
      // For MVP, we'll return a message directing to Grafana
      res.json({
        success: true,
        message: 'View your metrics in Grafana',
        grafanaUrl: process.env.GRAFANA_URL || 'http://localhost:3001'
      });
    } catch (error) {
      next(error);
    }
  }
);

export { router as metricsRoutes };

