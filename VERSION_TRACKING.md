# Version Tracking System

A simple version tracking system that displays version information in the About dialog using environment variables.

## How It Works

### Development Mode
- Version information is fetched from `package.json`
- Git commit hash and branch are detected automatically (if available)
- Build time defaults to current time when the server starts

### Production Mode
- Version information is passed via environment variables during Docker build
- Git information is captured at build time and passed as environment variables

## Version Information Displayed

The About dialog shows:
- **Version**: Package version from `package.json`
- **Commit**: Short git commit hash (first 7 characters)
- **Environment**: Development, production, etc.
- **Build Time**: When the application was built (from environment variable)
- **Branch**: Git branch name (if available)
- **Node.js Version**: Runtime Node.js version

## API Endpoint

Version information is available via REST API:
```
GET /api/version
```

Returns JSON with all version details.

## Environment Variables

The system reads version information from these environment variables:

- `BUILD_DATE`: ISO timestamp of when the app was built
- `GIT_COMMIT`: Full git commit hash
- `GIT_BRANCH`: Git branch name
- `ENV_NAME`: Environment name (development, production, etc.)

## Docker Integration

For Docker deployments, pass version information via build arguments:

```bash
docker build \
  --build-arg BUILD_DATE="$(date -u +"%Y-%m-%dT%H:%M:%SZ")" \
  --build-arg GIT_COMMIT="$(git rev-parse HEAD)" \
  --build-arg GIT_BRANCH="$(git rev-parse --abbrev-ref HEAD)" \
  -t blueprintnotincluded:latest \
  -f deploy.Dockerfile .
```

## GitHub Actions Integration

The project includes a GitHub Actions workflow (`.github/workflows/publish.yml`) that automatically:

- Captures git commit and branch information during CI/CD
- Passes version metadata to Docker build via build arguments
- Verifies version information is correctly embedded in the built image
- Deploys to DigitalOcean Container Registry with full version tracking

The workflow automatically runs on pushes to the `master` branch and includes version information in the deployed container.

## Manual Version Updates

To update the version number, simply update the `version` field in `package.json`:

```json
{
  "version": "1.2.3"
}
```

The system will automatically pick up the new version on the next build.

## Setting Environment Variables Manually

You can also set version information manually by setting environment variables:

```bash
export BUILD_DATE="2024-01-15T10:30:00Z"
export GIT_COMMIT="abc123def456"
export GIT_BRANCH="main"
```

## Troubleshooting

### Version shows "unknown"
- Check that `package.json` exists and has a valid `version` field
- Ensure the build process completed successfully
- Check server logs for any errors loading version information

### Git information not available
- Ensure you're in a git repository
- Check that git is installed and accessible
- Git information is optional and won't break the system if unavailable

### Environment variables not working
- Verify environment variables are set correctly
- Check that the Docker build process is passing build arguments
- Environment variables take precedence over git detection
