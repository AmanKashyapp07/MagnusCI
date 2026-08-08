const express = require('express');
const path = require('path');
const fs = require('fs');
const previewService = require('../services/previewService');

const router = express.Router();

/**
 * GET /api/builds/:id/preview
 * Returns preview status and metadata for a given build
 */
router.get('/api/builds/:id/preview', (req, res) => {
  const buildId = req.params.id;
  const preview = previewService.getPreview(buildId);

  if (!preview) {
    return res.status(404).json({
      deployed: false,
      message: `No active preview environment found for build #${buildId}.`
    });
  }

  res.json({
    deployed: true,
    buildId: preview.buildId,
    previewUrl: preview.previewUrl,
    totalFiles: preview.totalFiles,
    totalBytes: preview.totalBytes,
    expiresAt: new Date(preview.expiresAt).toISOString()
  });
});

/**
 * Serves static preview files with MIME mapping and SPA fallback
 */
router.use('/preview/:buildId', (req, res) => {
  const buildId = req.params.buildId;
  const rawSubPath = req.path.replace(/^\//, '');
  const subPath = rawSubPath || 'index.html';
  const preview = previewService.getPreview(buildId);

  const baseDir = preview?.targetDir || path.join('/tmp/magnus-previews', `build-${buildId}`);

  if (!fs.existsSync(baseDir)) {
    return res.status(404).send('<h3>404: Preview environment not found or expired.</h3>');
  }

  let requestedFile = path.join(baseDir, subPath);

  // Directory request -> index.html
  if (fs.existsSync(requestedFile) && fs.statSync(requestedFile).isDirectory()) {
    requestedFile = path.join(requestedFile, 'index.html');
  }

  // SPA fallback if asset doesn't exist
  if (!fs.existsSync(requestedFile)) {
    requestedFile = path.join(baseDir, 'index.html');
  }

  if (fs.existsSync(requestedFile)) {
    res.setHeader('Cache-Control', 'public, max-age=300'); // 5-minute preview caching
    return res.sendFile(requestedFile);
  }

  res.status(404).send('<h3>404: index.html not found in preview deployment.</h3>');
});

module.exports = router;
