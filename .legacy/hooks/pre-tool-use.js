#!/usr/bin/env node

/**
 * ARGUS PreToolUse Hook
 *
 * CRITICAL: This is the CORE enforcement mechanism for ARGUS.
 *
 * This hook intercepts tool execution BEFORE it happens and ensures
 * that agents consult ARGUS MCP before using protected tools like
 * Explore or CreateTeam.
 *
 * Workflow:
 * 1. Parse the incoming tool call
 * 2. Check if it's a protected tool (Explore, CreateTeam, etc.)
 * 3. If protected, verify argus__check_hooks was called
 * 4. If NOT called, inject instruction to call it first
 * 5. Prevent execution until context is gathered
 */

const fs = require('fs');
const path = require('path');
const {
  loadSessionState,
  saveSessionState,
  extractContext,
  requiresHookCheck,
  parseToolName,
} = require('./utils.js');

// Path to track recent hook checks
const HOOK_CHECK_MARKER = path.join(
  process.env.CLAUDE_PLUGIN_ROOT || process.cwd(),
  '.argus-hook-check.json'
);

/**
 * Check if argus__check_hooks was called recently
 */
function wasHookCheckedRecently() {
  try {
    if (!fs.existsSync(HOOK_CHECK_MARKER)) {
      return false;
    }

    const data = fs.readFileSync(HOOK_CHECK_MARKER, 'utf-8');
    const marker = JSON.parse(data);

    // Check if hook was called in the last 5 minutes
    const FIVE_MINUTES = 5 * 60 * 1000;
    const age = Date.now() - marker.timestamp;

    return age < FIVE_MINUTES;
  } catch (error) {
    return false;
  }
}

/**
 * Mark that hook check was performed
 */
function markHookChecked() {
  try {
    fs.writeFileSync(
      HOOK_CHECK_MARKER,
      JSON.stringify({ timestamp: Date.now() }, null, 2)
    );
  } catch (error) {
    console.error('[ARGUS] Failed to mark hook check:', error.message);
  }
}

/**
 * Generate session ID using crypto
 */
function generateSessionId() {
  const crypto = require('crypto');
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Main hook logic
 */
function main() {
  try {
    // Claude Code passes tool info via stdin
    let input = '';
    for await (const chunk of process.stdin) {
      input += chunk;
    }

    // Parse the tool call
    let toolCall;
    try {
      toolCall = JSON.parse(input);
    } catch (parseError) {
      // If we can't parse, check environment variables as fallback
      const toolName = process.env.ARGUS_TOOL_NAME || '';
      const toolArgs = process.env.ARGUS_TOOL_ARGS || '{}';

      toolCall = {
        name: toolName,
        arguments: JSON.parse(toolArgs),
      };
    }

    const toolName = toolCall.name || '';
    const args = toolCall.arguments || {};

    console.error(`[ARGUS] PreToolUse: Checking tool "${toolName}"`);

    // Check if this is a protected tool
    const isProtected = requiresHookCheck(toolName);

    if (!isProtected) {
      console.error(`[ARGUS] Tool "${toolName}" is not protected, allowing execution`);
      process.exit(0);
    }

    console.error(`[ARGUS] Tool "${toolName}" is PROTECTED, enforcing hook check`);

    // Check if argus__check_hooks was called recently
    const wasChecked = wasHookCheckedRecently();

    if (wasChecked) {
      console.error('[ARGUS] Hook check verified, allowing execution');
      process.exit(0);
    }

    // Hook was NOT checked - inject instruction and block execution
    console.error('[ARGUS] Hook check NOT performed - BLOCKING execution');

    const errorMessage = {
      error: 'ARGUS_HOOK_CHECK_REQUIRED',
      message: `
═══════════════════════════════════════════════════════════
  ⚠️  ARGUS: MANDATORY HOOK CHECK REQUIRED
═══════════════════════════════════════════════════════════

You are attempting to use a protected tool: "${toolName}"

Before proceeding, you MUST call the argus__check_hooks MCP tool
to gather relevant context from the ARGUS semantic memory.

REQUIRED ACTION:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Call this MCP tool FIRST:

   argus__check_hooks({
     prompt: "${args.prompt || '(describe your task)'}",
     toolName: "${toolName}",
     context: {
       cwd: "${process.cwd()}",
       platform: "${process.platform}"
     }
   })

2. Review the returned hooks and relevant transactions
3. Apply the insights to your approach
4. Then proceed with your task

═══════════════════════════════════════════════════════════
  🛡️ ARGUS is protecting you from missing important context
═══════════════════════════════════════════════════════════
      `.trim(),
      toolName,
      requiredAction: 'call_argus__check_hooks',
      requiredTool: 'argus__check_hooks',
      suggestedParameters: {
        prompt: args.prompt || '(describe your task)',
        toolName: toolName,
        context: {
          cwd: process.cwd(),
          platform: process.platform,
        },
      },
    };

    // Output error as JSON to stderr (hook system reads from stderr)
    console.error(JSON.stringify(errorMessage));

    // Exit with error code to prevent execution
    process.exit(1);

  } catch (error) {
    console.error('[ARGUS] PreToolUse error:', error.message);
    // On error, allow execution to avoid blocking legitimate work
    process.exit(0);
  }
}

// Run the hook
main();
