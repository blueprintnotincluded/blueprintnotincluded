export interface TemplateResult {
    success: boolean;
    content?: string;
    error?: string;
}
export interface TemplateValidationResult {
    isValid: boolean;
    requiredSections: string[];
    missingRequiredSections: string[];
    errors: string[];
}
export interface ProjectContext {
    projectName?: string;
    description?: string;
    technologies?: string[];
    role?: string;
    experienceLevel?: string;
    type?: string;
    framework?: string;
    database?: string;
    frontend?: string;
    hasTests?: boolean;
    hasDocker?: boolean;
    nodeVersion?: string;
    additionalPrerequisites?: string;
    title?: string;
    content?: string;
    name?: string;
    architecturePattern?: string;
    conventions?: string;
    architecture?: string;
    lastUpdated?: string;
}
/**
 * Template engine for generating and validating documentation content
 * with support for role-based customization and project context interpolation.
 */
export declare class TemplateEngine {
    private templates;
    constructor();
    generateFromTemplate(templateName: string, context: ProjectContext): Promise<TemplateResult>;
    validateTemplate(content: string, templateType: string): Promise<TemplateValidationResult>;
    private initializeTemplates;
    private getRoleTemplate;
    private getSetupGuideTemplate;
    private getBaseLayoutTemplate;
    private interpolateTemplate;
    private getRequiredSections;
}
//# sourceMappingURL=template-engine.d.ts.map