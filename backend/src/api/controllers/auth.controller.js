/**
 * Authentication Controller
 * Handles user signup, signin, and token management
 */

const jwt = require('jsonwebtoken');
const { User, ApiKey } = require('../../models');
const config = require('../../config');
const logger = require('../../utils/logger');
const { v4: uuidv4 } = require('uuid');

class AuthController {
  /**
   * User Signup
   * POST /api/v1/auth/signup
   */
  async signup(req, res, next) {
    try {
      const { email, password, firstName, lastName } = req.body;

      // Validate required fields
      if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({
          error: true,
          message: 'All fields are required'
        });
      }

      // Check if user already exists
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser) {
        return res.status(409).json({
          error: true,
          message: 'User with this email already exists'
        });
      }

      // Create new user
      const user = await User.create({
        email,
        password,
        firstName,
        lastName
      });

      // Create default API key for the user
      const apiKey = await ApiKey.create({
        userId: user.id,
        keyName: 'Default Key'
      });

      logger.info('New user registered', {
        userId: user.id,
        email: user.email
      });

      // Generate JWT token
      const token = this.generateToken(user);

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          user: user.toPublicJSON(),
          token,
          apiKey: {
            key: apiKey.apiKey,
            secret: apiKey.apiSecret,
            name: apiKey.keyName
          }
        }
      });
    } catch (error) {
      logger.error('Error during signup', {
        error: error.message,
        stack: error.stack
      });
      next(error);
    }
  }

  /**
   * User Signin
   * POST /api/v1/auth/signin
   */
  async signin(req, res, next) {
    try {
      const { email, password } = req.body;

      // Find user by email
      const user = await User.findOne({ where: { email } });
      if (!user) {
        return res.status(401).json({
          error: true,
          message: 'Invalid email or password'
        });
      }

      // Check if user is active
      if (!user.isActive) {
        return res.status(403).json({
          error: true,
          message: 'Account is deactivated'
        });
      }

      // Verify password
      const isPasswordValid = await user.comparePassword(password);
      if (!isPasswordValid) {
        return res.status(401).json({
          error: true,
          message: 'Invalid email or password'
        });
      }

      // Update last login
      await user.update({ lastLoginAt: new Date() });

      // Generate JWT token
      const token = this.generateToken(user);

      logger.info('User signed in', {
        userId: user.id,
        email: user.email
      });

      res.json({
        success: true,
        message: 'Signed in successfully',
        data: {
          user: user.toPublicJSON(),
          token
        }
      });
    } catch (error) {
      logger.error('Error during signin', {
        error: error.message,
        stack: error.stack
      });
      next(error);
    }
  }

  /**
   * Get current user profile
   * GET /api/v1/auth/me
   */
  async getProfile(req, res, next) {
    try {
      const user = await User.findByPk(req.user.id, {
        include: [{
          model: ApiKey,
          as: 'apiKeys',
          where: { isActive: true },
          required: false
        }]
      });

      if (!user) {
        return res.status(404).json({
          error: true,
          message: 'User not found'
        });
      }

      res.json({
        success: true,
        data: {
          user: user.toPublicJSON(),
          apiKeys: user.apiKeys.map(key => ({
            id: key.id,
            keyName: key.keyName,
            apiKey: key.apiKey,
            createdAt: key.createdAt,
            lastUsedAt: key.lastUsedAt
          }))
        }
      });
    } catch (error) {
      logger.error('Error fetching user profile', {
        error: error.message,
        stack: error.stack
      });
      next(error);
    }
  }

  /**
   * Generate JWT token
   * @private
   */
  generateToken(user) {
    const payload = {
      id: user.id,
      email: user.email
    };

    return jwt.sign(payload, config.auth.jwtSecret, {
      expiresIn: config.auth.jwtExpiresIn
    });
  }
}

module.exports = new AuthController();

