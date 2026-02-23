#!/usr/bin/env node

/**
 * Post-Response Hook - Captures Claude's responses after generation
 */

const { queueTransaction } = require('./utils');

async function postResponse(response, context) {
  console.log('[ARGUS] Capturing Claude response...');

  try {
    // Queue the response as a transaction
    queueTransaction({
      prompt: context.userPrompt || 'Claude response',
      promptType: 'claude_response',
      response: response.substring(0, 50000), // Limit to 50k chars
      context: {
        cwd: process.cwd(),
        platform: process.platform,
        timestamp: Date.now()
      },
      result: {
        success: true,
        output: response.substring(0, 1000), // First 1k chars as preview
        responseLength: response.length
      },
      metadata: {
        tags: ['claude_response', 'conversation'],
        category: 'user_interaction'
      }
    });

    console.log('[ARGUS] ✓ Response queued for storage');
  } catch (error) {
    console.error('[ARGUS] Warning: Could not queue response:', error.message);
  }
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

    // Claude Code PostResponse hook passes response directly
    let response = '';
    let context = {};

    if (typeof inputData === 'string') {
      response = inputData;
    } else if (inputData.response) {
      response = inputData.response;
      context = inputData.context || {};
    } else {
      // Fallback
      response = inputData.text || inputData.content || '';
    }

    if (response) {
      await postResponse(response, context);
    }

    process.exit(0);
  } catch (error) {
    console.error('[ARGUS] Error in post-response hook:', error.message);
    process.exit(0); // Don't fail the hook
  }
})();
