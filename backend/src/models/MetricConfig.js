/**
 * Metric Configuration Model
 * Represents user-defined metric configurations
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const MetricConfig = sequelize.define('MetricConfig', {
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
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 100]
    }
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  metricName: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      notEmpty: true,
      len: [1, 200]
    },
    field: 'metric_name'
  },
  metricType: {
    type: DataTypes.ENUM('counter', 'gauge', 'histogram', 'summary'),
    defaultValue: 'gauge',
    field: 'metric_type'
  },
  labels: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {}
  },
  autoTrack: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'auto_track'
  },
  trackingEvents: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: [],
    field: 'tracking_events'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  }
}, {
  tableName: 'metric_configs',
  indexes: [
    { fields: ['user_id'] },
    { fields: ['metric_name'] }
  ]
});

module.exports = MetricConfig;

