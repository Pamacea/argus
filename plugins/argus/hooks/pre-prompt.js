#!/usr/bin/env node

/**
 * Pre-Prompt Hook - Captures user prompts before Claude processes them
 */

const { queuePrompt } = require('./utils');
const { updateTaskContext, extractTask } = require('./context-tracker');

async function prePrompt(prompt, context) {
  console.log('[ARGUS] Capturing user prompt...');

  try {
    // Extract task and user goal
    const task = extractTask(prompt);
    const userGoal = extractUserGoal(prompt);

    // Update context with FULL prompt and extracted goal
    updateTaskContext(prompt, task);

    // Also save the user goal for better summaries
    const contextTracker = require('./context-tracker');
    const currentCtx = contextTracker.loadContext();
    currentCtx.userGoal = userGoal;
    contextTracker.saveContext();

    // Queue the prompt for storage
    queuePrompt({
      prompt: prompt.substring(0, 10000), // Limit to 10k chars
      userGoal: userGoal,  // Store extracted goal
      context: {
        cwd: process.cwd(),
        platform: process.platform,
        timestamp: Date.now(),
        task: task,
        userGoal: userGoal
      },
      metadata: {
        type: 'user_prompt',
        length: prompt.length,
        task: task,
        userGoal: userGoal
      }
    });

    console.log(`[ARGUS] ✓ Task: ${task} - Goal: "${userGoal}"`);
  } catch (error) {
    console.error('[ARGUS] Warning: Could not queue prompt:', error.message);
  }
}

/**
 * Extract user's main goal from prompt
 */
function extractUserGoal(prompt) {
  const { extractUserGoal } = require('./context-tracker');
  return extractUserGoal(prompt);
}

// Main execution - Read from stdin as per Claude Code hooks spec
(async () => {
  try {
    let inputData = {};
    let stdinData = '';

    // Read stdin with timeout
    const stdinPromise = new Promise((resolve) => {
      let buffer = '';
      process.stdin.on('data', (chunk) => {
        buffer += chunk;
      });
      process.stdin.on('end', () => {
        resolve(buffer);
      });

      // Timeout after 100ms
      setTimeout(() => resolve(buffer), 100);
    });

    stdinData = await stdinPromise;

    if (stdinData.trim()) {
      try {
        inputData = JSON.parse(stdinData);
      } catch (e) {
        // Invalid JSON, continue
      }
    }

    // Claude Code PrePrompt hook passes prompt directly via stdin or args
    // The format can be: { prompt: "..." } or just the prompt text as string
    let prompt = '';
    let context = {};

    if (typeof inputData === 'string') {
      prompt = inputData;
    } else if (inputData.prompt) {
      prompt = inputData.prompt;
      context = inputData.context || {};
    } else {
      // Fallback to command line args
      prompt = process.argv[2] || '';
    }

    if (prompt) {
      await prePrompt(prompt, context);
    }

    process.exit(0);
  } catch (error) {
    console.error('[ARGUS] Error in pre-prompt hook:', error.message);
    process.exit(0); // Don't fail the hook
  }
})();
