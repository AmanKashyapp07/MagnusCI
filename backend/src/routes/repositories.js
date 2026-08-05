const express = require('express');
const repositoriesController = require('../controllers/repositoriesController');
const authenticateToken = require('../middleware/authMiddleware');

const router = express.Router();

router.get('/', authenticateToken, repositoriesController.getRepositories.bind(repositoriesController));
router.post('/', authenticateToken, repositoriesController.registerRepository.bind(repositoriesController));
router.post('/:id/sync', authenticateToken, repositoriesController.syncWebhook.bind(repositoriesController));
router.delete('/:id', authenticateToken, repositoriesController.deleteRepository.bind(repositoriesController));

module.exports = router;
