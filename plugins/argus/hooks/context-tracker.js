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
 */
function getEnhancedSummary(toolName, args, baseSummary) {
  const context = loadContext();

  // Add context to summary if available
  if (context.task && context.userPrompt) {
    const taskDesc = {
      'feature_development': 'Building feature',
      'bug_fixing': 'Fixing bug',
      'refactoring': 'Refactoring code',
      'testing': 'Testing',
      'documentation': 'Writing docs',
      'setup': 'Setting up',
      'general_task': 'Working on task'
    }[context.task] || 'Working';

    return `${taskDesc}: ${baseSummary}`;
  }

  return baseSummary;
}

module.exports = {
  loadContext,
  saveContext,
  resetContext,
  updateTaskContext,
  trackFileModification,
  trackCommand,
  getEnhancedSummary,
  extractTask
};
