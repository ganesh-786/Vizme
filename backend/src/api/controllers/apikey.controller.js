/**
 * API Key Controller
 * Handles API key management
 */

const { ApiKey } = require('../../models');
const logger = require('../../utils/logger');

class ApiKeyController {
  /**
   * Create new API key
   * POST /api/v1/apikeys
   */
  async createApiKey(req, res, next) {
    try {
      const { keyName } = req.body;

      const apiKey = await ApiKey.create({
        userId: req.user.id,
        keyName: keyName || 'API Key'
      });

      logger.info('API key created', {
        userId: req.user.id,
        apiKeyId: apiKey.id
      });

      res.status(201).json({
        success: true,
        message: 'API key created successfully',
        data: {
          id: apiKey.id,
          keyName: apiKey.keyName,
          apiKey: apiKey.apiKey,
          apiSecret: apiKey.apiSecret,
          createdAt: apiKey.createdAt
        }
      });
    } catch (error) {
      logger.error('Error creating API key', {
        error: error.message,
        stack: error.stack
      });
      next(error);
    }
  }

  /**
   * List user's API keys
   * GET /api/v1/apikeys
   */
  async listApiKeys(req, res, next) {
    try {
      const apiKeys = await ApiKey.findAll({
        where: { userId: req.user.id },
        order: [['createdAt', 'DESC']]
      });

      res.json({
        success: true,
        data: apiKeys.map(key => ({
          id: key.id,
          keyName: key.keyName,
          apiKey: key.apiKey,
          isActive: key.isActive,
          lastUsedAt: key.lastUsedAt,
          expiresAt: key.expiresAt,
          createdAt: key.createdAt
        }))
      });
    } catch (error) {
      logger.error('Error listing API keys', {
        error: error.message,
        stack: error.stack
      });
      next(error);
    }
  }

  /**
   * Delete API key
   * DELETE /api/v1/apikeys/:id
   */
  async deleteApiKey(req, res, next) {
    try {
      const { id } = req.params;

      const apiKey = await ApiKey.findOne({
        where: { id, userId: req.user.id }
      });

      if (!apiKey) {
        return res.status(404).json({
          error: true,
          message: 'API key not found'
        });
      }

      await apiKey.destroy();

      logger.info('API key deleted', {
        userId: req.user.id,
        apiKeyId: id
      });

      res.json({
        success: true,
        message: 'API key deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting API key', {
        error: error.message,
        stack: error.stack
      });
      next(error);
    }
  }
}

module.exports = new ApiKeyController();

