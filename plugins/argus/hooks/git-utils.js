#!/usr/bin/env node

/**
 * Git Utilities for ARGUS
 *
 * Provides git integration to track exact changes using git commits.
 * This leverages the existing Git Flow Master workflow.
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Check if a directory is inside a git repository
 */
function isGitRepository(dir) {
  try {
    const gitDir = execSync('git rev-parse --git-dir', {
      cwd: dir,
      stdio: 'pipe',
      timeout: 2000
    }).toString().trim();

    return gitDir && fs.existsSync(path.join(dir, gitDir));
  } catch (error) {
    return false;
  }
}

/**
 * Get the current git branch
 */
function getCurrentBranch(dir) {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: dir,
      stdio: 'pipe',
      timeout: 2000
    }).toString().trim();
  } catch (error) {
    return null;
  }
}

/**
 * Get the most recent commit hash
 */
function getLastCommitHash(dir) {
  try {
    return execSync('git rev-parse HEAD', {
      cwd: dir,
      stdio: 'pipe',
      timeout: 2000
    }).toString().trim();
  } catch (error) {
    return null;
  }
}

/**
 * Get git diff for a specific file
 */
function getFileDiff(filePath, dir) {
  try {
    const relativePath = path.relative(dir, filePath);

    // Get unified diff
    const diff = execSync(`git diff --unified=3 -- "${relativePath}"`, {
      cwd: dir,
      stdio: 'pipe',
      timeout: 5000
    }).toString().trim();

    return diff || null;
  } catch (error) {
    // File might not be tracked yet
    return null;
  }
}

/**
 * Get git diff for staged changes
 */
function getStagedDiff(filePath, dir) {
  try {
    const relativePath = path.relative(dir, filePath);

    const diff = execSync(`git diff --staged --unified=3 -- "${relativePath}"`, {
      cwd: dir,
      stdio: 'pipe',
      timeout: 5000
    }).toString().trim();

    return diff || null;
  } catch (error) {
    return null;
  }
}

/**
 * Get information about a file's git status
 */
function getFileGitInfo(filePath, dir) {
  try {
    const relativePath = path.relative(dir, filePath);

    // Get git status for the file
    const status = execSync(`git status --porcelain -- "${relativePath}"`, {
      cwd: dir,
      stdio: 'pipe',
      timeout: 2000
    }).toString().trim();

    if (!status) {
      return {
        tracked: true,
        modified: false,
        staged: false,
        status: 'clean'
      };
    }

    const statusCode = status.substring(0, 2).trim();

    return {
      tracked: !statusCode.startsWith('?'),
      modified: statusCode.includes('M'),
      staged: statusCode.length > 1 && statusCode[0] !== '?',
      added: statusCode.includes('A'),
      deleted: statusCode.includes('D'),
      status: statusCode
    };
  } catch (error) {
    return {
      tracked: false,
      modified: false,
      staged: false,
      status: 'unknown'
    };
  }
}

/**
 * Get change preview with git information
 */
function getChangePreviewWithGit(toolName, args, cwd) {
  if (!isGitRepository(cwd)) {
    return { gitEnabled: false };
  }

  const gitInfo = {
    gitEnabled: true,
    branch: getCurrentBranch(cwd),
    lastCommit: getLastCommitHash(cwd)
  };

  if (toolName === 'Edit' && args.file_path) {
    const filePath = args.file_path;
    const fileStatus = getFileGitInfo(filePath, cwd);

    // Try to get diff for unstaged changes
    const diff = getFileDiff(filePath, cwd) || getStagedDiff(filePath, cwd);

    return {
      ...gitInfo,
      type: 'edit',
      file: filePath,
      oldLength: args.old_string?.length || 0,
      newLength: args.new_string?.length || 0,
      preview: {
        removed: args.old_string?.substring(0, 200) + (args.old_string?.length > 200 ? '...' : ''),
        added: args.new_string?.substring(0, 200) + (args.new_string?.length > 200 ? '...' : '')
      },
      git: {
        status: fileStatus,
        diffPreview: diff ? diff.substring(0, 500) + (diff.length > 500 ? '...' : '') : null,
        fullDiffAvailable: !!diff
      }
    };
  }

  if (toolName === 'Write' && args.file_path) {
    const filePath = args.file_path;
    const fileStatus = getFileGitInfo(filePath, cwd);

    return {
      ...gitInfo,
      type: 'write',
      file: filePath,
      contentLength: args.content?.length || 0,
      preview: args.content?.substring(0, 200) + (args.content?.length > 200 ? '...' : ''),
      git: {
        status: fileStatus,
        isNewFile: !fileStatus.tracked
      }
    };
  }

  return gitInfo;
}

/**
 * Get a short commit message for the last commit
 */
function getLastCommitMessage(dir) {
  try {
    return execSync('git log -1 --pretty=%s', {
      cwd: dir,
      stdio: 'pipe',
      timeout: 2000
    }).toString().trim();
  } catch (error) {
    return null;
  }
}

/**
 * Get full commit info for the last commit
 */
function getLastCommitInfo(dir) {
  try {
    const hash = getLastCommitHash(dir);
    if (!hash) return null;

    const message = getLastCommitMessage(dir);
    const author = execSync('git log -1 --pretty=%an', {
      cwd: dir,
      stdio: 'pipe',
      timeout: 2000
    }).toString().trim();
    const date = execSync('git log -1 --pretty=%ci', {
      cwd: dir,
      stdio: 'pipe',
      timeout: 2000
    }).toString().trim();

    return { hash, message, author, date };
  } catch (error) {
    return null;
  }
}

module.exports = {
  isGitRepository,
  getCurrentBranch,
  getLastCommitHash,
  getFileDiff,
  getStagedDiff,
  getFileGitInfo,
  getChangePreviewWithGit,
  getLastCommitMessage,
  getLastCommitInfo
};
