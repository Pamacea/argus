/**
 * Context Tracker for ARGUS
 *
 * Tracks the current task/context to provide better summaries.
 * This module maintains state about what we're working on.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CONTEXT_FILE = path.join(os.homedir(), '.argus', 'current-context.json');

/**
 * Current task context
 */
let currentContext = {
  task: null,
  userPrompt: null,
  startTime: null,
  filesModified: [],
  commandsRun: [],
  lastActivity: null
};

/**
 * Load current context from disk
 */
function loadContext() {
  try {
    if (fs.existsSync(CONTEXT_FILE)) {
      const data = fs.readFileSync(CONTEXT_FILE, 'utf8');
      const saved = JSON.parse(data);
      currentContext = { ...currentContext, ...saved };

      // Reset if context is too old (> 1 hour)
      const age = Date.now() - (saved.lastActivity || 0);
      if (age > 60 * 60 * 1000) {
        resetContext();
      }
    }
  } catch (error) {
    // Ignore errors, use default context
  }
  return currentContext;
}

/**
 * Save current context to disk
 */
function saveContext() {
  try {
    const dir = path.dirname(CONTEXT_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    currentContext.lastActivity = Date.now();
    fs.writeFileSync(CONTEXT_FILE, JSON.stringify(currentContext, null, 2));
  } catch (error) {
    // Ignore save errors
  }
}

/**
 * Reset current context
 */
function resetContext() {
  currentContext = {
    task: null,
    userPrompt: null,
    startTime: null,
    filesModified: [],
    commandsRun: [],
    lastActivity: Date.now()
  };
  saveContext();
}

/**
 * Update task context (called from pre-prompt or when user asks something)
 */
function updateTaskContext(userPrompt, inferredTask = null) {
  loadContext();
  currentContext.userPrompt = userPrompt;
  currentContext.task = inferredTask || extractTask(userPrompt);
  currentContext.startTime = Date.now();
  currentContext.filesModified = [];
  currentContext.commandsRun = [];
  saveContext();
}

/**
 * Extract main task from user prompt
 */
function extractTask(prompt) {
  const lowerPrompt = prompt.toLowerCase();

  // Common task patterns
  if (lowerPrompt.includes('create') || lowerPrompt.includes('add') || lowerPrompt.includes('make')) {
    return 'feature_development';
  }
  if (lowerPrompt.includes('fix') || lowerPrompt.includes('bug') || lowerPrompt.includes('error')) {
    return 'bug_fixing';
  }
  if (lowerPrompt.includes('refactor') || lowerPrompt.includes('improve') || lowerPrompt.includes('clean')) {
    return 'refactoring';
  }
  if (lowerPrompt.includes('test')) {
    return 'testing';
  }
  if (lowerPrompt.includes('document') || lowerPrompt.includes('readme') || lowerPrompt.includes('explain')) {
    return 'documentation';
  }
  if (lowerPrompt.includes('install') || lowerPrompt.includes('setup') || lowerPrompt.includes('configure')) {
    return 'setup';
  }

  return 'general_task';
}

/**
 * Track file modification
 */
function trackFileModification(filePath, operation) {
  loadContext();
  currentContext.filesModified.push({
    path: filePath,
    operation: operation,
    timestamp: Date.now()
  });
  saveContext();
}

/**
 * Track command execution
 */
function trackCommand(command, description) {
  loadContext();
  currentContext.commandsRun.push({
    command: command,
    description: description,
    timestamp: Date.now()
  });
  saveContext();
}

/**
 * Get enhanced summary for a tool action
 * INFERS CONTEXT FROM RECENT ACTIONS
 */
function getEnhancedSummary(toolName, args, baseSummary) {
  const context = loadContext();

  // Infer goal from recent file patterns
  const inferredGoal = inferGoalFromHistory(context);

  if (inferredGoal) {
    // Format: "Doing X (to accomplish Y)"
    return `${baseSummary} (to ${inferredGoal})`;
  }

  // Fallback: just the base summary
  return baseSummary;
}

/**
 * Infer user's goal from recent file modifications
 */
function inferGoalFromHistory(context) {
  if (!context.filesModified || context.filesModified.length === 0) {
    return null;
  }

  const recentFiles = context.filesModified.slice(-5); // Last 5 files
  const filenames = recentFiles.map(f => f.path.split(/[\\/]/).pop().toLowerCase());

  // Pattern matching to infer intent
  if (filenames.some(f => f.includes('test') || f.includes('spec'))) {
    return 'test functionality';
  }
  if (filenames.some(f => f.includes('readme') || f.includes('doc') || f.includes('guide'))) {
    return 'update documentation';
  }
  if (filenames.some(f => f.includes('example') || f.includes('demo') || f.includes('sample'))) {
    return 'demonstrate feature';
  }
  if (filenames.some(f => f.includes('config') || f.includes('setup') || f.includes('install'))) {
    return 'configure system';
  }
  if (filenames.some(f => f.includes('fix') || f.includes('bug') || f.includes('patch'))) {
    return 'fix issues';
  }

  // Count operations to detect patterns
  const writeCount = recentFiles.filter(f => f.operation === 'write').length;
  const editCount = recentFiles.filter(f => f.operation === 'edit').length;

  if (writeCount >= 3) {
    return 'create new feature';
  }
  if (editCount >= 3) {
    return 'refactor code';
  }

  return null;
}

/**
 * Extract user's goal from prompt (WHY they want to do this)
 */
function extractUserGoal(prompt) {
  // Remove common prefixes to get the core goal
  const prefixes = [
    /^can you /i,
    /^could you /i,
    /^please /i,
    /^i need /i,
    /^i want /i,
    /^help me /i,
    /^let's /i
  ];

  let cleaned = prompt;
  for (const prefix of prefixes) {
    cleaned = cleaned.replace(prefix, '');
  }

  // Take first meaningful part
  const firstSentence = cleaned.split(/[.!?]/)[0];
  return firstSentence.trim();
}

module.exports = {
  loadContext,
  saveContext,
  resetContext,
  updateTaskContext,
  trackFileModification,
  trackCommand,
  getEnhancedSummary,
  extractTask,
  extractUserGoal
};
