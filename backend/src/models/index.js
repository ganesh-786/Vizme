/**
 * Models Index
 * Initializes all models and their relationships
 */

const sequelize = require('../config/database');
const User = require('./User');
const ApiKey = require('./ApiKey');
const MetricConfig = require('./MetricConfig');

// Define relationships
User.hasMany(ApiKey, {
  foreignKey: 'userId',
  as: 'apiKeys',
  onDelete: 'CASCADE'
});

ApiKey.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

User.hasMany(MetricConfig, {
  foreignKey: 'userId',
  as: 'metricConfigs',
  onDelete: 'CASCADE'
});

MetricConfig.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user'
});

// Initialize database connection
async function initializeDatabase() {
  try {
    await sequelize.authenticate();
    console.log('✅ Database connection established successfully.');
    
    // Sync models (create tables if they don't exist)
    // In production, use migrations instead
    if (process.env.NODE_ENV !== 'production') {
      try {
        await sequelize.sync({ alter: false }); // Use migrations in production
        console.log('✅ Database models synchronized.');
      } catch (syncError) {
        console.error('⚠️ Database sync warning:', syncError.message);
        // Don't fail startup if sync has issues, tables might already exist
        if (syncError.name !== 'SequelizeDatabaseError') {
          throw syncError;
        }
      }
    }
    
    return sequelize;
  } catch (error) {
    console.error('❌ Unable to connect to the database:', error);
    throw error;
  }
}

module.exports = {
  sequelize,
  User,
  ApiKey,
  MetricConfig,
  initializeDatabase
};

