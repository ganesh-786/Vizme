/**
 * Client Library Controller
 * Handles client library serving and information
 */

const fs = require('fs');
const path = require('path');
const config = require('../../config');

class ClientLibController {
  /**
   * Get client library JavaScript
   * GET /api/v1/client/script.js
   */
  getClientScript(req, res) {
    try {
      const clientLibPath = path.join(__dirname, '../../../clientlib/visibility-client.js');
      
      // Check if file exists
      if (!fs.existsSync(clientLibPath)) {
        return res.status(404).json({
          error: true,
          message: 'Client library not found'
        });
      }

      // Read and serve the client library
      const clientScript = fs.readFileSync(clientLibPath, 'utf8');
      
      // Replace API URL placeholder if needed
      const apiUrl = process.env.API_URL || `http://${req.get('host')}`;
      const scriptWithApiUrl = clientScript.replace('{{API_URL}}', apiUrl);

      res.setHeader('Content-Type', 'application/javascript');
      res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
      res.send(scriptWithApiUrl);
    } catch (error) {
      res.status(500).json({
        error: true,
        message: 'Failed to serve client library',
        error: error.message
      });
    }
  }

  /**
   * Get client library information
   * GET /api/v1/client
   */
  getClientInfo(req, res) {
    const apiUrl = process.env.API_URL || `http://${req.get('host')}`;
    
    res.json({
      name: 'Unified Visibility Platform Client Library',
      version: '1.0.0',
      scriptUrl: `${apiUrl}/api/v1/client/script.js`,
      usage: {
        embed: `<script src="${apiUrl}/api/v1/client/script.js"></script>`,
        initialize: `
<script>
  VisibilityTracker.init({
    apiUrl: '${apiUrl}',
    clientId: 'your-client-id', // Optional
    autoTrack: true // Automatically track page views
  });
</script>`,
        manualTracking: `
<script>
  // Track custom metrics
  VisibilityTracker.track('page_views', 1, {
    page: window.location.pathname,
    referrer: document.referrer
  });
</script>`
      },
      endpoints: {
        metrics: `${apiUrl}/api/v1/metrics`
      }
    });
  }
}

module.exports = new ClientLibController();

