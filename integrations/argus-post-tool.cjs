#!/usr/bin/env node
/**
 * ARGUS PostToolUse Hook
 * Records successful actions to ARGUS memory
 *
 * Claude Code hooks receive JSON on stdin:
 * { "session_id", "tool_name", "tool_input", "tool_output", "working_directory" }
 */

const { spawnSync } = require('child_process');

function main() {
    let inputData = '';

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { inputData += chunk; });
    process.stdin.on('end', () => {
        let context = {};
        try {
            context = JSON.parse(inputData);
        } catch (e) {
            process.exit(0);
            return;
        }

        const toolName = context?.tool_name || '';
        const toolInput = context?.tool_input || {};

        // Build description based on tool
        let description = '';
        let category = 'action';
        let tags = [];

        switch (toolName) {
            case 'Edit':
                description = `Modified ${toolInput?.file_path || 'unknown file'}`;
                category = 'edit';
                break;
            case 'Write':
                description = `Created ${toolInput?.file_path || 'unknown file'}`;
                category = 'create';
                tags.push('new-file');
                break;
            case 'Explore':
                description = `Explored: ${toolInput?.prompt || toolInput?.query || 'unknown'}`;
                category = 'explore';
                break;
            case 'CreateTeam':
                description = `Created team: ${toolInput?.team_name || 'unknown'}`;
                category = 'team';
                tags.push('collaboration');
                break;
            case 'Bash': {
                const cmd = toolInput?.command || '';
                // Skip noisy/read-only/trivial commands
                if (/^(git status|git log|git diff|ls|dir|pwd|rtk |cat |head |tail |argus |echo |which |env |printenv|find |grep |rg |tree |bat )/.test(cmd)) {
                    process.exit(0);
                    return;
                }
                description = `Executed: ${cmd.substring(0, 80)}${cmd.length > 80 ? '...' : ''}`;
                category = 'command';
                break;
            }
            default:
                process.exit(0);
                return;
        }

        if (!description || description.length < 20) {
            process.exit(0);
            return;
        }

        // Auto-detect tags from description
        const descLower = description.toLowerCase();
        if (descLower.includes('fix') || descLower.includes('bug')) tags.push('bugfix');
        if (descLower.includes('test')) tags.push('test');

        // Save to ARGUS
        try {
            const args = ['remember', description, '--category', category];
            if (tags.length > 0) {
                args.push('--tags', tags.join(','));
            }

            spawnSync('argus', args, {
                stdio: 'ignore',
                shell: false,
                timeout: 5000
            });
        } catch (err) {
            // Silent fail
        }

        process.exit(0);
    });
}

main();
