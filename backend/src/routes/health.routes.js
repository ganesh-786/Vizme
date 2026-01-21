import express from 'express';
import { query } from '../database/connection.js';

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

export { router as healthRoutes };
