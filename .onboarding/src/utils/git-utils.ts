import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import { GitError } from '../errors';
import { Result, ErrorResult } from '../types';

const execAsync = promisify(exec);

export class GitUtils {
  /**
   * Checks if a directory is a git repository
   */
  static isGitRepository(repositoryPath: string): boolean {
    const gitDir = path.join(repositoryPath, '.git');
    return fs.existsSync(gitDir);
  }

  /**
   * Executes a git command in the specified repository
   */
  static async executeGitCommand(
    command: string, 
    repositoryPath: string
  ): Promise<Result<string, GitError>> {
    try {
      const { stdout } = await execAsync(command, { cwd: repositoryPath });
      return {
        isSuccess: true,
        value: stdout.trim()
      };
    } catch (error) {
      return {
        isSuccess: false,
        error: new GitError(`Git command failed: ${command} - ${error}`)
      } as ErrorResult<GitError>;
    }
  }

  /**
   * Gets the current git branch
   */
  static async getCurrentBranch(repositoryPath: string): Promise<Result<string, GitError>> {
    return this.executeGitCommand('git rev-parse --abbrev-ref HEAD', repositoryPath);
  }

  /**
   * Gets the current commit hash
   */
  static async getCurrentCommit(repositoryPath: string): Promise<Result<string, GitError>> {
    return this.executeGitCommand('git rev-parse HEAD', repositoryPath);
  }

  /**
   * Gets the git status (changed files)
   */
  static async getStatus(repositoryPath: string): Promise<Result<string[], GitError>> {
    const result = await this.executeGitCommand('git status --porcelain', repositoryPath);
    if (!result.isSuccess) {
      return result;
    }

    const changedFiles = result.value
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => line.substring(3)); // Remove git status prefix

    return {
      isSuccess: true,
      value: changedFiles
    };
  }

  /**
   * Gets git log for specific file patterns
   */
  static async getLogForFiles(
    repositoryPath: string, 
    filePatterns: string[], 
    since?: string
  ): Promise<Result<string[], GitError>> {
    const sinceClause = since ? `--since="${since}"` : '';
    const patterns = filePatterns.join(' ');
    const command = `git log --oneline ${sinceClause} -- ${patterns} || echo ""`;
    
    const result = await this.executeGitCommand(command, repositoryPath);
    if (!result.isSuccess) {
      return result;
    }

    const commits = result.value
      .split('\n')
      .filter(line => line.trim().length > 0)
      .slice(0, 10); // Limit to 10 recent changes

    return {
      isSuccess: true,
      value: commits
    };
  }
}