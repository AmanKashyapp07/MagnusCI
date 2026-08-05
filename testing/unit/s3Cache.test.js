const fs = require('fs');

// Variables starting with 'mock' can be referenced inside jest.mock factory
const mockSend = jest.fn();

jest.mock('@aws-sdk/client-s3', () => {
  return {
    S3Client: jest.fn().mockImplementation(() => ({
      send: mockSend
    })),
    PutObjectCommand: jest.fn().mockImplementation(params => ({ type: 'PutObject', params })),
    GetObjectCommand: jest.fn().mockImplementation(params => ({ type: 'GetObject', params }))
  };
});

const { uploadCacheToMinIO, downloadCacheFromMinIO } = require('../../backend/src/utils/s3Cache');

describe('Scaling Unit Tests: MinIO S3 Object Storage Caching (utils/s3Cache.js)', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. uploadCacheToMinIO', () => {
    test('should upload cache tarball to MinIO bucket with forcePathStyle', async () => {
      const mockReadStream = { on: jest.fn() };
      const createReadStreamSpy = jest.spyOn(fs, 'createReadStream').mockReturnValue(mockReadStream);
      mockSend.mockResolvedValue({});

      await uploadCacheToMinIO('test-hash-123', '/tmp/cache.tar.gz');

      expect(createReadStreamSpy).toHaveBeenCalledWith('/tmp/cache.tar.gz');
      expect(mockSend).toHaveBeenCalledTimes(1);

      const commandArg = mockSend.mock.calls[0][0];
      expect(commandArg.type).toBe('PutObject');
      expect(commandArg.params.Bucket).toBe('magnus-caches');
      expect(commandArg.params.Key).toBe('test-hash-123.tar.gz');

      createReadStreamSpy.mockRestore();
    });

    test('should catch and log S3 upload errors without crashing process', async () => {
      jest.spyOn(fs, 'createReadStream').mockReturnValue({});
      mockSend.mockRejectedValue(new Error('S3 Connection Timeout'));

      await expect(uploadCacheToMinIO('test-hash-err', '/tmp/cache.tar.gz')).resolves.not.toThrow();
    });
  });

  describe('2. downloadCacheFromMinIO', () => {
    test('should return false on NoSuchKey / 404 cache miss', async () => {
      const error = new Error('The specified key does not exist.');
      error.name = 'NoSuchKey';
      mockSend.mockRejectedValue(error);

      const result = await downloadCacheFromMinIO('missing-hash', '/tmp/dest.tar.gz');
      expect(result).toBe(false);
    });

    test('should return false on general network failure', async () => {
      mockSend.mockRejectedValue(new Error('Network Error'));

      const result = await downloadCacheFromMinIO('hash-error', '/tmp/dest.tar.gz');
      expect(result).toBe(false);
    });
  });
});
