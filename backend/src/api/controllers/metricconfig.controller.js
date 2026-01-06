/**
 * Metric Configuration Controller
 * Handles CRUD operations for user metric configurations
 */

const { MetricConfig } = require('../../models');
const logger = require('../../utils/logger');
const codeGenerator = require('../../services/codeGenerator.service');

class MetricConfigController {
  /**
   * Create metric configuration
   * POST /api/v1/metric-configs
   */
  async createMetricConfig(req, res, next) {
    try {
      const {
        name,
        description,
        metricName,
        metricType,
        labels,
        autoTrack,
        trackingEvents
      } = req.body;

      const metricConfig = await MetricConfig.create({
        userId: req.user.id,
        name,
        description,
        metricName,
        metricType: metricType || 'gauge',
        labels: labels || {},
        autoTrack: autoTrack !== undefined ? autoTrack : true,
        trackingEvents: trackingEvents || []
      });

      logger.info('Metric configuration created', {
        userId: req.user.id,
        configId: metricConfig.id,
        metricName: metricConfig.metricName
      });

      res.status(201).json({
        success: true,
        message: 'Metric configuration created successfully',
        data: metricConfig
      });
    } catch (error) {
      logger.error('Error creating metric configuration', {
        error: error.message,
        stack: error.stack
      });
      next(error);
    }
  }

  /**
   * List user's metric configurations
   * GET /api/v1/metric-configs
   */
  async listMetricConfigs(req, res, next) {
    try {
      const metricConfigs = await MetricConfig.findAll({
        where: { userId: req.user.id },
        order: [['createdAt', 'DESC']]
      });

      res.json({
        success: true,
        data: metricConfigs
      });
    } catch (error) {
      logger.error('Error listing metric configurations', {
        error: error.message,
        stack: error.stack
      });
      next(error);
    }
  }

  /**
   * Get single metric configuration
   * GET /api/v1/metric-configs/:id
   */
  async getMetricConfig(req, res, next) {
    try {
      const { id } = req.params;

      const metricConfig = await MetricConfig.findOne({
        where: { id, userId: req.user.id }
      });

      if (!metricConfig) {
        return res.status(404).json({
          error: true,
          message: 'Metric configuration not found'
        });
      }

      res.json({
        success: true,
        data: metricConfig
      });
    } catch (error) {
      logger.error('Error fetching metric configuration', {
        error: error.message,
        stack: error.stack
      });
      next(error);
    }
  }

  /**
   * Update metric configuration
   * PUT /api/v1/metric-configs/:id
   */
  async updateMetricConfig(req, res, next) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      const metricConfig = await MetricConfig.findOne({
        where: { id, userId: req.user.id }
      });

      if (!metricConfig) {
        return res.status(404).json({
          error: true,
          message: 'Metric configuration not found'
        });
      }

      await metricConfig.update(updateData);

      logger.info('Metric configuration updated', {
        userId: req.user.id,
        configId: id
      });

      res.json({
        success: true,
        message: 'Metric configuration updated successfully',
        data: metricConfig
      });
    } catch (error) {
      logger.error('Error updating metric configuration', {
        error: error.message,
        stack: error.stack
      });
      next(error);
    }
  }

  /**
   * Delete metric configuration
   * DELETE /api/v1/metric-configs/:id
   */
  async deleteMetricConfig(req, res, next) {
    try {
      const { id } = req.params;

      const metricConfig = await MetricConfig.findOne({
        where: { id, userId: req.user.id }
      });

      if (!metricConfig) {
        return res.status(404).json({
          error: true,
          message: 'Metric configuration not found'
        });
      }

      await metricConfig.destroy();

      logger.info('Metric configuration deleted', {
        userId: req.user.id,
        configId: id
      });

      res.json({
        success: true,
        message: 'Metric configuration deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting metric configuration', {
        error: error.message,
        stack: error.stack
      });
      next(error);
    }
  }

  /**
   * Generate client library code
   * POST /api/v1/metric-configs/:id/generate-code
   */
  async generateCode(req, res, next) {
    try {
      const { id } = req.params;
      const { apiKeyId } = req.body;

      const metricConfig = await MetricConfig.findOne({
        where: { id, userId: req.user.id, isActive: true }
      });

      if (!metricConfig) {
        return res.status(404).json({
          error: true,
          message: 'Metric configuration not found or inactive'
        });
      }

      // Get API key if provided
      let apiKey = null;
      let apiSecret = null;
      
      if (apiKeyId) {
        const { ApiKey } = require('../../models');
        const keyRecord = await ApiKey.findOne({
          where: { id: apiKeyId, userId: req.user.id, isActive: true }
        });
        
        if (keyRecord) {
          apiKey = keyRecord.apiKey;
          apiSecret = keyRecord.apiSecret;
        }
      }

      // Generate custom client library code
      const generatedCode = codeGenerator.generateClientCode({
        metricConfig,
        apiKey: apiKey || 'YOUR_API_KEY',
        apiSecret: apiSecret || 'YOUR_API_SECRET',
        apiUrl: process.env.API_URL || `http://${req.get('host')}`
      });

      logger.info('Code generated for metric configuration', {
        userId: req.user.id,
        configId: id
      });

      res.json({
        success: true,
        message: 'Code generated successfully',
        data: {
          code: generatedCode,
          metricConfig: {
            id: metricConfig.id,
            name: metricConfig.name,
            metricName: metricConfig.metricName,
            metricType: metricConfig.metricType
          },
          apiKey: apiKey ? {
            id: apiKeyId,
            key: apiKey,
            secret: apiSecret
          } : null
        }
      });
    } catch (error) {
      logger.error('Error generating code', {
        error: error.message,
        stack: error.stack
      });
      next(error);
    }
  }
}

module.exports = new MetricConfigController();

