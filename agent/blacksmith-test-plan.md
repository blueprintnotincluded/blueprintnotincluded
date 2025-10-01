# Blacksmith CI Testing Plan

## Overview
Testing [Blacksmith](https://www.blacksmith.sh/) as a GitHub Actions replacement to validate performance and cost benefits.

## Current CI Setup Analysis
- **Frontend Tests**: Node 18.20.4, npm install, Angular build, Karma tests
- **Backend Tests**: Node 20.18.0, MongoDB service, Jest tests  
- **Deploy**: Docker builds, DigitalOcean registry

## Testing Strategy

### Phase 1: Setup & Baseline (Day 1)
1. **Sign up for Blacksmith**
   - Visit https://www.blacksmith.sh/
   - Create account (3,000 free minutes/month)
   - Connect GitHub repository

2. **Create Test Repository**
   - Fork main repository or create minimal test repo
   - Avoid affecting production CI

3. **Establish Baseline**
   - Run current frontend tests on GitHub Actions
   - Record timing: npm install, build, test execution
   - Note any reliability issues

### Phase 2: Blacksmith Configuration (Day 1-2)
4. **Create Blacksmith Workflow**
   - Convert `.github/workflows/frontend-test.yml` to use Blacksmith
   - Replace `runs-on: ubuntu-latest` with Blacksmith runner
   - Test configuration

5. **Run Blacksmith Tests**
   - Execute same frontend test suite
   - Measure performance improvements
   - Check reliability and error handling

### Phase 3: Analysis & Decision (Day 2-3)
6. **Performance Comparison**
   - Timing: npm install, build, test execution
   - Reliability: success rate, error patterns
   - Cost: GitHub Actions vs Blacksmith pricing

7. **Document Results**
   - Update TODO_CI.md with findings
   - Create recommendation for full migration

## Expected Benefits to Validate

### Performance Claims
- **2x faster hardware**: Higher single-core performance
- **4x faster cache downloads**: Co-located npm cache  
- **40x faster Docker builds**: Persistent Docker layers
- **75% cost reduction**: More efficient pricing

### Key Metrics to Track
- Total job execution time
- npm install duration
- Angular build time
- Karma test execution time
- Cache hit rates
- Error rates and reliability

## Test Workflow Configuration

### Current GitHub Actions Frontend Test
```yaml
name: Frontend Tests
on:
  push:
    branches: [master]
    paths: ['frontend/**', 'lib/**']
  pull_request:
    branches: [master]
    paths: ['frontend/**', 'lib/**']

jobs:
  frontend-test:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js (Backend for lib build)
        uses: actions/setup-node@v4
        with:
          node-version: '18.20.4'
          cache: 'npm'

      - name: Install backend dependencies (for lib build)
        run: npm ci

      - name: Build shared library
        run: npm run build:lib

      - name: Setup Node.js (Frontend)
        uses: actions/setup-node@v4
        with:
          node-version: '18.20.4'
          cache: 'npm'
          cache-dependency-path: 'frontend/package-lock.json'

      - name: Install frontend dependencies
        run: |
          cd frontend
          npm ci

      - name: Run frontend linting
        run: |
          cd frontend
          npm run lint

      - name: Run frontend tests
        run: |
          cd frontend
          npm run ci:karma

      - name: Build frontend
        run: |
          cd frontend
          npm run build
```

### Blacksmith Equivalent
```yaml
name: Frontend Tests (Blacksmith)
on:
  push:
    branches: [master]
    paths: ['frontend/**', 'lib/**']
  pull_request:
    branches: [master]
    paths: ['frontend/**', 'lib/**']

jobs:
  frontend-test:
    runs-on: blacksmith-ubuntu-latest
    
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js (Backend for lib build)
        uses: actions/setup-node@v4
        with:
          node-version: '18.20.4'
          cache: 'npm'

      - name: Install backend dependencies (for lib build)
        run: npm ci

      - name: Build shared library
        run: npm run build:lib

      - name: Setup Node.js (Frontend)
        uses: actions/setup-node@v4
        with:
          node-version: '18.20.4'
          cache: 'npm'
          cache-dependency-path: 'frontend/package-lock.json'

      - name: Install frontend dependencies
        run: |
          cd frontend
          npm ci

      - name: Run frontend linting
        run: |
          cd frontend
          npm run lint

      - name: Run frontend tests
        run: |
          cd frontend
          npm run ci:karma

      - name: Build frontend
        run: |
          cd frontend
          npm run build
```

## Success Criteria

### Minimum Viable Test
- Frontend tests complete successfully on Blacksmith
- Performance improvement > 20% in total execution time
- No reliability regressions

### Full Migration Criteria  
- Performance improvement > 50% in total execution time
- Cost reduction > 50%
- All existing workflows work without modification
- Better observability and debugging tools

## Next Steps
1. Sign up for Blacksmith account
2. Create test repository
3. Run baseline tests on GitHub Actions
4. Configure and test Blacksmith workflow
5. Compare results and make recommendation

## Resources
- [Blacksmith Documentation](https://www.blacksmith.sh/)
- [Blacksmith Pricing](https://www.blacksmith.sh/pricing)
- [GitHub Actions to Blacksmith Migration Guide](https://www.blacksmith.sh/docs)





