import express from 'express';
import { query } from '../database/connection.js';
import { generateLibraryCode } from '../services/codeGenerator.service.js';

const router = express.Router();

/**
 * GET /api/v1/tracker.js
 * 
 * Serves the full tracking library JavaScript file dynamically.
 * This route:
 * 1. Validates the API key from query parameters
 * 2. Fetches user's metric configurations
 * 3. Generates and returns the complete library code
 * 4. Sets proper caching headers for browser optimization
 * 
 * Query Parameters:
 * - k: API key (required)
 * - a: Auto-track enabled (0 or 1, default: 1)
 * - c: Custom events enabled (0 or 1, default: 1)
 */
router.get('/tracker.js', async (req, res, next) => {
  try {
        // ADD THIS: Set CORS headers to allow any origin (for testing)
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); // ADD THIS LINE
       res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none'); // ADD THIS LINE
    
        
        // Handle preflight OPTIONS request
        if (req.method === 'OPTIONS') {
          return res.status(200).end();
        }
        
    const { k: apiKey, a: autoTrackParam, c: customEventsParam } = req.query;
    
    // Validate API key is provided
    if (!apiKey) {
      res.setHeader('Content-Type', 'application/javascript');
      return res.status(400).send('// Error: API key required');
    }

    // Verify API key exists and is active
    const apiKeyResult = await query(
      'SELECT user_id FROM api_keys WHERE api_key = $1 AND is_active = true',
      [apiKey]
    );

    if (apiKeyResult.rows.length === 0) {
      res.setHeader('Content-Type', 'application/javascript');
      return res.status(401).send('// Error: Invalid or inactive API key');
    }

    const userId = apiKeyResult.rows[0].user_id;

    // Get all metric configurations for this user
    const metricConfigsResult = await query(
      'SELECT metric_name, metric_type, labels FROM metric_configs WHERE user_id = $1',
      [userId]
    );

    // Build metrics configuration object
    const metrics = {};
    metricConfigsResult.rows.forEach(config => {
      if (config.metric_name) {
        metrics[config.metric_name] = {
          t: config.metric_type,  // 't' = type (counter, gauge, etc.)
          l: config.labels || {}  // 'l' = labels
        };
      }
    });

    // Parse boolean parameters
    const autoTrack = autoTrackParam !== '0';
    const customEvents = customEventsParam !== '0';

    // Build endpoint URL
    const baseUrl = process.env.API_BASE_URL || req.protocol + '://' + req.get('host');
    const endpoint = `${baseUrl}/api/v1/metrics`;

    // Generate the full library code
    const libraryCode = generateLibraryCode({
      apiKey,
      endpoint,
      metrics,
      autoTrack,
      customEvents
    });

    // Set proper headers for JavaScript file
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    
    // Cache for 1 hour - allows browser to cache the library
    // Users can still get updates by invalidating cache
    res.setHeader('Cache-Control', 'public, max-age=3600');
    
    // Optional: Set ETag for better caching
    res.setHeader('ETag', `"${Buffer.from(libraryCode).toString('base64').substring(0, 27)}"`);

    res.send(libraryCode);
  } catch (error) {
    // Error handling - return JavaScript comment with error
    res.setHeader('Content-Type', 'application/javascript');
    res.status(500).send(`// Error loading tracker: ${error.message}`);
  }
});

export { router as trackerRoutes };