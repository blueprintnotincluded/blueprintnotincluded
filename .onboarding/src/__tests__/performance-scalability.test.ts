import { expect } from 'chai';
import { OnboardingOrchestrator } from '../orchestrator/onboarding-orchestrator';
import { ProgressiveChecklist } from '../checklist/progressive-checklist';
import { DocumentationManager } from '../managers/documentation-manager';
import { ContentValidationEngine } from '../validation/content-validation-engine';
import { UserType, DeveloperRole, StepStatus } from '../types';

describe('Performance and Scalability Testing (Task 8.3)', () => {
  let orchestrator: OnboardingOrchestrator;
  let checklist: ProgressiveChecklist;
  let documentationManager: DocumentationManager;
  let validationEngine: ContentValidationEngine;

  beforeEach(() => {
    orchestrator = new OnboardingOrchestrator();
    checklist = new ProgressiveChecklist();
    documentationManager = new DocumentationManager();
    validationEngine = new ContentValidationEngine();
  });

  describe('Large Documentation Set Processing', () => {
    it('should process 1000+ documentation files efficiently', async () => {
      // RED: This test should fail initially
      const startTime = Date.now();
      
      // Simulate large documentation set
      const largeDocumentationSet = [];
      for (let i = 0; i < 1000; i++) {
        largeDocumentationSet.push({
          path: `docs/section-${Math.floor(i / 100)}/doc-${i}.md`,
          content: `# Document ${i}\n\nThis is a sample documentation file with content ${i}.\n\n## Section\n\nSome detailed content here.`,
          lastModified: new Date(Date.now() - (i * 1000))
        });
      }

      // Process the large documentation set
      const validationResult = await validationEngine.validateLargeDocumentationSet(largeDocumentationSet);
      
      const endTime = Date.now();
      const processingTime = endTime - startTime;

      expect(validationResult.isSuccess).to.be.true;
      expect(validationResult.value?.totalProcessed).to.equal(1000);
      expect(validationResult.value?.successfullyProcessed).to.be.greaterThan(950); // 95% success rate
      expect(processingTime).to.be.lessThan(30000); // Should complete within 30 seconds
      expect(validationResult.value?.averageProcessingTimePerFile).to.be.lessThan(100); // < 100ms per file
    });

    it('should handle complex directory structures with deep nesting', async () => {
      // RED: This test should fail initially
      const complexStructure = [];
      
      // Create deeply nested structure (10 levels deep)
      for (let level = 0; level < 10; level++) {
        for (let dir = 0; dir < 5; dir++) {
          for (let file = 0; file < 20; file++) {
            const depth = '/'.repeat(level);
            complexStructure.push({
              path: `docs${depth}/level-${level}/dir-${dir}/file-${file}.md`,
              content: `# Level ${level} Document\n\nContent for level ${level}, directory ${dir}, file ${file}`,
              lastModified: new Date()
            });
          }
        }
      }

      const startTime = Date.now();
      const validationResult = await validationEngine.validateComplexDirectoryStructure(complexStructure);
      const endTime = Date.now();

      expect(validationResult.isSuccess).to.be.true;
      expect(validationResult.value?.totalFiles).to.equal(1000); // 10 levels * 5 dirs * 20 files
      expect(validationResult.value?.maxDepth).to.equal(10);
      expect(validationResult.value?.processingTime).to.be.lessThan(20000); // < 20 seconds
      expect(endTime - startTime).to.be.lessThan(25000); // Total time < 25 seconds
    });

    it('should validate 500+ external links efficiently', async () => {
      // RED: This test should fail initially
      const linksToValidate = [];
      
      // Create diverse set of links (mix of valid, invalid, slow-responding)
      for (let i = 0; i < 500; i++) {
        if (i < 300) {
          // Valid links (simulated)
          linksToValidate.push(`https://example-valid-${i}.com/docs`);
        } else if (i < 450) {
          // Invalid/broken links (simulated)
          linksToValidate.push(`https://example-broken-${i}.com/nonexistent`);
        } else {
          // Slow-responding links (simulated)
          linksToValidate.push(`https://example-slow-${i}.com/timeout`);
        }
      }

      const startTime = Date.now();
      const linkValidationResult = await validationEngine.validateExternalLinks(linksToValidate, {
        timeoutMs: 5000,
        concurrency: 10,
        retryCount: 1
      });
      const endTime = Date.now();

      expect(linkValidationResult.isSuccess).to.be.true;
      expect(linkValidationResult.value?.totalLinks).to.equal(500);
      expect(linkValidationResult.value?.validLinks).to.be.greaterThan(250); // At least 50% valid
      expect(linkValidationResult.value?.processingTime).to.be.lessThan(60000); // < 60 seconds
      expect(endTime - startTime).to.be.lessThan(65000); // Total time < 65 seconds
      expect(linkValidationResult.value?.averageResponseTime).to.be.lessThan(1000); // < 1s average
    });

    it('should efficiently parse and analyze large Markdown files', async () => {
      // RED: This test should fail initially
      // Create very large markdown file (1MB+)
      let largeMarkdownContent = '# Large Documentation File\n\n';
      
      for (let section = 0; section < 100; section++) {
        largeMarkdownContent += `## Section ${section}\n\n`;
        for (let subsection = 0; subsection < 10; subsection++) {
          largeMarkdownContent += `### Subsection ${section}.${subsection}\n\n`;
          largeMarkdownContent += 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(50);
          largeMarkdownContent += '\n\n';
          
          // Add code blocks
          largeMarkdownContent += '```typescript\n';
          largeMarkdownContent += `function example${section}_${subsection}() {\n`;
          largeMarkdownContent += '  return "This is a code example";\n';
          largeMarkdownContent += '}\n```\n\n';
          
          // Add links
          largeMarkdownContent += `[Link to section ${section}](#section-${section})\n\n`;
        }
      }

      const fileSizeBytes = Buffer.byteLength(largeMarkdownContent, 'utf8');
      expect(fileSizeBytes).to.be.greaterThan(1024 * 1024); // > 1MB

      const startTime = Date.now();
      const parseResult = await validationEngine.parseAndAnalyzeLargeMarkdown(largeMarkdownContent);
      const endTime = Date.now();

      expect(parseResult.isSuccess).to.be.true;
      expect(parseResult.value?.fileSizeBytes).to.equal(fileSizeBytes);
      expect(parseResult.value?.sectionCount).to.equal(100);
      expect(parseResult.value?.subsectionCount).to.equal(1000);
      expect(parseResult.value?.codeBlockCount).to.equal(1000);
      expect(parseResult.value?.linkCount).to.equal(1000);
      expect(parseResult.value?.parseTime).to.be.lessThan(5000); // < 5 seconds
      expect(endTime - startTime).to.be.lessThan(7000); // Total time < 7 seconds
    });
  });

  describe('Concurrent User Session Testing', () => {
    it('should handle 100 concurrent onboarding sessions without performance degradation', async () => {
      // RED: This test should fail initially
      const concurrentSessions = 100;
      const sessionPromises = [];

      const startTime = Date.now();

      // Create 100 concurrent sessions
      for (let i = 0; i < concurrentSessions; i++) {
        const sessionPromise = (async () => {
          const role = [DeveloperRole.FRONTEND, DeveloperRole.BACKEND, DeveloperRole.DEVOPS][i % 3];
          const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, role);
          
          if (sessionResult.isSuccess && sessionResult.value) {
            const session = sessionResult.value;
            const steps = checklist.generateChecklistForRole(role, 'darwin', session.sessionId);
            
            // Complete first 3 steps for each session
            for (let stepIndex = 0; stepIndex < Math.min(3, steps.length); stepIndex++) {
              const progressResult = checklist.updateProgress(
                session.sessionId, 
                steps[stepIndex].id, 
                StepStatus.COMPLETED
              );
              expect(progressResult.isSuccess).to.be.true;
            }
            
            return session.sessionId;
          }
          throw new Error('Failed to create session');
        })();
        
        sessionPromises.push(sessionPromise);
      }

      // Wait for all sessions to complete
      const completedSessions = await Promise.all(sessionPromises);
      const endTime = Date.now();

      expect(completedSessions.length).to.equal(concurrentSessions);
      expect(endTime - startTime).to.be.lessThan(10000); // < 10 seconds for all sessions
      
      // Verify memory usage hasn't exploded (basic check)
      const memoryUsage = process.memoryUsage();
      expect(memoryUsage.heapUsed).to.be.lessThan(100 * 1024 * 1024); // < 100MB heap
    });

    it('should maintain performance with high-frequency progress updates', async () => {
      // RED: This test should fail initially
      const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.FULLSTACK);
      expect(sessionResult.isSuccess).to.be.true;
      
      if (sessionResult.isSuccess && sessionResult.value) {
        const session = sessionResult.value;
        const steps = checklist.generateChecklistForRole(DeveloperRole.FULLSTACK, 'darwin', session.sessionId);
        
        const updateCount = 1000;
        const startTime = Date.now();
        
        // Perform rapid progress updates (simulating real-time progress tracking)
        for (let i = 0; i < updateCount; i++) {
          const stepIndex = i % steps.length;
          const status = i % 2 === 0 ? StepStatus.IN_PROGRESS : StepStatus.COMPLETED;
          
          const progressResult = checklist.updateProgress(session.sessionId, steps[stepIndex].id, status);
          expect(progressResult.isSuccess).to.be.true;
        }
        
        const endTime = Date.now();
        const totalTime = endTime - startTime;
        
        expect(totalTime).to.be.lessThan(5000); // < 5 seconds for 1000 updates
        expect(totalTime / updateCount).to.be.lessThan(10); // < 10ms per update on average
      }
    });

    it('should handle resource contention gracefully', async () => {
      // RED: This test should fail initially
      const contendingSessions = 50;
      const sharedResourcePromises = [];

      // Create multiple sessions that all try to access shared resources simultaneously
      for (let i = 0; i < contendingSessions; i++) {
        const contentionPromise = (async () => {
          const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.BACKEND);
          
          if (sessionResult.isSuccess && sessionResult.value) {
            const session = sessionResult.value;
            
            // All sessions try to generate documentation simultaneously
            const docResult = documentationManager.getRoleSpecificDocumentation('backend');
            expect(docResult.isSuccess).to.be.true;
            
            // All sessions try to validate content simultaneously
            const validationResult = await validationEngine.validateContent('test-content');
            expect(validationResult.isSuccess).to.be.true;
            
            return {
              sessionId: session.sessionId,
              docSuccess: docResult.isSuccess,
              validationSuccess: validationResult.isSuccess
            };
          }
          throw new Error('Failed to create session');
        })();
        
        sharedResourcePromises.push(contentionPromise);
      }

      const startTime = Date.now();
      const results = await Promise.all(sharedResourcePromises);
      const endTime = Date.now();

      expect(results.length).to.equal(contendingSessions);
      expect(results.every(r => r.docSuccess && r.validationSuccess)).to.be.true;
      expect(endTime - startTime).to.be.lessThan(15000); // < 15 seconds even with contention
    });
  });

  describe('Memory Usage and Cleanup Verification', () => {
    it('should maintain stable memory usage during long-running operations', async () => {
      // RED: This test should fail initially
      const initialMemory = process.memoryUsage();
      const operationCount = 500;
      
      for (let i = 0; i < operationCount; i++) {
        // Create and complete a full onboarding session
        const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.FRONTEND);
        
        if (sessionResult.isSuccess && sessionResult.value) {
          const session = sessionResult.value;
          const steps = checklist.generateChecklistForRole(DeveloperRole.FRONTEND, 'darwin', session.sessionId);
          
          // Complete all steps
          for (const step of steps) {
            checklist.updateProgress(session.sessionId, step.id, StepStatus.COMPLETED);
          }
          
          // Mark session complete
          orchestrator.markSessionComplete(session.sessionId);
          
          // Trigger garbage collection periodically
          if (i % 50 === 0 && global.gc) {
            global.gc();
          }
        }
      }

      const finalMemory = process.memoryUsage();
      const memoryGrowth = finalMemory.heapUsed - initialMemory.heapUsed;
      
      // Memory growth should be reasonable (< 50MB for 500 operations)
      expect(memoryGrowth).to.be.lessThan(50 * 1024 * 1024);
      
      // Heap growth per operation should be minimal
      const memoryPerOperation = memoryGrowth / operationCount;
      expect(memoryPerOperation).to.be.lessThan(100 * 1024); // < 100KB per operation
    });

    it('should properly clean up resources after session completion', async () => {
      // RED: This test should fail initially
      const sessionCount = 100;
      const initialMemory = process.memoryUsage();
      
      // Create many sessions
      const sessionIds = [];
      for (let i = 0; i < sessionCount; i++) {
        const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.BACKEND);
        
        if (sessionResult.isSuccess && sessionResult.value) {
          sessionIds.push(sessionResult.value.sessionId);
        }
      }

      const midMemory = process.memoryUsage();
      
      // Complete and clean up all sessions
      for (const sessionId of sessionIds) {
        orchestrator.markSessionComplete(sessionId);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Wait a bit for cleanup
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const finalMemory = process.memoryUsage();
      
      // Memory should not grow excessively after cleanup
      const cleanupEfficiency = (midMemory.heapUsed - finalMemory.heapUsed) / (midMemory.heapUsed - initialMemory.heapUsed);
      expect(cleanupEfficiency).to.be.greaterThan(0.5); // At least 50% of allocated memory cleaned up
    });

    it('should handle memory pressure gracefully', async () => {
      // RED: This test should fail initially
      const largeDataSize = 10 * 1024 * 1024; // 10MB
      const largeDataChunks = [];
      
      try {
        // Create memory pressure
        for (let i = 0; i < 50; i++) { // 500MB total
          largeDataChunks.push(Buffer.alloc(largeDataSize, 'x'));
        }

        // Try to perform onboarding operations under memory pressure
        const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.FULLSTACK);
        expect(sessionResult.isSuccess).to.be.true;
        
        if (sessionResult.isSuccess && sessionResult.value) {
          const session = sessionResult.value;
          const steps = checklist.generateChecklistForRole(DeveloperRole.FULLSTACK, 'darwin', session.sessionId);
          
          // Should still be able to complete operations
          expect(steps.length).to.be.greaterThan(0);
          
          const progressResult = checklist.updateProgress(session.sessionId, steps[0].id, StepStatus.COMPLETED);
          expect(progressResult.isSuccess).to.be.true;
        }
        
      } finally {
        // Clean up large data chunks
        largeDataChunks.length = 0;
        if (global.gc) {
          global.gc();
        }
      }
    });
  });

  describe('Performance Benchmarking and Metrics', () => {
    it('should meet performance benchmarks for core operations', async () => {
      // RED: This test should fail initially
      const benchmarks = {
        sessionCreation: { maxTime: 50, samples: 100 },
        stepGeneration: { maxTime: 100, samples: 50 },
        progressUpdate: { maxTime: 25, samples: 200 },
        documentationRetrieval: { maxTime: 75, samples: 100 }
      };

      const results: { [key: string]: number[] } = {};

      // Benchmark session creation
      results.sessionCreation = [];
      for (let i = 0; i < benchmarks.sessionCreation.samples; i++) {
        const start = process.hrtime.bigint();
        const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.FRONTEND);
        const end = process.hrtime.bigint();
        
        expect(sessionResult.isSuccess).to.be.true;
        results.sessionCreation.push(Number(end - start) / 1000000); // Convert to ms
      }

      // Benchmark step generation
      results.stepGeneration = [];
      for (let i = 0; i < benchmarks.stepGeneration.samples; i++) {
        const start = process.hrtime.bigint();
        const steps = checklist.generateChecklistForRole(DeveloperRole.BACKEND, 'darwin');
        const end = process.hrtime.bigint();
        
        expect(steps.length).to.be.greaterThan(0);
        results.stepGeneration.push(Number(end - start) / 1000000);
      }

      // Benchmark progress updates
      const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.DEVOPS);
      if (sessionResult.isSuccess && sessionResult.value) {
        const session = sessionResult.value;
        const steps = checklist.generateChecklistForRole(DeveloperRole.DEVOPS, 'darwin', session.sessionId);
        
        results.progressUpdate = [];
        for (let i = 0; i < benchmarks.progressUpdate.samples; i++) {
          const stepIndex = i % steps.length;
          const start = process.hrtime.bigint();
          const progressResult = checklist.updateProgress(session.sessionId, steps[stepIndex].id, StepStatus.COMPLETED);
          const end = process.hrtime.bigint();
          
          expect(progressResult.isSuccess).to.be.true;
          results.progressUpdate.push(Number(end - start) / 1000000);
        }
      }

      // Benchmark documentation retrieval
      results.documentationRetrieval = [];
      for (let i = 0; i < benchmarks.documentationRetrieval.samples; i++) {
        const roles = ['frontend', 'backend', 'devops'];
        const role = roles[i % roles.length];
        
        const start = process.hrtime.bigint();
        const docResult = documentationManager.getRoleSpecificDocumentation(role);
        const end = process.hrtime.bigint();
        
        expect(docResult.isSuccess).to.be.true;
        results.documentationRetrieval.push(Number(end - start) / 1000000);
      }

      // Verify all benchmarks are met
      for (const [operation, times] of Object.entries(results)) {
        const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
        const maxTime = Math.max(...times);
        const expectedMaxTime = benchmarks[operation as keyof typeof benchmarks].maxTime;
        
        expect(avgTime, `Average time for ${operation}`).to.be.lessThan(expectedMaxTime / 2);
        expect(maxTime, `Max time for ${operation}`).to.be.lessThan(expectedMaxTime);
      }
    });

    it('should provide detailed performance metrics and profiling data', async () => {
      // RED: This test should fail initially
      const performanceProfiler = await validationEngine.createPerformanceProfiler();
      
      performanceProfiler.startProfiling('full-onboarding-workflow');
      
      // Execute full onboarding workflow while profiling
      const sessionResult = orchestrator.startOnboarding(UserType.HUMAN_DEVELOPER, DeveloperRole.FULLSTACK);
      expect(sessionResult.isSuccess).to.be.true;
      
      if (sessionResult.isSuccess && sessionResult.value) {
        const session = sessionResult.value;
        
        performanceProfiler.markMilestone('session-created');
        
        const steps = checklist.generateChecklistForRole(DeveloperRole.FULLSTACK, 'darwin', session.sessionId);
        performanceProfiler.markMilestone('steps-generated');
        
        for (const step of steps) {
          performanceProfiler.startMilestone(`step-${step.id}`);
          const progressResult = checklist.updateProgress(session.sessionId, step.id, StepStatus.COMPLETED);
          performanceProfiler.endMilestone(`step-${step.id}`);
          expect(progressResult.isSuccess).to.be.true;
        }
        
        orchestrator.markSessionComplete(session.sessionId);
        performanceProfiler.markMilestone('session-completed');
      }
      
      const profileData = performanceProfiler.stopProfiling('full-onboarding-workflow');
      
      expect(profileData.isSuccess).to.be.true;
      expect(profileData.value?.totalTime).to.be.lessThan(1000); // < 1 second
      expect(profileData.value?.milestones).to.have.length.greaterThan(5);
      expect(profileData.value?.bottlenecks).to.be.an('array');
      expect(profileData.value?.memoryProfile).to.exist;
      expect(profileData.value?.cpuProfile).to.exist;
    });
  });
});