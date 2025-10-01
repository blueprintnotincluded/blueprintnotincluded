#!/bin/bash

# Blacksmith CI Performance Testing Script
# This script helps measure and compare GitHub Actions vs Blacksmith performance

set -e

echo "🚀 Blacksmith CI Performance Testing"
echo "====================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to measure time
measure_time() {
    local start_time=$(date +%s)
    "$@"
    local end_time=$(date +%s)
    local duration=$((end_time - start_time))
    echo "$duration"
}

# Function to run frontend tests locally
run_local_tests() {
    print_status "Running frontend tests locally..."
    
    # Check if we're in the right directory
    if [ ! -f "package.json" ] || [ ! -d "frontend" ]; then
        print_error "Please run this script from the project root directory"
        exit 1
    fi
    
    # Install backend dependencies
    print_status "Installing backend dependencies..."
    npm ci
    
    # Build shared library
    print_status "Building shared library..."
    npm run build:lib
    
    # Install frontend dependencies
    print_status "Installing frontend dependencies..."
    cd frontend
    npm ci
    cd ..
    
    # Run linting
    print_status "Running frontend linting..."
    cd frontend
    npm run lint
    cd ..
    
    # Run tests
    print_status "Running frontend tests..."
    cd frontend
    npm run ci:karma
    cd ..
    
    # Build frontend
    print_status "Building frontend..."
    cd frontend
    npm run build
    cd ..
    
    print_success "Local tests completed successfully!"
}

# Function to analyze GitHub Actions logs
analyze_github_actions() {
    print_status "Analyzing GitHub Actions performance..."
    
    # Check if gh CLI is installed
    if ! command -v gh &> /dev/null; then
        print_warning "GitHub CLI (gh) not found. Install it to analyze GitHub Actions logs automatically."
        print_status "Manual analysis required:"
        echo "1. Go to your repository's Actions tab"
        echo "2. Find the latest frontend test run"
        echo "3. Note the total execution time"
        echo "4. Check individual step timings"
        return
    fi
    
    # Get latest workflow run
    local latest_run=$(gh run list --workflow="Frontend Tests" --limit=1 --json databaseId --jq '.[0].databaseId')
    
    if [ "$latest_run" = "null" ] || [ -z "$latest_run" ]; then
        print_warning "No recent frontend test runs found"
        return
    fi
    
    print_status "Latest frontend test run: $latest_run"
    
    # Get run details
    gh run view "$latest_run" --log
}

# Function to create performance report
create_report() {
    local report_file="blacksmith-performance-report.md"
    
    print_status "Creating performance report: $report_file"
    
    cat > "$report_file" << EOF
# Blacksmith CI Performance Report

Generated on: $(date)

## Test Environment
- Node.js Version: $(node --version)
- npm Version: $(npm --version)
- Operating System: $(uname -s) $(uname -r)

## Current GitHub Actions Performance
*[To be filled after running GitHub Actions]*

### Frontend Test Workflow Timing
- Total Execution Time: TBD
- npm install (backend): TBD
- Build shared library: TBD
- npm install (frontend): TBD
- Linting: TBD
- Karma tests: TBD
- Frontend build: TBD

## Blacksmith Performance
*[To be filled after running Blacksmith tests]*

### Frontend Test Workflow Timing
- Total Execution Time: TBD
- npm install (backend): TBD
- Build shared library: TBD
- npm install (frontend): TBD
- Linting: TBD
- Karma tests: TBD
- Frontend build: TBD

## Performance Comparison
*[To be calculated after both tests]*

| Metric | GitHub Actions | Blacksmith | Improvement |
|--------|----------------|------------|-------------|
| Total Time | TBD | TBD | TBD |
| npm install | TBD | TBD | TBD |
| Build time | TBD | TBD | TBD |
| Test execution | TBD | TBD | TBD |

## Recommendations
*[To be filled after analysis]*

## Next Steps
1. Run GitHub Actions baseline test
2. Configure Blacksmith workflow
3. Run Blacksmith test
4. Compare results
5. Make migration decision

EOF

    print_success "Performance report created: $report_file"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [COMMAND]"
    echo ""
    echo "Commands:"
    echo "  local       Run frontend tests locally to verify setup"
    echo "  analyze     Analyze GitHub Actions performance"
    echo "  report      Create performance report template"
    echo "  help        Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 local     # Run tests locally"
    echo "  $0 analyze   # Analyze GitHub Actions logs"
    echo "  $0 report    # Create report template"
}

# Main script logic
case "${1:-help}" in
    "local")
        run_local_tests
        ;;
    "analyze")
        analyze_github_actions
        ;;
    "report")
        create_report
        ;;
    "help"|*)
        show_usage
        ;;
esac





