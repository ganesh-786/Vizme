/**
 * User Model
 * Represents users who can sign up and configure metrics
 */

const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');
const config = require('../config');

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
    validate: {
      len: [6, 100]
    }
  },
  firstName: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'first_name'
  },
  lastName: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'last_name'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'is_active'
  },
  lastLoginAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_login_at'
  }
}, {
  tableName: 'users',
  indexes: [
    { unique: true, fields: ['email'] }
  ],
  hooks: {
    beforeCreate: async (user) => {
      if (user.password) {
        user.password = await bcrypt.hash(user.password, config.auth.bcryptRounds);
      }
    },
    beforeUpdate: async (user) => {
      if (user.changed('password')) {
        user.password = await bcrypt.hash(user.password, config.auth.bcryptRounds);
      }
    }
  }
});

// Instance method to compare password
User.prototype.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to get public user data (without password)
User.prototype.toPublicJSON = function() {
  const values = this.toJSON();
  delete values.password;
  return values;
};

module.exports = User;

