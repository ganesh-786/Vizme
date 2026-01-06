/**
 * Client Library Routes
 * Serves the embeddable JavaScript client library
 */

const express = require('express');
const clientLibController = require('../api/controllers/clientlib.controller');

const router = express.Router();

// GET /api/v1/client/script.js - Serve client library JavaScript
router.get('/script.js', clientLibController.getClientScript);

// GET /api/v1/client - Get client library information
router.get('/', clientLibController.getClientInfo);

module.exports = router;

