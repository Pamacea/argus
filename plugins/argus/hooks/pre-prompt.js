#!/usr/bin/env node

/**
 * Pre-Prompt Hook
 *
 * Captures user prompts before they are sent to Claude.
 * This captures the initial user request/question.
 */

const { queuePrompt } = require('./utils');

async function prePrompt(prompt, context) {
  console.log('[ARGUS] Capturing user prompt...');

  try {
    // Queue the user prompt for storage
    queuePrompt({
      prompt: prompt,
      context: {
        cwd: process.cwd(),
        platform: process.platform,
        timestamp: new Date().toISOString()
      }
    });

    console.log('[ARGUS] ✓ User prompt queued');
  } catch (error) {
    console.error('[ARGUS] Warning: Could not queue prompt:', error.message);
  }
}

// Main execution
(async () => {
  try {
    // Get prompt from environment or stdin
    let prompt = process.env.ARGUS_USER_PROMPT || '';
    let context = process.env.ARGUS_CONTEXT || '{}';

    // If no env var, read from stdin
    if (!prompt) {
      const readline = require('readline');
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      prompt = await new Promise(resolve => {
        rl.question('', resolve);
      });
      rl.close();
    }

    await prePrompt(prompt, JSON.parse(context));
    process.exit(0);
  } catch (error) {
    console.error('[ARGUS] Error in pre-prompt hook:', error);
    process.exit(0); // Don't fail the hook
  }
})();
