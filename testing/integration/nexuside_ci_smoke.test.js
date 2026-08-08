const { spawn } = require('child_process');
const path = require('path');

// Path to the NexusIDE test runner script on the local machine
const NEXUS_TEST_SH = process.env.NEXUS_TEST_SH || '/Users/amankashyap/Documents/nexusIDE/test.sh';

jest.setTimeout(15 * 60 * 1000); // 15 minutes - tests may run integration suites

describe('NexusIDE local non-E2E smoke test (CI validation)', () => {
  test('run NexusIDE test.sh (default non-e2e mode) and exit successfully', () => {
    return new Promise((resolve, reject) => {
      const args = [];
      // Run in default mode which executes non-E2E suites (services, security, db, frontend, etc.)
      const child = spawn('bash', [NEXUS_TEST_SH, '--verbose'], { env: process.env });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        const s = chunk.toString();
        stdout += s;
        // Echo a concise progress line to Jest output
        process.stdout.write(s.replace(/\r/g, '\n'));
      });
      child.stderr.on('data', (chunk) => {
        const s = chunk.toString();
        stderr += s;
        process.stderr.write(s.replace(/\r/g, '\n'));
      });

      child.on('error', (err) => reject(err));

      child.on('close', (code) => {
        try {
          expect(code).toBe(0);
          // Ensure summary contains master summary header
          expect(stdout + stderr).toMatch(/MASTER TEST EXECUTION SUMMARY|ALL \d+ PARALLEL TEST SUITES PASSED/i);
          resolve();
        } catch (e) {
          e.message = `NexusIDE test.sh failed (code=${code}): ${e.message}\n--- STDOUT ---\n${stdout}\n--- STDERR ---\n${stderr}`;
          reject(e);
        }
      });
    });
  });
});
