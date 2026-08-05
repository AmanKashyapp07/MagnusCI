const { spawnK8sBuildJob } = require('../../backend/src/runners/k8sRunner');

// Mock @kubernetes/client-node
jest.mock('@kubernetes/client-node', () => {
  const mockCreateNamespacedJob = jest.fn();
  const mockReadNamespacedJobStatus = jest.fn();

  return {
    KubeConfig: jest.fn().mockImplementation(() => ({
      loadFromCluster: jest.fn(),
      loadFromDefault: jest.fn(),
      makeApiClient: jest.fn((apiClass) => {
        if (apiClass.name === 'BatchV1Api' || apiClass.toString().includes('BatchV1Api')) {
          return {
            createNamespacedJob: mockCreateNamespacedJob,
            readNamespacedJobStatus: mockReadNamespacedJobStatus
          };
        }
        return {};
      })
    })),
    BatchV1Api: class BatchV1Api {},
    CoreV1Api: class CoreV1Api {}
  };
});

describe('Scaling Unit Tests: Kubernetes Job Runner (runners/k8sRunner.js)', () => {
  let mockK8sApi;

  beforeEach(() => {
    jest.clearAllMocks();
    const k8s = require('@kubernetes/client-node');
    const kc = new k8s.KubeConfig();
    mockK8sApi = kc.makeApiClient(k8s.BatchV1Api);
  });

  test('should construct valid K8s Job manifest and spawn job successfully', async () => {
    mockK8sApi.createNamespacedJob.mockResolvedValue({ body: { metadata: { name: 'test-job' } } });
    mockK8sApi.readNamespacedJobStatus.mockResolvedValue({
      body: { status: { succeeded: 1 } }
    });

    const result = await spawnK8sBuildJob({
      buildId: 101,
      stageName: 'test',
      image: 'node:20-alpine',
      command: 'npm test',
      workspacePvcName: 'magnus-workspace-pvc'
    });

    expect(result.exitCode).toBe(0);
    expect(mockK8sApi.createNamespacedJob).toHaveBeenCalledTimes(1);

    const [namespace, manifest] = mockK8sApi.createNamespacedJob.mock.calls[0];
    expect(namespace).toBe('default');
    expect(manifest.apiVersion).toBe('batch/v1');
    expect(manifest.kind).toBe('Job');
    expect(manifest.spec.ttlSecondsAfterFinished).toBe(120);
    expect(manifest.spec.template.spec.containers[0].command).toEqual(['sh', '-c', 'npm test']);
  });

  test('should throw error when K8s Job fails execution', async () => {
    mockK8sApi.createNamespacedJob.mockResolvedValue({ body: {} });
    mockK8sApi.readNamespacedJobStatus.mockResolvedValue({
      body: { status: { failed: 1 } }
    });

    await expect(spawnK8sBuildJob({
      buildId: 102,
      stageName: 'compile',
      image: 'node:20-alpine',
      command: 'npm run build'
    })).rejects.toThrow(/failed in K8s Job/);
  });

  test('should handle K8s API creation failure gracefully', async () => {
    mockK8sApi.createNamespacedJob.mockRejectedValue(new Error('Kubernetes API Cluster Unavailable'));

    await expect(spawnK8sBuildJob({
      buildId: 103,
      stageName: 'lint',
      command: 'npm run lint'
    })).rejects.toThrow('Kubernetes API Cluster Unavailable');
  });
});
