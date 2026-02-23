#!/usr/bin/env node

/**
 * Prompt Registry Hook
 *
 * Captures all user prompts and commands for context tracking.
 * This helps ARGUS learn user patterns and preferences.
 */

const {
  queuePrompt,
  extractContext
} = require('./utils.js');

// Environment variable that might contain user prompt
const USER_PROMPT_VAR = 'ARGUS_USER_PROMPT';

async function registerPrompt() {
  const userPrompt = process.env[USER_PROMPT_VAR];

  if (!userPrompt || userPrompt.trim() === '') {
    return; // No prompt to register
  }

  const context = extractContext();

  // Analyze the prompt type
  let promptType = 'unknown';
  if (userPrompt.startsWith('/') || userPrompt.startsWith('!')) {
    promptType = 'command';
  } else if (userPrompt.includes('?')) {
    promptType = 'question';
  } else if (userPrompt.includes('fix') || userPrompt.includes('debug')) {
    promptType = 'debug_request';
  } else if (userPrompt.includes('add') || userPrompt.includes('create') || userPrompt.includes('implement')) {
    promptType = 'feature_request';
  } else if (userPrompt.includes('refactor') || userPrompt.includes('clean')) {
    promptType = 'refactor_request';
  }

  // Queue the prompt
  queuePrompt({
    text: userPrompt,
    context: {
      ...context,
      promptType
    }
  });

  console.log(`[ARGUS] ✓ Registered prompt: ${promptType}`);
}

// Main execution
(async () => {
  try {
    await registerPrompt();
    process.exit(0);
  } catch (error) {
    console.error('[ARGUS] Error in prompt-registry hook:', error);
    process.exit(0); // Don't fail the hook
  }
})();
