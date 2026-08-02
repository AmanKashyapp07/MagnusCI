const express = require('express');
const buildsController = require('../controllers/buildsController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', authenticateToken, buildsController.getBuilds.bind(buildsController));
router.get('/:id/logs', authenticateToken, buildsController.getBuildLogs.bind(buildsController));

module.exports = router;
