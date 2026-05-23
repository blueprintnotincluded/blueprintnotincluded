#!/bin/bash

# Script to test CI workflows locally using Docker
# This simulates the GitHub Actions environment

set -e

echo "🧪 Testing CI workflows locally..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Test backend workflow
test_backend() {
    print_status "Testing backend workflow..."
    
    # Start MongoDB in Docker
    print_status "Starting MongoDB container..."
    docker run -d --name test-mongo -p 27017:27017 mongo:8.0.23
    
    # Wait for MongoDB to be ready
    print_status "Waiting for MongoDB to be ready..."
    until nc -z localhost 27017; do
        echo "Waiting for MongoDB..."
        sleep 2
    done
    print_success "MongoDB is ready"
    
    # Set environment variables
    export NODE_ENV=test
    export DB_URI=mongodb://localhost:27017/blueprintnotincluded_test
    export JWT_SECRET=test_jwt_secret_for_ci
    
    # Install dependencies and run tests
    print_status "Installing dependencies..."
    npm ci
    
    print_status "Building shared library..."
    npm run build:lib
    
    print_status "Running backend tests..."
    npm run test
    
    print_success "Backend tests completed"
    
    # Clean up
    docker stop test-mongo
    docker rm test-mongo
}

# Test frontend workflow
test_frontend() {
    print_status "Testing frontend workflow..."
    
    # Build lib with backend Node version first
    print_status "Building shared library (Node 20.18.0)..."
    npm ci
    npm run build:lib
    
    # Switch to frontend directory
    cd frontend
    
    print_status "Installing frontend dependencies (Node 20.18.0)..."
    npm ci
    
    print_status "Running frontend linting..."
    npm run lint
    
    print_status "Running frontend tests..."
    npm run ci:karma
    
    print_status "Building frontend..."
    npm run build
    
    print_success "Frontend tests completed"
    
    cd ..
}

# Test TypeScript compilation (quick check)
test_typescript() {
    print_status "Testing TypeScript compilation..."
    
    npm ci
    npm run build:lib
    npm run tsc
    
    print_success "TypeScript compilation successful"
}

# Main execution
case "${1:-all}" in
    "backend")
        test_backend
        ;;
    "frontend")
        test_frontend
        ;;
    "typescript")
        test_typescript
        ;;
    "all")
        print_status "Running all tests..."
        test_typescript
        test_backend
        test_frontend
        print_success "All tests completed successfully!"
        ;;
    *)
        echo "Usage: $0 [backend|frontend|typescript|all]"
        echo "  backend    - Test backend workflow with MongoDB"
        echo "  frontend   - Test frontend workflow"
        echo "  typescript - Test TypeScript compilation only"
        echo "  all        - Run all tests (default)"
        exit 1
        ;;
esac