function parseTimeToSeconds(timeStr) {
  const parts = timeStr.split(':');
  if (parts.length === 3) {
    return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
  }
  return null;
}

function stripAnsi(str) {
  if (!str) return "";
  return str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
}

function processRawLines(rawLogs) {
  if (!rawLogs) return [];
  const lines = rawLogs.split('\n');
  const processedLines = [];
  
  for (let line of lines) {
    let finalLine = line;
    if (line.includes('\r')) {
      const segments = line.split('\r');
      for (const segment of segments) {
        if (stripAnsi(segment).trim().length > 0) {
          finalLine = segment;
        }
      }
    }
    
    const plainTrimmed = stripAnsi(finalLine).trim();
    if (plainTrimmed === "RUNS  ..." || plainTrimmed === "RUNS" || plainTrimmed === "\\" || plainTrimmed === "/" || plainTrimmed === "|" || plainTrimmed === "-") {
      continue;
    }
    processedLines.push(finalLine);
  }

  // Deduplicate empty lines
  return processedLines.filter((line, index, arr) => {
    if (stripAnsi(line).trim() === "" && index > 0 && stripAnsi(arr[index - 1]).trim() === "") {
      return false;
    }
    return true;
  });
}

function cleanLogLine(line) {
  // Remove the `[HH:MM:SS]` time prefix and `[STAGE]` tags from the start of the line for UI cleanliness
  let cleanLine = line.replace(/^(?:\u001b\[[0-9;]*m)?\[\d{2}:\d{2}:\d{2}\](?:\u001b\[[0-9;]*m)?\s*/, '');
  cleanLine = cleanLine.replace(/^(?:\u001b\[[0-9;]*m)?\[[A-Z0-9_-]+\](?:\u001b\[[0-9;]*m)?\s*/i, '');
  
  // Strip all emojis and symbol icons for professional enterprise output
  cleanLine = cleanLine.replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2300}-\u{23FF}✔❌✅⚡🚀✨🔒🐳📦🛠️]/gu, '');
  
  return cleanLine.replace(/\s+/g, ' ').trimStart();
}

function parseLogsIntoSteps(rawLogs, buildStatus) {
  if (!rawLogs) return [];

  const rawLines = processRawLines(rawLogs);

  // 1. Initialize permanent system steps
  const systemSteps = {
    setup_workspace: { id: 'setup_workspace', name: 'Setup Workspace', lines: [], status: 'pending', startTime: null, endTime: null },
    env_detect: { id: 'env_detect', name: 'Environment Detection', lines: [], status: 'pending', startTime: null, endTime: null },
  };

  const dynamicStages = {};

  const systemEndSteps = {
    artifacts: { id: 'artifacts', name: 'Harvesting Artifacts', lines: [], status: 'pending', startTime: null, endTime: null },
    cleanup: { id: 'cleanup', name: 'Teardown & Cleanup', lines: [], status: 'pending', startTime: null, endTime: null }
  };

  let lastActiveStage = null;

  for (const line of rawLines) {
    const plainLine = stripAnsi(line).trim();
    if (!plainLine) continue;

    // Detect stage logs based on bracket prefix, e.g. "[SETUP] added packages" or "[TEST] PASS"
    const stagePrefixRegex = /^(?:\[\d{2}:\d{2}:\d{2}\]\s+)?\[([A-Z0-9_-]+)\]\s+(.*)$/;
    const match = plainLine.match(stagePrefixRegex);
    let currentLineStage = null;

    if (match) {
      const stageName = match[1].toLowerCase();
      // Exclude system names
      if (stageName !== 'worker' && stageName !== 'engine' && stageName !== 'revert') {
        currentLineStage = stageName;
        if (!dynamicStages[stageName]) {
          dynamicStages[stageName] = {
            id: `stage_${stageName}`,
            name: `Stage: ${stageName.toUpperCase()}`,
            lines: [],
            status: 'pending',
            startTime: null,
            endTime: null
          };
        }
        dynamicStages[stageName].lines.push(cleanLogLine(line));
        lastActiveStage = stageName;
        continue;
      }
    }

    // Engine/Worker log lines
    if (plainLine.includes('Build status forced to RUNNING') || plainLine.includes('Created workspace path') || plainLine.includes('Repository cloned successfully') || plainLine.includes('Target commit successfully isolated')) {
      systemSteps.setup_workspace.lines.push(cleanLogLine(line));
    } else if (plainLine.includes('Detecting project language') || plainLine.includes('Detected context:') || plainLine.includes('dependency caching') || plainLine.includes('caching strategy') || plainLine.includes('Cache hit') || plainLine.includes('Cache miss')) {
      systemSteps.env_detect.lines.push(cleanLogLine(line));
    } else if (plainLine.includes('Preparing stage') || plainLine.includes('Launching stage') || (plainLine.includes('Stage') && plainLine.includes('execution exited')) || plainLine.includes('runtime session active') || plainLine.includes('Spawning sandbox container for stage')) {
      const stageMatch = plainLine.match(/stage[:'\s]+([A-Z0-9_-]+)/i);
      if (stageMatch) {
        const stageName = stageMatch[1].toLowerCase();
        if (!dynamicStages[stageName]) {
          dynamicStages[stageName] = {
            id: `stage_${stageName}`,
            name: `Stage: ${stageName.toUpperCase()}`,
            lines: [],
            status: 'pending',
            startTime: null,
            endTime: null
          };
        }
        dynamicStages[stageName].lines.push(cleanLogLine(line));
      } else if (lastActiveStage && dynamicStages[lastActiveStage]) {
        dynamicStages[lastActiveStage].lines.push(cleanLogLine(line));
      } else {
        systemSteps.env_detect.lines.push(cleanLogLine(line));
      }
    } else if ((plainLine.includes('Captured') && plainLine.includes('build artifact')) || plainLine.includes('[ARTIFACTS]') || plainLine.includes('Gathering build artifacts')) {
      systemEndSteps.artifacts.lines.push(cleanLogLine(line));
    } else if (plainLine.includes('Pruning operational file tree') || plainLine.includes('fully executed and finished context') || plainLine.includes('Pruned operational') || plainLine.includes('Teardown') || plainLine.includes('finished context routines') || plainLine.includes('DAG pipeline session finished')) {
      systemEndSteps.cleanup.lines.push(cleanLogLine(line));
    } else {
      if (lastActiveStage && dynamicStages[lastActiveStage]) {
        dynamicStages[lastActiveStage].lines.push(cleanLogLine(line));
      } else {
        systemSteps.env_detect.lines.push(cleanLogLine(line));
      }
    }
  }

  // Combine steps in correct execution order
  const steps = [
    systemSteps.setup_workspace,
    systemSteps.env_detect,
    ...Object.values(dynamicStages),
    systemEndSteps.artifacts,
    systemEndSteps.cleanup
  ];

  const timeRegex = /\[(\d{2}:\d{2}:\d{2})\]/;
  const getFirstTimestamp = (stepLines) => {
    for (const l of stepLines) {
      const plain = stripAnsi(l);
      const match = plain.match(timeRegex) || rawLines.find(rl => stripAnsi(rl).includes(plain))?.match(timeRegex);
      if (match) return match[1];
    }
    return null;
  };

  const getLastTimestamp = (stepLines) => {
    for (let i = stepLines.length - 1; i >= 0; i--) {
      const plain = stripAnsi(stepLines[i]);
      const match = plain.match(timeRegex) || rawLines.find(rl => stripAnsi(rl).includes(plain))?.match(timeRegex);
      if (match) return match[1];
    }
    return null;
  };

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (step.lines.length > 0) {
      step.startTime = getFirstTimestamp(step.lines);
      step.endTime = getLastTimestamp(step.lines);
    }
    
    if (!step.startTime && i > 0) {
      step.startTime = steps[i - 1].endTime || steps[i - 1].startTime;
    }
  }

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    
    if (!step.endTime) {
      for (let j = i + 1; j < steps.length; j++) {
        if (steps[j].lines.length > 0 && steps[j].startTime) {
          step.endTime = steps[j].startTime;
          break;
        }
      }
    }

    if (step.startTime && step.endTime) {
      const t1 = parseTimeToSeconds(step.startTime);
      const t2 = parseTimeToSeconds(step.endTime);
      if (t1 !== null && t2 !== null) {
        let diff = t2 - t1;
        if (diff < 0) diff += 24 * 3600;
        step.duration = `${diff.toFixed(1)}s`;
      } else {
        step.duration = '0.1s';
      }
    } else if (step.startTime && buildStatus === 'RUNNING') {
      step.duration = 'running...';
    } else {
      step.duration = '0.0s';
    }
  }

  const plainLogs = stripAnsi(rawLogs);
  const isFinishedLogStream = plainLogs.includes('DAG pipeline session finished') || plainLogs.includes('finished context routines');

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];

    const hasError = step.lines.some(l => {
      const lower = stripAnsi(l).toLowerCase();
      if (lower.includes('npm warn') || lower.includes('npm warning')) {
        return false;
      }
      const cleanLine = lower.replace(/level-errors/g, '');
      return l.includes('❌') || 
             cleanLine.includes('failed') || 
             cleanLine.includes('error') || 
             cleanLine.includes('breakdown');
    });

    const isStageCompletedInLogs = step.lines.some(l => {
      const plain = stripAnsi(l);
      return plain.includes('completed successfully') || 
             plain.includes('executed cleanly') || 
             plain.includes('exited cleanly');
    }) || (isFinishedLogStream && i !== steps.length - 1);

    if (hasError) {
      step.status = 'failed';
    } else if (step.lines.length > 0) {
      const isLastActiveStep = i === steps.findLastIndex(s => s.lines.length > 0);

      if (isStageCompletedInLogs || isFinishedLogStream) {
        step.status = 'success';
      } else if (isLastActiveStep && buildStatus === 'RUNNING') {
        step.status = 'running';
      } else {
        step.status = 'success';
      }
    } else {
      if (buildStatus === 'SUCCESS' || isFinishedLogStream) {
        step.status = 'success';
      } else if (step.id === 'cleanup' && (buildStatus === 'FAILED' || isFinishedLogStream)) {
        step.status = 'success';
      } else {
        step.status = 'pending';
      }
    }
  }

  return steps.filter(s => s.lines.length > 0 || ['setup_workspace', 'env_detect', 'cleanup'].includes(s.id));
}

module.exports = {
  stripAnsi,
  parseLogsIntoSteps
};
