import express from 'express';
import axios from 'axios';
import { query } from '../database/connection.js';
import { grafanaService } from '../services/grafana.service.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    // Check database connection
    await query('SELECT NOW()');
    
    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      error: 'Database connection failed',
      timestamp: new Date().toISOString()
    });
  }
});

// Grafana health check endpoint
router.get('/grafana', async (req, res) => {
  try {
    const grafanaHealth = await grafanaService.checkHealth();
    const grafanaUrl = process.env.GRAFANA_URL || 'http://localhost:3001';
    
    if (grafanaHealth.status === 'healthy') {
      res.json({
        success: true,
        status: 'healthy',
        grafana: {
          url: grafanaUrl,
          status: grafanaHealth.status,
          database: grafanaHealth.database,
          version: grafanaHealth.version
        },
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(503).json({
        success: false,
        status: 'unhealthy',
        grafana: {
          url: grafanaUrl,
          status: grafanaHealth.status,
          error: grafanaHealth.error
        },
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'unhealthy',
      grafana: {
        url: process.env.GRAFANA_URL || 'http://localhost:3001',
        error: error.message
      },
      timestamp: new Date().toISOString()
    });
  }
});

export { router as healthRoutes };

