"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DocumentationManager = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const constants_1 = require("../constants");
/**
 * Manages documentation structure creation, validation, and template initialization
 * for the project onboarding system.
 */
class DocumentationManager {
    constructor() {
        this.requiredDirectories = Object.values(constants_1.ONBOARDING_PATHS);
        this.requiredTemplateFiles = [...constants_1.REQUIRED_TEMPLATE_FILES];
    }
    async initializeStructure(projectPath) {
        try {
            const createdDirectories = [];
            const createdFiles = [];
            // Create required directories
            for (const dir of this.requiredDirectories) {
                const fullPath = path.join(projectPath, dir);
                if (!fs.existsSync(fullPath)) {
                    fs.mkdirSync(fullPath, { recursive: true });
                    createdDirectories.push(dir);
                }
            }
            // Create template files
            await this.createTemplateFiles(projectPath, createdFiles);
            return {
                success: true,
                createdDirectories,
                createdFiles
            };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }
    async validateStructure(projectPath) {
        const missingDirectories = [];
        const missingFiles = [];
        const errors = [];
        try {
            // Check required directories
            for (const dir of this.requiredDirectories) {
                const fullPath = path.join(projectPath, dir);
                if (!fs.existsSync(fullPath)) {
                    missingDirectories.push(dir);
                }
            }
            // Check required template files
            for (const file of this.requiredTemplateFiles) {
                const fullPath = path.join(projectPath, '.onboarding', file);
                if (!fs.existsSync(fullPath)) {
                    missingFiles.push(file);
                }
            }
            const isValid = missingDirectories.length === 0 && missingFiles.length === 0;
            return {
                isValid,
                missingDirectories,
                missingFiles,
                errors
            };
        }
        catch (error) {
            errors.push(error instanceof Error ? error.message : 'Unknown validation error');
            return {
                isValid: false,
                missingDirectories,
                missingFiles,
                errors
            };
        }
    }
    async createTemplateFiles(projectPath, createdFiles) {
        const templatesDir = path.join(projectPath, '.onboarding', 'config', 'templates');
        // Human onboarding template
        const humanOnboardingTemplate = `# Welcome to {{projectName}}

## Overview
{{description}}

## Setup
Follow these steps to get started:

1. Clone the repository
2. Install dependencies
3. Configure environment
4. Run the application

## Architecture
This project follows {{architecturePattern}} architecture.

## Contributing
Please read our contributing guidelines before submitting changes.
`;
        // Agent context template
        const agentContextTemplate = {
            projectName: "{{projectName}}",
            description: "{{description}}",
            technologies: "{{technologies}}",
            architecture: "{{architecture}}",
            conventions: "{{conventions}}",
            lastUpdated: "{{lastUpdated}}"
        };
        // Project overview template
        const projectOverviewTemplate = `# {{projectName}} Overview

{{description}}

## Key Features
- Feature 1
- Feature 2
- Feature 3

## Technology Stack
{{technologies}}
`;
        // Setup guide template
        const setupGuideTemplate = `# Setup Guide

## Prerequisites
- Node.js {{nodeVersion}}
- {{additionalPrerequisites}}

## Installation Steps
1. Clone the repository
2. Install dependencies: \`npm install\`
3. Configure environment variables
4. Start the application: \`npm run dev\`

## Verification
Run tests to verify setup: \`npm test\`
`;
        // Write template files
        const templates = [
            { filename: 'human-onboarding.md', content: humanOnboardingTemplate },
            { filename: 'agent-context.json', content: JSON.stringify(agentContextTemplate, null, 2) },
            { filename: 'project-overview.md', content: projectOverviewTemplate },
            { filename: 'setup-guide.md', content: setupGuideTemplate }
        ];
        for (const template of templates) {
            const filePath = path.join(templatesDir, template.filename);
            if (!fs.existsSync(filePath)) {
                fs.writeFileSync(filePath, template.content, 'utf8');
                createdFiles.push(`config/templates/${template.filename}`);
            }
        }
    }
}
exports.DocumentationManager = DocumentationManager;
//# sourceMappingURL=documentation-manager.js.map