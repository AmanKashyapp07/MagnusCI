////////////////////////////////////////////////////////////////////////////////
// Directed Acyclic Graph (DAG) Pipeline Orchestrator
//
// File Purpose:
// This file serves as the pipeline execution scheduler. It parses dependencies
// (the 'needs' clauses), validates that the dependency graph has no circular
// relationships (cycles), and schedules independent stages concurrently.
//
// High-Level Architecture:
// 1. Preset Resolution: Parses 'magnus-ci.json' or falls back to preset stages
//    associated with the detected language.
// 2. Cycle Detection: Traverses the dependency graph using a DFS cycle-checking
//    algorithm to prevent Deadlocks before any compute resource is allocated.
// 3. Topological Execution Loop: Schedules runnable stages concurrently in
//    parallel containers, pausing the loop using Promise.race until any active
//    job returns.
//
// Interview Topics:
// - DFS Graph Traversal & Back-edge detection (Cycle validation).
// - Topological Sorting & Indegree checks.
// - Concurrency model in Node (Promise.race, Promise.all patterns).
// - Error propagation rules for downstream dependent tasks.
//
// Dependencies: fs, path
////////////////////////////////////////////////////////////////////////////////

const fs = require('fs').promises;
const path = require('path');

//------------------------------------------------------------------------------
// Pipeline Stage Presets
//
// Explains the default compile, test, and build presets per language toolchain.
// If a user doesn't specify a 'magnus-ci.json' custom DAG, these standard DAG structures
// are loaded fallback-style.
//------------------------------------------------------------------------------
const PRESETS = {
  'Node.js': {
    stages: {
      'setup': { run: 'npm ci || npm install' },
      'test': { run: 'npm test -- --passWithNoTests', needs: 'setup' },
      'build': { run: 'npm run build --if-present', needs: 'setup' }
    }
  },
  'Python': {
    stages: {
      'install': { run: 'pip install -r requirements.txt' },
      'test': { run: 'python -m unittest discover', needs: 'install' }
    }
  },
  'Go': {
    stages: {
      'test': { run: 'go test -v ./...' }
    }
  },
  'Java (Maven)': {
    stages: {
      'test': { run: 'mvn test' }
    }
  },
  'Java (Gradle)': {
    stages: {
      'test': { run: 'gradle test' }
    }
  },
  'C/C++ (CMake)': {
    stages: {
      'build': { run: 'mkdir -p build && cd build && cmake .. && make' },
      'test': { run: 'cd build && ctest', needs: 'build' }
    }
  },
  'C/C++ (Make)': {
    stages: {
      'test': { run: 'make test' }
    }
  }
};

////////////////////////////////////////////////////////////////////////////////
// Function: getPreset
// Purpose: Matches detected language slugs to predefined toolchain configurations.
// Inputs: language (string)
// Outputs: Preset object containing stages, or null
// Side Effects: None
// Time Complexity: O(K) where K is number of hardcoded presets.
////////////////////////////////////////////////////////////////////////////////
function getPreset(language) {
  if (!language) return null;
  for (const key of Object.keys(PRESETS)) {
    if (language === key || language.includes(key)) {
      return PRESETS[key];
    }
  }
  return null;
}

////////////////////////////////////////////////////////////////////////////////
// Function: hasCycle
// Purpose: Validates that the pipeline graph contains no loops (directed cycles).
// Inputs: stages (object containing stages mapped to dependencies)
// Outputs: boolean (true if cycle detected, false otherwise)
// Side Effects: None
// Time Complexity: O(V + E) where V is stages count and E is dependencies count.
// Space Complexity: O(V) due to tracking Sets and recursion call stack space.
//
// Algorithm (DFS Cycle Detection):
// We run Depth-First Search (DFS) on each node. We maintain two tracking structures:
// 1. visited: Nodes that have been fully checked (including all their downstreams)
//    so we don't check them again.
// 2. recStack: Nodes currently active in the recursive backtracking call stack.
//
// If we encounter a dependency that is already present in recStack, we have
// detected a back-edge (a loop) and return true.
//
// Interview Discussion:
// Q: Why did you use recursion for DFS here?
// A: The graph vertices are build stages defined by developers in config files.
//    Even complex pipelines have fewer than 20 stages, meaning recursion stack
//    depth is tiny and safe from Stack Overflow.
////////////////////////////////////////////////////////////////////////////////
function hasCycle(stages) {
  const visited = new Set();
  const recStack = new Set();

  function dfs(node) {
    if (recStack.has(node)) return true;
    if (visited.has(node)) return false;

    visited.add(node);
    recStack.add(node);

    const needs = stages[node].needs || [];
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
// Function: loadPipelineStages
// Purpose: Reads configuration files or generates baseline presets.
// Inputs: workspacePath (string), language (string), defaultImage (string)
// Outputs: Parsed stages object (stages mapped to dependencies, commands, images)
// Side Effects: Reads file from local workspace.
// Time Complexity: O(S) where S is size of stages defined.
//
// Logic Details:
// 1. Tries to read 'magnus-ci.json' from the workspace.
// 2. If it is DAG format (has config.stages), iterates and normalizes commands,
//    needs arrays, images, and stage timeout properties.
// 3. If it is legacy format (has image & run), falls back to a single 'build' stage.
// 4. If config file is missing, loads the default language presets or a baseline 'npm test'.
////////////////////////////////////////////////////////////////////////////////
async function loadPipelineStages(workspacePath, language, defaultImage) {
  const configPath = path.join(workspacePath, 'magnus-ci.json');
  try {
    const data = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(data);

    // 1. Check if DAG Format
    if (config.stages && typeof config.stages === 'object') {
      const parsedStages = {};
      for (const [name, stage] of Object.entries(config.stages)) {
        parsedStages[name] = {
          run: stage.run || stage.cmd,
          image: stage.image || defaultImage,
          needs: stage.needs || [],
          timeout: stage.timeout
        };
      }
      return parsedStages;
    }

    // 2. Check if Legacy Format
    if (config.image && config.run) {
      return {
        'build': {
          run: config.run,
          image: config.image,
          needs: []
        }
      };
    }
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err;
    }
  }

  // 3. Fallback to presets based on language
  const preset = getPreset(language);
  if (preset) {
    const parsedStages = {};
    for (const [name, stage] of Object.entries(preset.stages)) {
      parsedStages[name] = {
        run: stage.run,
        image: defaultImage,
        needs: stage.needs || []
      };
    }
    return parsedStages;
  }

  // 4. Default baseline fallback
  return {
    'test': {
      run: 'npm test',
      image: defaultImage,
      needs: []
    }
  };
}

////////////////////////////////////////////////////////////////////////////////
// Function: executeDAG
// Purpose: Topologically schedules and executes pipeline stages in parallel.
// Inputs: stages (object), runStageFn (async function runner mapping to Docker executor)
// Outputs: Final execution states map (e.g. { setup: 'SUCCESS', test: 'FAILED' })
// Side Effects: Spawns container routines via runStageFn.
// Time Complexity: O(V + E) where V is stages count, E is dependencies count.
// Space Complexity: O(V) to store states and active promises.
//
// Algorithm (Topological Parallel Scheduling):
// 1. Initialize all stage states to 'PENDING'.
// 2. Loop continuously while there are stages in 'PENDING' or 'RUNNING' states.
// 3. In each iteration, identify 'ready' stages: pending stages whose dependency
//    stages (defined in needs) are all in the 'SUCCESS' state.
// 4. If ready stages are found, transition their state to 'RUNNING' and trigger
//    their runStageFn promises concurrently.
// 5. If no ready stages exist but some are running, call Promise.race() on active
//    promises to halt loop execution until at least one container exits.
// 6. If no stages are ready and none are running, but pending stages remain, it
//    means some dependencies failed. Abort loop.
//
// Interview Q&A:
// Q: How does error propagation work?
// A: If a stage fails, its state becomes 'FAILED'. Downstream stages that need
//    it will check `dependencies.every(dep => states[dep] === 'SUCCESS')`, which
//    evaluates to false. They remain 'PENDING' and are skipped.
// Q: Why use Promise.race instead of standard polling intervals?
// A: Promise.race registers an event-driven listener on the runtime event loop.
//    As soon as any container terminates, the scheduler loop resumes instantly,
//    maximizing resource utilisation and minimizing latency.
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
      const needs = stages[stage].needs || [];
      const dependencies = Array.isArray(needs) ? needs : [needs];
      // Ready if all dependencies are SUCCESS (or if there are no dependencies)
      return dependencies.every(dep => states[dep] === 'SUCCESS');
    });

    if (readyStages.length === 0 && runningStages.length > 0) {
      // Wait for any running stage to complete
      await Promise.race(Object.values(activePromises));
      continue;
    }

    if (readyStages.length === 0 && runningStages.length === 0 && pendingStages.length > 0) {
      // Abort remaining stages due to block / failures
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
  hasCycle,
  executeDAG
};

