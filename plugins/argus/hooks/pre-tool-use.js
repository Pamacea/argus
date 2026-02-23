#!/usr/bin/env node

/**
 * Pre-Tool Use Hook - CRITICAL ENFORCEMENT MECHANISM
 *
 * This hook intercepts Explore and CreateTeam commands and forces
 * the agent to consult ARGUS (via argus__check_hooks) before execution.
 */

const EXPLORE_TOOLS = ['explore', 'create_team', 'Task'];
const ARGUS_TOOLS = ['argus__check_hooks', 'argus__save_transaction', 'argus__search_memory'];

// Track if argus has been consulted in current session
let lastConsultation = null;
const CONSULTATION_TTL = 5 * 60 * 1000; // 5 minutes

function shouldEnforceArgus(toolName) {
  // Check if this is an Explore/CreateTeam command
  if (EXPLORE_TOOLS.some(t => toolName.toLowerCase().includes(t.toLowerCase()))) {
    return true;
  }

  // Check if it's a Task tool (used for agent creation)
  if (toolName === 'Task' || toolName === 'TaskCreate') {
    const args = JSON.parse(process.env.ARGUS_TOOL_ARGS || '{}');
    // Check if creating a subagent
    if (args.subagent_type || args.team_name) {
      return true;
    }
  }

  return false;
}

function checkArgusConsulted() {
  if (!lastConsultation) {
    return { consulted: false, reason: 'never_consulted' };
  }

  const age = Date.now() - lastConsultation;
  if (age > CONSULTATION_TTL) {
    return { consulted: false, reason: 'expired', age };
  }

  return { consulted: true, age };
}

async function preToolUse(toolName, args) {
  console.log(`[ARGUS] Pre-tool check: ${toolName}`);

  // Skip if this is an ARGUS tool itself (avoid infinite loop)
  if (ARGUS_TOOLS.some(t => toolName.includes(t))) {
    if (toolName === 'argus__check_hooks') {
      lastConsultation = Date.now();
      console.log('[ARGUS] ✓ ARGUS consultation recorded');
    }
    return null; // Let ARGUS tools pass through
  }

  // Check if we need to enforce ARGUS consultation
  if (!shouldEnforceArgus(toolName)) {
    return null; // Let non-Explore tools pass through
  }

  // Check if ARGUS was consulted recently
  const consultation = checkArgusConsulted();

  if (!consultation.consultated) {
    console.log(`[ARGUS] ✗ ARGUS not consulted: ${consultation.reason}`);

    // Return instructions to force ARGUS consultation
    const instructions = {
      block: true,
      reason: 'ARGUS_NOT_CONSULTED',
      message: `
⚠️ ARGUS REQUIREMENT ⚠️

Before executing "${toolName}", you MUST consult ARGUS to:
1. Search the RAG for similar past operations
2. Check the file index for existing patterns
3. Read relevant documentation

REQUIRED ACTION:
Call: mcp__argus__check_hooks(prompt="${toolName}", action="explore")

Then proceed with your action using the context provided by ARGUS.

This ensures you don't duplicate work and follow established patterns.
      `.trim(),
      requiredTool: 'argus__check_hooks',
      requiredArgs: {
        prompt: toolName,
        action: 'explore',
        context: args
      }
    };

    console.log('[ARGUS] Blocking execution until ARGUS is consulted');
    return JSON.stringify(instructions);
  }

  console.log(`[ARGUS] ✓ ARGUS consultation valid (${Math.round(consultation.age / 1000)}s ago)`);
  return null; // Allow execution to proceed
}

// Main execution
(async () => {
  try {
    const toolName = process.env.ARGUS_TOOL_NAME || 'unknown';
    let args = {};

    // Parse args safely
    try {
      args = JSON.parse(process.env.ARGUS_TOOL_ARGS || '{}');
    } catch (e) {
      console.error('[ARGUS] Failed to parse args:', e.message);
    }

    const result = await preToolUse(toolName, args);

    if (result) {
      // Block execution - output to stderr for Claude to see
      console.error(result);
      process.exit(1); // Non-zero exit blocks the tool
    } else {
      // Allow execution
      process.exit(0);
    }
  } catch (error) {
    console.error('[ARGUS] Error in pre-tool-use hook:', error.message);
    process.exit(0); // Don't block on error
  }
})();
