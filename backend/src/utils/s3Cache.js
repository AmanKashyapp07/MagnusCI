const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const stream = require('stream');
const { promisify } = require('util');
const pipeline = promisify(stream.pipeline);
const logger = require('../utils/logger');

// Configure S3 Client to connect to the in-cluster MinIO instance
const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT || 'http://minio:9000',
  region: 'us-east-1', // MinIO defaults
  credentials: {
    accessKeyId: process.env.MINIO_ROOT_USER || 'minioadmin',
    secretAccessKey: process.env.MINIO_ROOT_PASSWORD || 'minioadmin'
  },
  forcePathStyle: true // Mandatory for MinIO S3 API compatibility
});

const BUCKET_NAME = 'magnus-caches';

/**
 * Uploads a local tarball dependency cache to the MinIO cluster
 */
async function uploadCacheToMinIO(cacheKey, filePath) {
  try {
    const fileStream = fs.createReadStream(filePath);
    logger.info(`Uploading cache ${cacheKey}.tar.gz to MinIO...`);
    
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `${cacheKey}.tar.gz`,
      Body: fileStream
    }));
    logger.info(`Successfully uploaded cache ${cacheKey}.tar.gz`);
  } catch (error) {
    logger.error(`Failed to upload cache to MinIO:`, error);
  }
}

/**
 * Downloads a tarball dependency cache from the MinIO cluster
 * Returns true if cache exists and was downloaded, false otherwise.
 */
async function downloadCacheFromMinIO(cacheKey, destinationPath) {
  try {
    logger.info(`Attempting to restore cache ${cacheKey}.tar.gz from MinIO...`);
    
    const response = await s3.send(new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: `${cacheKey}.tar.gz`
    }));

    // Stream the object directly to the local filesystem
    await pipeline(response.Body, fs.createWriteStream(destinationPath));
    logger.info(`Successfully restored cache ${cacheKey}.tar.gz`);
    return true;
  } catch (error) {
    // If the cache doesn't exist, it will throw a NoSuchKey error
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
      logger.info(`Cache miss for ${cacheKey}.tar.gz in MinIO.`);
      return false;
    }
    logger.error(`Failed to download cache from MinIO:`, error);
    return false;
  }
}

module.exports = {
  uploadCacheToMinIO,
  downloadCacheFromMinIO
};
