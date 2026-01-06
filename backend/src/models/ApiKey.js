/**
 * API Key Model
 * Represents API keys for authenticating metric submissions
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

const ApiKey = sequelize.define('ApiKey', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    field: 'user_id'
  },
  keyName: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'key_name'
  },
  apiKey: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    field: 'api_key'
  },
  apiSecret: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'api_secret'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  lastUsedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_used_at'
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'expires_at'
  }
}, {
  tableName: 'api_keys',
  indexes: [
    { unique: true, fields: ['api_key'] },
    { fields: ['user_id'] }
  ],
  hooks: {
    beforeCreate: async (apiKey) => {
      if (!apiKey.apiKey) {
        // Generate API key: vp_<random>
        apiKey.apiKey = 'vp_' + crypto.randomBytes(32).toString('hex');
      }
      if (!apiKey.apiSecret) {
        // Generate API secret: vps_<random>
        apiKey.apiSecret = 'vps_' + crypto.randomBytes(32).toString('hex');
      }
    }
  }
});

// Instance method to verify API secret
ApiKey.prototype.verifySecret = function(secret) {
  return this.apiSecret === secret;
};

module.exports = ApiKey;

