# CI Performance Optimization

## Blacksmith Testing Plan
Testing [Blacksmith](https://www.blacksmith.sh/) as GitHub Actions replacement for potential 75% cost reduction and 2-4x performance improvements.

### Quick Start
1. **Sign up**: Visit https://www.blacksmith.sh/ (3,000 free minutes/month)
2. **Test locally**: `./agent/test-blacksmith-performance.sh local`
3. **Create report**: `./agent/test-blacksmith-performance.sh report`
4. **Use workflow**: Copy `agent/blacksmith-frontend-test.yml` to `.github/workflows/`

### Key Files Created
- `agent/blacksmith-test-plan.md` - Detailed testing strategy
- `agent/blacksmith-frontend-test.yml` - Blacksmith workflow configuration
- `agent/test-blacksmith-performance.sh` - Performance testing script

### Expected Benefits
- **2x faster hardware**: Higher single-core performance
- **4x faster cache downloads**: Co-located npm cache
- **40x faster Docker builds**: Persistent Docker layers
- **75% cost reduction**: More efficient pricing

### Current CI Analysis
- Frontend tests: Node 18.20.4, npm install, Angular build, Karma tests
- Backend tests: Node 20.18.0, MongoDB service, Jest tests
- Deploy: Docker builds, DigitalOcean registry

### Next Steps
1. ✅ Create testing plan and scripts
2. 🔄 Sign up for Blacksmith account
3. ⏳ Create test repository
4. ⏳ Run baseline GitHub Actions tests
5. ⏳ Configure and test Blacksmith workflow
6. ⏳ Compare performance and make recommendation

