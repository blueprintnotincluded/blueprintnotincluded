# Testing GitHub Actions Locally

## Quick Fix Applied

The MongoDB wait issue was fixed by replacing `mongo` command with `nc` (netcat):

```bash
# OLD (broken - mongo CLI not installed)
until mongo --host localhost:27017 --eval "print('MongoDB is ready')"; do

# NEW (works - netcat is available in GitHub Actions)
until nc -z localhost 27017; do
```

## Local Testing Options

### Option 1: Use the test script (Recommended)

```bash
# Make script executable
chmod +x scripts/test-ci-locally.sh

# Test everything
./scripts/test-ci-locally.sh

# Test just backend (with MongoDB)
./scripts/test-ci-locally.sh backend

# Test just frontend
./scripts/test-ci-locally.sh frontend

# Test just TypeScript compilation
./scripts/test-ci-locally.sh typescript
```

### Option 2: Manual testing with Docker

```bash
# Start MongoDB
docker run -d --name test-mongo -p 27017:27017 mongo:7.0.34

# Wait for it to be ready
until nc -z localhost 27017; do echo "Waiting..."; sleep 2; done

# Set environment variables
export NODE_ENV=test
export DB_URI=mongodb://localhost:27017/blueprintnotincluded_test  
export JWT_SECRET=test_jwt_secret_for_ci

# Run tests
npm ci
npm run build:lib
npm run test

# Clean up
docker stop test-mongo && docker rm test-mongo
```

### Option 3: Using act (GitHub Actions locally)

Install [act](https://github.com/nektos/act) to run GitHub Actions locally:

```bash
# Install act (macOS)
brew install act

# Run backend tests
act -j backend-test

# Run frontend tests  
act -j frontend-test
```

## Node Version Requirements

- **Backend/Tests**: Node 20.18.0 (as specified in package.json volta config)
- **Frontend**: Node 20.18.0 (as specified in frontend/package.json volta config)

Use `nvm` or `volta` to switch between versions if testing manually.

## Troubleshooting

### MongoDB Connection Issues
- Ensure MongoDB is running on port 27017
- Check `nc -z localhost 27017` returns 0
- Verify `DB_URI` environment variable is set

### Node Version Issues
- Backend tests require Node 20.18.0
- Frontend tests require Node 20.18.0
- Use the test script to handle version switching automatically

### Port Conflicts
- If port 27017 is in use: `docker ps` and stop conflicting containers
- Or change the port in your test setup