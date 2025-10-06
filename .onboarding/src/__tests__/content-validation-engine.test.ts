import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import { ContentValidationEngine } from '../validation/content-validation-engine';
import { 
  ContentValidationResult, 
  ValidationRule, 
  ContentQualityReport,
  DocumentFreshnessReport
} from '../types/content-validation';

describe('ContentValidationEngine', () => {
  let engine: ContentValidationEngine;
  let testDir: string;

  beforeEach(() => {
    testDir = path.join(__dirname, '../../test-fixtures');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    engine = new ContentValidationEngine({
      baseDirectory: testDir,
      rules: []
    });
  });

  afterEach(() => {
    // Clean up test fixtures
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('Content Validation Rules', () => {
    it('should validate required sections in documentation', async () => {
      // Create test markdown file missing required sections
      const testFile = path.join(testDir, 'incomplete.md');
      fs.writeFileSync(testFile, `# Title\n\nSome content without required sections.`);

      const rule: ValidationRule = {
        id: 'required-sections',
        name: 'Required Sections',
        severity: 'error',
        pattern: /^#+ (Overview|Setup|Usage)/gm,
        description: 'Documents must contain Overview, Setup, and Usage sections'
      };

      engine.addRule(rule);
      const result = await engine.validateFile(testFile);

      expect(result.isValid).to.be.false;
      expect(result.violations).to.have.length(1);
      expect(result.violations[0].ruleId).to.equal('required-sections');
    });

    it('should validate front matter schema compliance', async () => {
      const testFile = path.join(testDir, 'invalid-frontmatter.md');
      fs.writeFileSync(testFile, `---
title: Test
invalid_field: value
---

# Content`);

      const rule: ValidationRule = {
        id: 'frontmatter-schema',
        name: 'Front Matter Schema',
        severity: 'error',
        description: 'Front matter must comply with required schema',
        schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            description: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } }
          },
          required: ['title', 'description'],
          additionalProperties: false
        }
      };

      engine.addRule(rule);
      const result = await engine.validateFile(testFile);

      expect(result.isValid).to.be.false;
      expect(result.violations).to.have.length.greaterThan(0);
    });

    it('should check documentation freshness', async () => {
      const staleFile = path.join(testDir, 'stale.md');
      fs.writeFileSync(staleFile, `---
lastUpdated: 2020-01-01
---

# Stale Content`);

      // Set file modification time to simulate old file
      const oldDate = new Date('2020-01-01');
      fs.utimesSync(staleFile, oldDate, oldDate);

      const result = await engine.checkDocumentFreshness(staleFile);

      expect(result.isStale).to.be.true;
      expect(result.daysSinceUpdate).to.be.greaterThan(1000);
    });
  });

  describe('Content Quality Assessment', () => {
    it('should assess content readability and structure', async () => {
      const testFile = path.join(testDir, 'quality-test.md');
      fs.writeFileSync(testFile, `# Title

## Section 1

This is a very short paragraph.

## Section 2

This is a much longer paragraph that contains more detailed information about the topic. It should provide comprehensive coverage of the subject matter and help readers understand the concepts being discussed. The length and depth of explanation can be important factors in determining content quality.

### Subsection

- Point 1
- Point 2
- Point 3

## Code Example

\`\`\`javascript
function example() {
  return "Hello World";
}
\`\`\`
`);

      const qualityReport = await engine.assessContentQuality(testFile);

      expect(qualityReport.readabilityScore).to.be.a('number');
      expect(qualityReport.structureScore).to.be.a('number');
      expect(qualityReport.completenessScore).to.be.a('number');
      expect(qualityReport.overallScore).to.be.a('number');
      expect(qualityReport.suggestions).to.be.an('array');
    });

    it('should identify content gaps and improvement opportunities', async () => {
      const gappyFile = path.join(testDir, 'gaps.md');
      fs.writeFileSync(gappyFile, `# Title

Brief description.

## Installation

Install it.

## Usage

Use it.
`);

      const qualityReport = await engine.assessContentQuality(gappyFile);

      expect(qualityReport.suggestions).to.include.deep.members([
        {
          type: 'content_gap',
          message: 'Consider adding more detailed examples',
          severity: 'suggestion',
          line: undefined
        }
      ]);
    });
  });

  describe('Batch Validation', () => {
    it('should validate multiple files and generate comprehensive report', async () => {
      // Create multiple test files
      const files = ['doc1.md', 'doc2.md', 'doc3.md'];
      
      files.forEach((filename, index) => {
        const content = index === 1 ? 
          '# Invalid Document\n\nMissing required sections.' : 
          `# Valid Document ${index + 1}\n\n## Overview\n\nContent\n\n## Setup\n\nInstructions\n\n## Usage\n\nExamples`;
        
        fs.writeFileSync(path.join(testDir, filename), content);
      });

      const rule: ValidationRule = {
        id: 'required-sections',
        name: 'Required Sections',
        severity: 'error',
        pattern: /^#+ (Overview|Setup|Usage)/gm,
        description: 'Documents must contain Overview, Setup, and Usage sections'
      };

      engine.addRule(rule);
      const report = await engine.validateDirectory(testDir);

      expect(report.totalFiles).to.equal(3);
      expect(report.validFiles).to.equal(2);
      expect(report.invalidFiles).to.equal(1);
      expect(report.fileResults).to.have.length(3);
    });
  });

  describe('Automated Reporting', () => {
    it('should generate quality assessment reports with metrics', async () => {
      const testFile = path.join(testDir, 'report-test.md');
      fs.writeFileSync(testFile, `# Test Document

## Overview

This document serves as a test for the reporting functionality.

## Details

- Item 1
- Item 2

## Conclusion

Summary of the document.
`);

      const report = await engine.generateQualityReport(testFile);

      expect(report).to.have.property('metrics');
      expect(report.metrics).to.have.property('wordCount');
      expect(report.metrics).to.have.property('sectionCount');
      expect(report.metrics).to.have.property('linkCount');
      expect(report.metrics).to.have.property('codeBlockCount');
      expect(report).to.have.property('recommendations');
    });
  });
});