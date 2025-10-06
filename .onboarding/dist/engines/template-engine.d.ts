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
export interface TemplateComplianceResult {
    isCompliant: boolean;
    score: number;
    violations: ComplianceViolation[];
    scoreBreakdown: {
        structureScore: number;
        contentScore: number;
        formattingScore: number;
    };
}
export interface ComplianceViolation {
    type: 'structure' | 'content' | 'formatting';
    message: string;
    severity: 'error' | 'warning' | 'suggestion';
    line?: number;
    suggestion?: string;
}
export interface StyleGuideResult {
    violations: StyleViolation[];
    isValid: boolean;
    score: number;
}
export interface StyleViolation {
    type: 'formatting' | 'structure' | 'style';
    rule: string;
    message: string;
    line: number;
    severity: 'error' | 'warning' | 'suggestion';
    suggestion?: string;
}
export interface TemplateSuggestions {
    missingSections: string[];
    corrections: TemplateCorrection[];
    correctedTemplate: string;
    improvementScore: number;
}
export interface TemplateCorrection {
    type: 'add-section' | 'fix-format' | 'improve-content';
    section?: string;
    content: string;
    position: number;
}
export interface FormattingCorrections {
    correctedContent: string;
    appliedFixes: string[];
    fixCount: number;
}
export interface DocumentStructureResult {
    isValid: boolean;
    structureScore: number;
    patternMatches: string[];
    missingElements: string[];
    recommendations: StructureRecommendation[];
}
export interface StructureRecommendation {
    type: 'structure' | 'navigation' | 'metadata' | 'content';
    priority: 'high' | 'medium' | 'low';
    message: string;
    action: string;
    example?: string;
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
    validateTemplateCompliance(content: string, templateType: string): Promise<TemplateComplianceResult>;
    validateStyleGuide(content: string): Promise<StyleGuideResult>;
    generateTemplateSuggestions(content: string, templateType: string): Promise<TemplateSuggestions>;
    autoCorrectFormatting(content: string): Promise<FormattingCorrections>;
    validateDocumentStructure(content: string, templateType: string): Promise<DocumentStructureResult>;
    private getRequiredSectionsForCompliance;
    private extractExistingSections;
    private generateSectionTemplate;
}
//# sourceMappingURL=template-engine.d.ts.map