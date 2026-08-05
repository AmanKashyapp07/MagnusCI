const k8s = require('@kubernetes/client-node');
const logger = require('../utils/logger');

const kc = new k8s.KubeConfig();
// loadFromCluster works when deployed inside a pod with service account
// Use loadFromDefault for local testing if needed
try {
  kc.loadFromCluster();
} catch (e) {
  kc.loadFromDefault();
}

const batchApi = kc.makeApiClient(k8s.BatchV1Api);
const coreApi = kc.makeApiClient(k8s.CoreV1Api);

/**
 * Spawns a dynamic ephemeral Kubernetes Job for a single build stage
 * replacing local Docker daemon execution.
 */
async function spawnK8sBuildJob({ buildId, stageName, image, command, workspacePvcName }) {
  const jobName = `build-${buildId}-${stageName}-${Date.now().toString().slice(-4)}`.toLowerCase();

  const jobManifest = {
    apiVersion: 'batch/v1',
    kind: 'Job',
    metadata: {
      name: jobName,
      labels: { app: 'magnus-runner', buildId: String(buildId) }
    },
    spec: {
      ttlSecondsAfterFinished: 120, // Auto-deletes finished jobs after 2 minutes
      template: {
        spec: {
          restartPolicy: 'Never',
          containers: [{
            name: 'runner',
            image: image || 'node:20-alpine',
            command: ['sh', '-c', command],
            volumeMounts: [{ name: 'workspace', mountPath: '/workspace' }]
          }],
          volumes: [{
            name: 'workspace',
            persistentVolumeClaim: { claimName: workspacePvcName || 'magnus-workspace-pvc' }
          }]
        }
      }
    }
  };

  logger.info(`Creating Kubernetes Job ${jobName} for build ${buildId}...`);
  
  try {
    // 1. Create K8s Job
    await batchApi.createNamespacedJob('default', jobManifest);

    // 2. Poll & monitor job status
    return new Promise((resolve, reject) => {
      let timeoutCounter = 0;
      const maxTimeouts = 300; // 10 minutes max run

      const checkInterval = setInterval(async () => {
        try {
          timeoutCounter++;
          if (timeoutCounter > maxTimeouts) {
            clearInterval(checkInterval);
            reject(new Error(`Timeout waiting for K8s Job ${jobName}`));
          }

          const res = await batchApi.readNamespacedJobStatus(jobName, 'default');
          const status = res.body.status;

          if (status.succeeded && status.succeeded > 0) {
            clearInterval(checkInterval);
            resolve({ exitCode: 0 });
          } else if (status.failed && status.failed > 0) {
            clearInterval(checkInterval);
            reject(new Error(`Stage ${stageName} failed in K8s Job ${jobName}`));
          }
        } catch (err) {
          clearInterval(checkInterval);
          reject(err);
        }
      }, 2000);
    });
  } catch (error) {
    logger.error(`Failed to create K8s Job ${jobName}:`, error);
    throw error;
  }
}

module.exports = { spawnK8sBuildJob };
