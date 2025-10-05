import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { LinkTracker } from '../../.onboarding/src/validation/link-tracker';
import { DocumentReference, LinkValidationResult, ReferenceTrackingConfig } from '../../.onboarding/src/types/link-tracking';

describe('LinkTracker', () => {
  let linkTracker: LinkTracker;
  let testDir: string;

  before(() => {
    // Setup test directory with sample markdown files
    testDir = path.join(__dirname, '..', '..', '.onboarding', 'test-data');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Create test markdown files with cross-references
    const testFiles = {
      'guide.md': `# Main Guide
[Setup Instructions](setup.md)
[API Reference](./api/reference.md)
[External Link](https://example.com)
`,
      'setup.md': `# Setup
See [Main Guide](guide.md) for overview.
[Configuration](config.md#database)
`,
      'config.md': `# Configuration
## Database
Connection details here.
`,
      'api/reference.md': `# API Reference
Back to [Main Guide](../guide.md)
`
    };

    // Write test files
    Object.entries(testFiles).forEach(([filename, content]) => {
      const filePath = path.join(testDir, filename);
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, content);
    });

    const config: ReferenceTrackingConfig = {
      baseDirectory: testDir,
      fileExtensions: ['.md'],
      excludePatterns: ['node_modules/**', '.git/**'],
      linkPatterns: {
        markdown: /\[([^\]]+)\]\(([^)]+)\)/g,
        relative: /^\.{0,2}\//,
        external: /^https?:\/\//
      }
    };

    linkTracker = new LinkTracker(config);
  });

  after(() => {
    // Cleanup test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Cross-reference Detection', () => {
    it('should detect all markdown links in a file', async () => {
      const filePath = path.join(testDir, 'guide.md');
      const references = await linkTracker.extractReferencesFromFile(filePath);
      
      expect(references).to.have.lengthOf(3);
      expect(references[0]).to.deep.include({
        linkText: 'Setup Instructions',
        targetPath: 'setup.md',
        type: 'relative'
      });
      expect(references[1]).to.deep.include({
        linkText: 'API Reference',
        targetPath: './api/reference.md',
        type: 'relative'
      });
      expect(references[2]).to.deep.include({
        linkText: 'External Link',
        targetPath: 'https://example.com',
        type: 'external'
      });
    });

    it('should build complete reference map for directory', async () => {
      const referenceMap = await linkTracker.buildReferenceMap();
      
      expect(referenceMap).to.be.an('object');
      expect(Object.keys(referenceMap)).to.have.lengthOf.greaterThan(3);
      
      // Check that guide.md has outbound references
      const guideReferences = referenceMap[path.join(testDir, 'guide.md')];
      expect(guideReferences).to.exist;
      expect(guideReferences.outboundReferences).to.have.lengthOf(3);
    });

    it('should track bidirectional references', async () => {
      const referenceMap = await linkTracker.buildReferenceMap();
      
      // Check that setup.md is referenced by guide.md
      const setupPath = path.join(testDir, 'setup.md');
      const setupReferences = referenceMap[setupPath];
      
      expect(setupReferences.inboundReferences).to.have.lengthOf(1);
      expect(setupReferences.inboundReferences[0].sourceFile).to.equal(path.join(testDir, 'guide.md'));
    });
  });

  describe('Link Validation', () => {
    it('should validate all relative links exist', async () => {
      const validationResult = await linkTracker.validateAllLinks();
      
      expect(validationResult.totalLinks).to.be.greaterThan(0);
      expect(validationResult.validLinks).to.be.greaterThan(0);
      expect(validationResult.brokenLinks).to.have.lengthOf(0);
    });

    it('should detect broken relative links', async () => {
      // Create a file with broken link
      const brokenLinkFile = path.join(testDir, 'broken.md');
      fs.writeFileSync(brokenLinkFile, '[Missing File](nonexistent.md)');
      
      try {
        const validationResult = await linkTracker.validateAllLinks();
        
        expect(validationResult.brokenLinks).to.have.lengthOf(1);
        expect(validationResult.brokenLinks[0]).to.deep.include({
          sourceFile: brokenLinkFile,
          targetPath: 'nonexistent.md',
          errorType: 'file_not_found'
        });
      } finally {
        fs.unlinkSync(brokenLinkFile);
      }
    });

    it('should handle anchor links correctly', async () => {
      const references = await linkTracker.extractReferencesFromFile(path.join(testDir, 'setup.md'));
      const configReference = references.find(ref => ref.targetPath === 'config.md' && ref.anchor === 'database');
      
      expect(configReference).to.exist;
      expect(configReference!.anchor).to.equal('database');
    });
  });

  describe('Reference Updates', () => {
    it('should update links when file is moved', async () => {
      // Create a file that will be moved
      const oldPath = path.join(testDir, 'target-to-move.md');
      const newPath = path.join(testDir, 'moved-target.md');
      
      // Create a file that references the target
      const referringFile = path.join(testDir, 'referring-file.md');
      
      fs.writeFileSync(oldPath, '# Target file content');
      fs.writeFileSync(referringFile, '[Target File](target-to-move.md)');
      
      // Track references before move
      await linkTracker.buildReferenceMap();
      
      // Simulate file move
      const updateResult = await linkTracker.updateReferencesForMovedFile(oldPath, newPath);
      
      expect(updateResult.updatedFiles).to.have.lengthOf.greaterThan(0);
      expect(updateResult.totalUpdates).to.be.greaterThan(0);
      
      // Verify the reference was updated
      const updatedContent = fs.readFileSync(referringFile, 'utf8');
      expect(updatedContent).to.include('moved-target.md');
      
      // Cleanup
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      if (fs.existsSync(newPath)) fs.unlinkSync(newPath);
      if (fs.existsSync(referringFile)) fs.unlinkSync(referringFile);
    });

    it('should detect and suggest fixes for moved files', async () => {
      // Create a file that references another
      const referringFile = path.join(testDir, 'referring.md');
      const originalTarget = path.join(testDir, 'target.md');
      const movedTarget = path.join(testDir, 'moved-target.md');
      
      fs.writeFileSync(referringFile, '[Target](target.md)');
      fs.writeFileSync(originalTarget, '# Target');
      
      // Build initial reference map
      await linkTracker.buildReferenceMap();
      
      // Move the target file
      fs.renameSync(originalTarget, movedTarget);
      
      // Detect broken link and suggest fix
      const validationResult = await linkTracker.validateAllLinks();
      const brokenLink = validationResult.brokenLinks.find(link => 
        link.sourceFile === referringFile && link.targetPath === 'target.md'
      );
      
      expect(brokenLink).to.exist;
      
      const suggestions = await linkTracker.suggestLinkRepairs(validationResult);
      const suggestion = suggestions.find(s => s.brokenLink.sourceFile === referringFile);
      
      expect(suggestion).to.exist;
      expect(suggestion!.suggestedTarget).to.include('moved-target.md');
      
      // Cleanup
      fs.unlinkSync(referringFile);
      fs.unlinkSync(movedTarget);
    });
  });

  describe('Dependency Tracking', () => {
    it('should identify documentation dependencies', async () => {
      const dependencies = await linkTracker.analyzeDependencies();
      
      expect(dependencies).to.be.an('object');
      
      // guide.md should depend on setup.md and api/reference.md
      const guidePath = path.join(testDir, 'guide.md');
      const guideDeps = dependencies[guidePath];
      
      expect(guideDeps).to.exist;
      expect(guideDeps.dependencies).to.have.lengthOf.greaterThan(1);
    });

    it('should detect circular dependencies', async () => {
      // Create files with circular references
      const file1 = path.join(testDir, 'circular1.md');
      const file2 = path.join(testDir, 'circular2.md');
      
      fs.writeFileSync(file1, '[File 2](circular2.md)');
      fs.writeFileSync(file2, '[File 1](circular1.md)');
      
      try {
        const dependencies = await linkTracker.analyzeDependencies();
        const circularDeps = await linkTracker.detectCircularDependencies(dependencies);
        
        // Should detect circular dependencies (our test files create at least one)
        expect(circularDeps).to.have.lengthOf.greaterThan(0);
        expect(circularDeps[0]).to.have.property('cycle');
        expect(circularDeps[0]).to.have.property('severity');
        expect(circularDeps[0]).to.have.property('description');
      } finally {
        fs.unlinkSync(file1);
        fs.unlinkSync(file2);
      }
    });
  });
});