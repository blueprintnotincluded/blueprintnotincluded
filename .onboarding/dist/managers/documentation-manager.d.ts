export interface InitializationResult {
    success: boolean;
    error?: string;
    createdDirectories?: string[];
    createdFiles?: string[];
}
export interface StructureValidationResult {
    isValid: boolean;
    missingDirectories: string[];
    missingFiles: string[];
    errors: string[];
}
export interface RoleSpecificDocumentation {
    role: string;
    sections: string[];
    content: {
        [section: string]: string;
    };
}
export interface DocumentationResult {
    isSuccess: boolean;
    value?: RoleSpecificDocumentation;
    error?: string;
}
/**
 * Manages documentation structure creation, validation, and template initialization
 * for the project onboarding system.
 */
export declare class DocumentationManager {
    private readonly requiredDirectories;
    private readonly requiredTemplateFiles;
    initializeStructure(projectPath: string): Promise<InitializationResult>;
    validateStructure(projectPath: string): Promise<StructureValidationResult>;
    /**
     * Get role-specific documentation sections and content
     */
    getRoleSpecificDocumentation(role: string): DocumentationResult;
    private createTemplateFiles;
    initializeWithDocumentationSet(documentationSet: any): Promise<{
        success: boolean;
        error?: string;
    }>;
    extractMetadataFromSet(documentationSet: any): Promise<{
        success: boolean;
        metadata?: any;
        error?: string;
    }>;
}
//# sourceMappingURL=documentation-manager.d.ts.map