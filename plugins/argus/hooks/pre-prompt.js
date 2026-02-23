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

// Main execution - Claude Code passes data via stdin
(async () => {
  try {
    // Read from stdin as per Claude Code hooks specification
    let inputData = {};
    try {
      const stdinBuffer = [];
      for await (const chunk of process.stdin) {
        stdinBuffer.push(chunk);
      }
      const stdinData = Buffer.concat(stdinBuffer).toString('utf8');
      if (stdinData.trim()) {
        inputData = JSON.parse(stdinData);
      }
    } catch (e) {
      // No stdin data - continue
    }

    // Claude Code passes: { prompt, context } via stdin
    let prompt = inputData.prompt || process.env.ARGUS_USER_PROMPT || '';
    let context = inputData.context || JSON.parse(process.env.ARGUS_CONTEXT || '{}');

    await prePrompt(prompt, context);
    process.exit(0);
  } catch (error) {
    console.error('[ARGUS] Error in pre-prompt hook:', error.message);
    process.exit(0); // Don't fail the hook
  }
})();
