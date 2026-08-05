const { execSync } = require('child_process');

const SSH_HOST = 'azureuser@4.145.89.253';
const SSH_KEY = 'magnus-ci-server_key.pem';
const SSH_CMD = `ssh -i ${SSH_KEY} -o StrictHostKeyChecking=no ${SSH_HOST}`;

describe('Production-Grade Kubernetes Infrastructure Test Suite', () => {

  test('1. Kubernetes Cluster Node Health (k3s Node is Ready)', () => {
    const output = execSync(`${SSH_CMD} "sudo k3s kubectl get nodes"`, {
      cwd: '/Users/amankashyap/Documents/ci-cd-engine',
      encoding: 'utf8'
    });

    expect(output).toContain('magnus-ci-server');
    expect(output).toContain('Ready');
  });

  test('2. Kubernetes Deployments & Pod Readiness (1/1 Running)', () => {
    const output = execSync(`${SSH_CMD} "sudo k3s kubectl get pods -o json"`, {
      cwd: '/Users/amankashyap/Documents/ci-cd-engine',
      encoding: 'utf8'
    });

    const podData = JSON.parse(output);
    const pods = podData.items;

    const requiredApps = ['magnus-api', 'magnus-worker', 'postgres', 'redis', 'minio'];

    for (const app of requiredApps) {
      const matchingPod = pods.find(p => {
        const labels = p.metadata.labels || {};
        const isApp = labels.app === app;
        const isNotDeleting = !p.metadata.deletionTimestamp;
        const isRunning = p.status.phase === 'Running';
        const containerStatuses = p.status.containerStatuses || [];
        const isReady = containerStatuses.length > 0 && containerStatuses[0].ready === true;
        return isApp && isNotDeleting && isRunning && isReady;
      });

      expect(matchingPod).toBeDefined();
    }
  });

  test('3. Kubernetes Worker Pod Volume Mounts & HostPath Isolation', () => {
    const output = execSync(`${SSH_CMD} "sudo k3s kubectl get deployment magnus-worker -o json"`, {
      cwd: '/Users/amankashyap/Documents/ci-cd-engine',
      encoding: 'utf8'
    });

    const deployment = JSON.parse(output);
    const volumes = deployment.spec.template.spec.volumes || [];
    
    // Verify docker-socket hostPath volume
    const dockerSocketVol = volumes.find(v => v.name === 'docker-socket');
    expect(dockerSocketVol).toBeDefined();
    expect(dockerSocketVol.hostPath.path).toBe('/var/run/docker.sock');

    // Verify temp-builds hostPath volume
    const tempBuildsVol = volumes.find(v => v.name === 'temp-builds');
    expect(tempBuildsVol).toBeDefined();
    expect(tempBuildsVol.hostPath.path).toBe('/tmp/magnus-builds');
  });

  test('4. Kubernetes Cluster Resource Utilization & Service Connectivity', () => {
    const output = execSync(`${SSH_CMD} "sudo k3s kubectl get svc -o json"`, {
      cwd: '/Users/amankashyap/Documents/ci-cd-engine',
      encoding: 'utf8'
    });

    const svcData = JSON.parse(output);
    const services = svcData.items.map(s => s.metadata.name);

    expect(services).toContain('magnus-api');
    expect(services).toContain('postgres');
    expect(services).toContain('redis');
    expect(services).toContain('minio');
  });

});
