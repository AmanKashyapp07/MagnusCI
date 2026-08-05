////////////////////////////////////////////////////////////////////////////////
// MagnusCI Topological DAG Pipeline Scheduler & Stage Parser
////////////////////////////////////////////////////////////////////////////////

const fs = require('fs');
const path = require('path');

////////////////////////////////////////////////////////////////////////////////
// Function: loadPipelineStages
// Purpose: Reads configuration files or generates baseline presets.
// Inputs: workspacePath (string), language (string), defaultImage (string)
// Outputs: Parsed stages object (stages mapped to dependencies, commands, images)
////////////////////////////////////////////////////////////////////////////////
function loadPipelineStages(workspacePath, language, defaultImage = 'node:20-alpine', defaultCmd = '') {
  const configFile = path.join(workspacePath, 'magnus-ci.json');

  if (fs.existsSync(configFile)) {
    try {
      const rawData = fs.readFileSync(configFile, 'utf8');
      const parsed = JSON.parse(rawData);

      if (parsed.stages && typeof parsed.stages === 'object' && Object.keys(parsed.stages).length > 0) {
        return parsed.stages;
      }
    } catch (e) {
      // Fallback to auto-detected baseline
    }
  }

  // Fallback defaults if no magnus-ci.json exists
  return {
    setup: {
      image: defaultImage,
      run: 'echo "Setting up workspace dependencies..."'
    },
    test: {
      needs: ['setup'],
      image: defaultImage,
      run: defaultCmd || 'npm test -- --passWithNoTests'
    },
    build: {
      needs: ['test'],
      image: defaultImage,
      run: 'echo "Build step completed successfully!"'
    }
  };
}

////////////////////////////////////////////////////////////////////////////////
// Function: hasCycle
// Purpose: Detects cyclic dependencies using Depth First Search (DFS).
////////////////////////////////////////////////////////////////////////////////
function hasCycle(stages) {
  const visited = new Set();
  const recStack = new Set();

  function dfs(node) {
    if (recStack.has(node)) return true;
    if (visited.has(node)) return false;

    visited.add(node);
    recStack.add(node);

    const needs = stages[node]?.needs || [];
    const dependencies = Array.isArray(needs) ? needs : [needs];

    for (const dep of dependencies) {
      if (stages[dep]) {
        if (dfs(dep)) return true;
      }
    }

    recStack.delete(node);
    return false;
  }

  for (const node of Object.keys(stages)) {
    if (dfs(node)) return true;
  }
  return false;
}

////////////////////////////////////////////////////////////////////////////////
// Function: executeDAG
// Purpose: Executes topological stages concurrently based on readiness.
////////////////////////////////////////////////////////////////////////////////
async function executeDAG(stages, runStageFn) {
  const states = {};
  for (const stage of Object.keys(stages)) {
    states[stage] = 'PENDING';
  }

  const activePromises = {};

  while (true) {
    const runningStages = Object.keys(states).filter(s => states[s] === 'RUNNING');
    const pendingStages = Object.keys(states).filter(s => states[s] === 'PENDING');

    if (runningStages.length === 0 && pendingStages.length === 0) {
      break;
    }

    // Identify ready stages
    const readyStages = pendingStages.filter(stage => {
      const needs = stages[stage]?.needs || [];
      const dependencies = Array.isArray(needs) ? needs : [needs];
      return dependencies.every(dep => states[dep] === 'SUCCESS');
    });

    if (readyStages.length === 0 && runningStages.length > 0) {
      await Promise.race(Object.values(activePromises));
      continue;
    }

    if (readyStages.length === 0 && runningStages.length === 0 && pendingStages.length > 0) {
      break;
    }

    // Launch ready stages in parallel
    for (const stage of readyStages) {
      states[stage] = 'RUNNING';
      activePromises[stage] = (async () => {
        try {
          const success = await runStageFn(stage, stages[stage]);
          states[stage] = success ? 'SUCCESS' : 'FAILED';
        } catch (err) {
          states[stage] = 'FAILED';
        }
        delete activePromises[stage];
      })();
    }
  }

  return states;
}

module.exports = {
  loadPipelineStages,
  parseDAG: loadPipelineStages,
  hasCycle,
  executeDAG
};
