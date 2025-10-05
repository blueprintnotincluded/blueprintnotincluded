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
/**
 * Manages documentation structure creation, validation, and template initialization
 * for the project onboarding system.
 */
export declare class DocumentationManager {
    private readonly requiredDirectories;
    private readonly requiredTemplateFiles;
    initializeStructure(projectPath: string): Promise<InitializationResult>;
    validateStructure(projectPath: string): Promise<StructureValidationResult>;
    private createTemplateFiles;
}
//# sourceMappingURL=documentation-manager.d.ts.map