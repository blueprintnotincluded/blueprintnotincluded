import { 
  Result, 
  SuccessResult, 
  ErrorResult,
  GitChangeEvent,
  ChangeRelevanceAnalysis,
  DocumentationUpdateTrigger,
  DocumentationTask,
  WebhookEvent,
  WebhookRegistration,
  GitMonitoringResult,
  WebhookEventData,
  WebhookHandleResult,
  DocumentationSyncResult,
  DocumentationFreshnessCheck,
  DocumentationRecommendation,
  DocumentationChangeHistory
} from '../types';
import { GitError } from '../errors';
import { GitUtils } from '../utils/git-utils';
import { FilePatternAnalyzer } from '../utils/file-pattern-analyzer';
import * as fs from 'fs';
import * as path from 'path';

export class VersionControlIntegration {
  private repositoryPath: string;
  private isInitialized: boolean = false;

  constructor(repositoryPath: string) {
    this.repositoryPath = repositoryPath;
  }

  async initializeGitMonitoring(): Promise<Result<GitMonitoringResult, GitError>> {
    try {
      // Resolve absolute path
      const absolutePath = path.resolve(this.repositoryPath);
      
      // Check if directory exists
      if (!fs.existsSync(absolutePath)) {
        return {
          isSuccess: false,
          error: new GitError(`Repository path does not exist: ${absolutePath}`)
        } as ErrorResult<GitError>;
      }

      // Check if it's a git repository
      if (!GitUtils.isGitRepository(absolutePath)) {
        return {
          isSuccess: false,
          error: new GitError(`not a git repository: ${absolutePath}`)
        } as ErrorResult<GitError>;
      }

      // Get current branch and last commit
      const branchResult = await GitUtils.getCurrentBranch(absolutePath);
      const commitResult = await GitUtils.getCurrentCommit(absolutePath);
      
      if (!branchResult.isSuccess) {
        return {
          isSuccess: false,
          error: branchResult.error
        } as ErrorResult<GitError>;
      }

      if (!commitResult.isSuccess) {
        return {
          isSuccess: false,
          error: commitResult.error
        } as ErrorResult<GitError>;
      }
      
      this.isInitialized = true;
      this.repositoryPath = absolutePath; // Update to absolute path
      
      return {
        isSuccess: true,
        value: {
          isGitRepository: true,
          repositoryPath: absolutePath,
          currentBranch: branchResult.value,
          lastCommit: commitResult.value
        }
      } as SuccessResult<GitMonitoringResult>;
    } catch (error) {
      return {
        isSuccess: false,
        error: new GitError(`Failed to initialize git monitoring: ${error}`)
      } as ErrorResult<GitError>;
    }
  }

  async detectChanges(): Promise<Result<GitChangeEvent, GitError>> {
    if (!this.isInitialized) {
      const initResult = await this.initializeGitMonitoring();
      if (!initResult.isSuccess) {
        return {
          isSuccess: false,
          error: new GitError('git operation failed')
        } as ErrorResult<GitError>;
      }
    }

    // Get git status to detect changes
    const statusResult = await GitUtils.getStatus(this.repositoryPath);
    if (!statusResult.isSuccess) {
      return {
        isSuccess: false,
        error: statusResult.error
      } as ErrorResult<GitError>;
    }

    return {
      isSuccess: true,
      value: {
        hasChanges: (statusResult.value?.length ?? 0) > 0,
        changedFiles: statusResult.value || [],
        timestamp: new Date()
      }
    } as SuccessResult<GitChangeEvent>;
  }

  async analyzeChangeRelevance(changedFiles: string[]): Promise<Result<ChangeRelevanceAnalysis, GitError>> {
    try {
      const analysis = FilePatternAnalyzer.analyzeChangeRelevance(changedFiles);
      return {
        isSuccess: true,
        value: analysis
      } as SuccessResult<ChangeRelevanceAnalysis>;
    } catch (error) {
      return {
        isSuccess: false,
        error: new GitError(`Failed to analyze change relevance: ${error}`)
      } as ErrorResult<GitError>;
    }
  }

  async triggerDocumentationUpdate(files: string[]): Promise<Result<DocumentationUpdateTrigger, GitError>> {
    try {
      const apiFiles = files.filter(file => file.includes('/api/'));
      const hasApiChanges = apiFiles.length > 0;

      if (hasApiChanges) {
        return {
          isSuccess: true,
          value: {
            triggered: true,
            updateType: 'api-documentation',
            affectedFiles: apiFiles
          }
        } as SuccessResult<DocumentationUpdateTrigger>;
      } else {
        return {
          isSuccess: true,
          value: {
            triggered: false,
            updateType: '',
            affectedFiles: [],
            reason: 'no documentation impact detected'
          }
        } as SuccessResult<DocumentationUpdateTrigger>;
      }
    } catch (error) {
      return {
        isSuccess: false,
        error: new GitError(`Failed to trigger documentation update: ${error}`)
      } as ErrorResult<GitError>;
    }
  }

  async generateDocumentationTasks(changedFiles: string[]): Promise<Result<DocumentationTask[], GitError>> {
    try {
      const tasks = FilePatternAnalyzer.generateDocumentationTasks(changedFiles);
      return {
        isSuccess: true,
        value: tasks
      } as SuccessResult<DocumentationTask[]>;
    } catch (error) {
      return {
        isSuccess: false,
        error: new GitError(`Failed to generate documentation tasks: ${error}`)
      } as ErrorResult<GitError>;
    }
  }

  async registerWebhooks(events: WebhookEvent[]): Promise<Result<WebhookRegistration, GitError>> {
    try {
      // Validate webhook events
      const validEvents: WebhookEvent[] = ['push', 'pull_request', 'release', 'issues'];
      const invalidEvents = events.filter(event => !validEvents.includes(event));
      
      if (invalidEvents.length > 0) {
        return {
          isSuccess: false,
          error: new GitError(`invalid webhook event: ${invalidEvents.join(', ')}`)
        } as ErrorResult<GitError>;
      }

      // Mock webhook registration
      const webhookId = `webhook-${Date.now()}`;
      const endpointUrl = `/onboarding/webhook/${webhookId}`;

      return {
        isSuccess: true,
        value: {
          webhookId,
          events,
          endpointUrl
        }
      } as SuccessResult<WebhookRegistration>;
    } catch (error) {
      return {
        isSuccess: false,
        error: new GitError(`Failed to register webhooks: ${error}`)
      } as ErrorResult<GitError>;
    }
  }

  async handleWebhookEvent(eventData: WebhookEventData): Promise<Result<WebhookHandleResult, GitError>> {
    try {
      const actionsTaken: string[] = [];
      let documentationUpdatesTriggered = false;

      if (eventData.type === 'push' && eventData.commits) {
        const modifiedFiles = eventData.commits.flatMap(commit => commit.modified);
        const apiFiles = modifiedFiles.filter(file => file.includes('api/'));
        
        if (apiFiles.length > 0) {
          actionsTaken.push('analyzed-api-changes');
          documentationUpdatesTriggered = true;
        }
      }

      if (eventData.type === 'pull_request' && eventData.pullRequest) {
        const changedFiles = eventData.pullRequest.changedFiles;
        const requiresReview = changedFiles.some(file => 
          file.includes('/api/') || file.includes('/models/')
        );

        actionsTaken.push('analyzed-pr-changes');
        
        return {
          isSuccess: true,
          value: {
            processed: true,
            actionsTaken,
            documentationUpdatesTriggered,
            prAnalysis: {
              requiresDocumentationReview: requiresReview,
              suggestedReviewers: [],
              affectedSections: []
            }
          }
        } as SuccessResult<WebhookHandleResult>;
      }

      return {
        isSuccess: true,
        value: {
          processed: true,
          actionsTaken,
          documentationUpdatesTriggered
        }
      } as SuccessResult<WebhookHandleResult>;
    } catch (error) {
      return {
        isSuccess: false,
        error: new GitError(`Failed to handle webhook event: ${error}`)
      } as ErrorResult<GitError>;
    }
  }

  async synchronizeDocumentation(changedFiles: string[]): Promise<Result<DocumentationSyncResult, GitError>> {
    try {
      // Check if files exist
      const nonExistentFiles = changedFiles.filter(file => 
        !fs.existsSync(path.join(this.repositoryPath, file))
      );

      if (nonExistentFiles.length === changedFiles.length) {
        return {
          isSuccess: true,
          value: {
            documentationPath: 'AGENTS.md',
            syncStatus: 'failed',
            updatedSections: [],
            errorMessage: 'Files do not exist',
            fallbackAction: 'manual_update'
          }
        } as SuccessResult<DocumentationSyncResult>;
      }

      const documentationPath = path.join(this.repositoryPath, 'AGENTS.md');
      const updatedSections: string[] = [];

      if (changedFiles.some(file => file.includes('/api/'))) {
        updatedSections.push('API Documentation');
      }

      return {
        isSuccess: true,
        value: {
          documentationPath: 'AGENTS.md',
          syncStatus: 'success',
          updatedSections
        }
      } as SuccessResult<DocumentationSyncResult>;
    } catch (error) {
      return {
        isSuccess: false,
        error: new GitError(`Failed to synchronize documentation: ${error}`)
      } as ErrorResult<GitError>;
    }
  }

  async validateDocumentationFreshness(): Promise<Result<DocumentationFreshnessCheck, GitError>> {
    try {
      const agentsPath = path.join(this.repositoryPath, 'AGENTS.md');
      const readmePath = path.join(this.repositoryPath, 'README.md');
      
      const staleDocuments = [];
      let isUpToDate = true;

      if (fs.existsSync(agentsPath)) {
        const stats = fs.statSync(agentsPath);
        const daysSinceUpdate = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
        
        if (daysSinceUpdate > 7) {
          isUpToDate = false;
          staleDocuments.push({
            path: 'AGENTS.md',
            lastUpdated: stats.mtime,
            staleness: Math.round(daysSinceUpdate)
          });
        }
      }

      return {
        isSuccess: true,
        value: {
          isUpToDate,
          staleDocuments,
          lastSyncTimestamp: new Date()
        }
      } as SuccessResult<DocumentationFreshnessCheck>;
    } catch (error) {
      return {
        isSuccess: false,
        error: new GitError(`Failed to validate documentation freshness: ${error}`)
      } as ErrorResult<GitError>;
    }
  }

  async generateUpdateRecommendations(recentChanges: string[]): Promise<Result<DocumentationRecommendation[], GitError>> {
    try {
      const recommendations: DocumentationRecommendation[] = [];

      const modelChanges = recentChanges.filter(file => file.includes('/models/'));
      if (modelChanges.length > 0) {
        recommendations.push({
          priority: 'high',
          section: 'Database Models',
          suggestedChanges: 'Update model schema documentation to reflect recent changes',
          reason: 'Model files have been modified',
          affectedFiles: modelChanges
        });
      }

      const componentChanges = recentChanges.filter(file => file.includes('/components/'));
      if (componentChanges.length > 0) {
        recommendations.push({
          priority: 'medium',
          section: 'Frontend Components',
          suggestedChanges: 'Review component documentation for UI changes',
          reason: 'Component files have been updated',
          affectedFiles: componentChanges
        });
      }

      return {
        isSuccess: true,
        value: recommendations
      } as SuccessResult<DocumentationRecommendation[]>;
    } catch (error) {
      return {
        isSuccess: false,
        error: new GitError(`Failed to generate update recommendations: ${error}`)
      } as ErrorResult<GitError>;
    }
  }

  async getDocumentationChangeHistory(): Promise<Result<DocumentationChangeHistory, GitError>> {
    try {
      if (!this.isInitialized) {
        await this.initializeGitMonitoring();
      }

      // Get recent git log for documentation-related files
      const logResult = await GitUtils.getLogForFiles(
        this.repositoryPath, 
        ['*.md', 'docs/*'], 
        '1 month ago'
      );

      if (!logResult.isSuccess) {
        return {
          isSuccess: false,
          error: logResult.error
        } as ErrorResult<GitError>;
      }
      
      const changes = (logResult.value || []).map(line => {
        const [hash, ...messageParts] = line.split(' ');
        return {
          timestamp: new Date(), // In real implementation, would parse git log timestamp
          type: 'documentation' as const,
          files: ['AGENTS.md'], // In real implementation, would get actual files
          description: messageParts.join(' '),
          author: 'unknown' // In real implementation, would get actual author
        };
      });

      return {
        isSuccess: true,
        value: {
          changes,
          totalChanges: changes.length,
          lastChange: changes.length > 0 ? changes[0].timestamp : undefined
        }
      } as SuccessResult<DocumentationChangeHistory>;
    } catch (error) {
      return {
        isSuccess: false,
        error: new GitError(`Failed to get documentation change history: ${error}`)
      } as ErrorResult<GitError>;
    }
  }
}