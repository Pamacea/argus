#!/usr/bin/env node

/**
 * Post-Response Hook
 *
 * Captures Claude's response after it's generated.
 * This pairs with pre-prompt to create a complete conversation history.
 */

const { queueTransaction } = require('./utils');

async function postResponse(response, context) {
  console.log('[ARGUS] Capturing Claude response...');

  try {
    // Queue the complete transaction (prompt + response)
    queueTransaction({
      prompt: context.prompt || 'Unknown prompt',
      promptType: 'user',
      context: {
        cwd: process.cwd(),
        platform: process.platform,
        environment: process.env,
        toolsAvailable: context.toolsAvailable || []
      },
      result: {
        success: true,
        output: response,
        duration: context.duration || 0,
        toolsUsed: context.toolsUsed || []
      },
      metadata: {
        tags: ['conversation', 'claude_response'],
        category: 'user_interaction'
      }
    });

    console.log('[ARGUS] ✓ Response queued as transaction');
  } catch (error) {
    console.error('[ARGUS] Warning: Could not queue response:', error.message);
  }
}

// Main execution
(async () => {
  try {
    const response = process.env.ARGUS_CLAUDE_RESPONSE || '';
    const context = JSON.parse(process.env.ARGUS_CONTEXT || '{}');

    await postResponse(response, context);
    process.exit(0);
  } catch (error) {
    console.error('[ARGUS] Error in post-response hook:', error);
    process.exit(0); // Don't fail the hook
  }
})();
