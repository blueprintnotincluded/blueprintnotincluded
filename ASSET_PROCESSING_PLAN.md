# Asset Processing Improvement Plan

## Overview
This document outlines the plan to modernize and improve the asset processing system for blueprintnotincluded.org. The system processes game data exports from Oxygen Not Included into web-ready assets.

## Current System Analysis

### Asset Processing Pipeline
1. **Extract Export** (`extract-export.ts`) - Main orchestrator
   - Extracts `export.zip` (game data export)
   - Moves images to `assets/images/`
   - Processes database JSON
   - Runs image processing pipeline
   - Creates final database files

2. **Image Processing Steps**
   - `generate-icons.ts` - Creates UI icons from sprites using PIXI.js/Canvas
   - `generate-groups.ts` - Groups related sprites into single textures
   - `generate-white.ts` - Creates white background variants
   - `generate-repack.ts` - Packs sprites into texture atlases using bin-packing

### Key Files & Outputs (Currently in Source Control)
- `assets/database/database.json` - Main processed database
- `assets/database/database-groups.json` - After grouping step
- `assets/database/database-white.json` - After white variants
- `assets/database/database-repack.json` - Final repacked database
- `assets/images/ui/*.png` - Generated UI icons
- `assets/images/*.png` - Grouped and white variant textures
- `assets/images/repack_*.png` - Texture atlas files
- `frontend/src/assets/database.json` - Frontend copy
- `frontend/src/assets/images/` - Frontend asset copies

### Identified Issues
- **No test coverage** for asset processing
- **Manual memory management** with global.gc() calls
- **Limited error handling** and validation
- **Hardcoded paths** throughout codebase
- **Canvas/PIXI.js performance** not optimized
- **No progress reporting** for long operations

## Improvement Plan

### Phase 1: Baseline Testing (Current Focus)
**Goal**: Establish TDD foundation without changing existing functionality

#### 1.1 Test Infrastructure
- [ ] Create `__tests__/asset-processing/` directory
- [ ] Set up test database with sample data
- [ ] Create mock export.zip with minimal test data
- [ ] Add test utilities for file comparison

#### 1.2 Output Validation Tests
- [ ] Test database JSON structure validation
- [ ] Test generated image file existence and basic properties
- [ ] Test texture atlas UV coordinate correctness
- [ ] Compare current outputs against known good states

#### 1.3 Integration Tests
- [ ] Full pipeline test with mock data
- [ ] Individual step tests (icons, groups, white, repack)
- [ ] Error handling tests (missing files, corrupted data)

### Phase 2: Low-Hanging Fruit Improvements
**Goal**: Improve maintainability without major architectural changes

#### 2.1 Configuration & Paths
- [ ] Create centralized path configuration
- [ ] Externalize hardcoded values to config
- [ ] Add environment-specific settings

#### 2.2 Error Handling & Logging
- [ ] Replace console.log with structured logging
- [ ] Add proper error handling and recovery
- [ ] Add validation for input data

#### 2.3 Memory & Performance
- [ ] Optimize Canvas/PIXI.js resource cleanup
- [ ] Add progress reporting for long operations
- [ ] Profile memory usage patterns

### Phase 3: Architecture Improvements
**Goal**: Modernize system architecture for better scalability

#### 3.1 Parallel Processing
- [ ] Identify independent processing steps
- [ ] Implement concurrent execution where possible
- [ ] Add worker thread support for CPU-intensive tasks

#### 3.2 Incremental Processing
- [ ] Add change detection for input files
- [ ] Implement caching for unchanged assets
- [ ] Skip unnecessary regeneration

#### 3.3 Modular Design
- [ ] Create plugin architecture for processing steps
- [ ] Separate concerns (file I/O, image processing, data transformation)
- [ ] Add dependency injection for better testing

### Phase 4: Advanced Features
**Goal**: Prepare for major asset updates and future scalability

#### 4.1 CLI Interface
- [ ] Create proper command-line interface
- [ ] Add options for selective processing
- [ ] Add dry-run and validation modes

#### 4.2 Asset Validation
- [ ] Comprehensive input validation
- [ ] Output quality checks
- [ ] Performance regression detection

#### 4.3 Documentation & Monitoring
- [ ] Developer documentation
- [ ] Performance monitoring
- [ ] Asset update procedures

## Testing Strategy

### Key Principles
1. **Avoid binding to implementation details** - Test outputs, not internal methods
2. **Focus on key outputs** - Validate against current source control files
3. **Use existing assets** - Leverage current database files as test fixtures
4. **Incremental approach** - Start small, build confidence

### Test Categories

#### 1. Output Validation Tests
```typescript
// Example test structure
describe('Asset Processing Pipeline', () => {
  it('should generate database.json with expected structure', () => {
    // Compare against current assets/database/database.json
  });
  
  it('should create all required UI icon files', () => {
    // Verify assets/images/ui/*.png files exist and have valid dimensions
  });
  
  it('should generate texture atlases with correct UV mappings', () => {
    // Validate repack_*.png files and UV coordinates
  });
});
```

#### 2. Integration Tests
- Full pipeline execution with sample data
- Individual step validation
- Cross-step dependency verification

#### 3. Performance Tests
- Memory usage monitoring
- Processing time benchmarks
- Resource cleanup verification

## Implementation Notes

### Current Session Progress
- ✅ System analysis complete
- ✅ Plan documented
- 🔄 **Next**: Begin test infrastructure setup

### Multi-Session Continuity
- All progress tracked in this document
- Test files will be committed to source control
- Each phase has clear entry/exit criteria
- Can resume at any step

### Success Criteria
- **Phase 1**: 80%+ test coverage for asset processing pipeline
- **Phase 2**: Reduced memory usage, improved error handling
- **Phase 3**: 50%+ faster processing through parallelization
- **Phase 4**: Complete CLI interface with validation modes

## Next Steps
1. Create test directory structure
2. Set up minimal test fixtures
3. Write first output validation test
4. Gradually expand test coverage
5. Begin Phase 2 improvements once tests are stable