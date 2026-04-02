# CI Improvements

Recommendations from security and performance review of `.github/workflows/`.
Ordered by priority — tackle from top to bottom.

---

## 1. Tests Never Block Deployment

**Priority**: High

### Motivation
In `publish.yml`, the `quick-check` job has `continue-on-error: true` and the `deploy` job has `if: always()`. This means deployment proceeds regardless of whether tests pass or fail — the check is purely cosmetic and provides no protection.

Additionally, `publish.yml` runs independently from `backend-test.yml` and `frontend-test.yml`. Those test workflows run in parallel with deployment and cannot block a push to master.

### Implementation
Remove `continue-on-error: true` from `quick-check` and change the `deploy` job's condition from `if: always()` to `if: success()` (or remove the `if` entirely, since `success()` is the default):

```yaml
# publish.yml

jobs:
  quick-check:
    runs-on: blacksmith-4vcpu-ubuntu-2404
    # Remove: continue-on-error: true

  deploy:
    runs-on: blacksmith-4vcpu-ubuntu-2404
    needs: quick-check
    # Remove: if: always()
    # Default behavior (if: success()) will block deploy when quick-check fails
```

---

## 2. Docker Tag Name Mismatch

**Priority**: High

### Motivation
The `Build Docker image` step tags the image as `${{ vars.IMAGE_NAME }}` but the `Tag image` step later references the hardcoded name `bni-deploy`. Unless `vars.IMAGE_NAME` is literally set to `bni-deploy`, the tag step will fail at runtime with a "No such image" error.

```yaml
# Line 61 — builds as vars.IMAGE_NAME
docker build ... -t ${{ vars.IMAGE_NAME }} ...

# Line 105 — references hardcoded 'bni-deploy'
docker tag bni-deploy ${{ vars.DIGITALOCEAN_REGISTRY }}/${{ vars.IMAGE_NAME }}
```

### Implementation
Use a consistent local tag name (e.g. `bni-deploy`) throughout the workflow, only using `vars.IMAGE_NAME` for the final registry tag:

```yaml
- name: Build Docker image
  run: |
    docker build \
      --build-arg BUILD_DATE="$BUILD_DATE" \
      --build-arg GIT_COMMIT="$GIT_COMMIT" \
      --build-arg GIT_BRANCH="$GIT_BRANCH" \
      -t bni-deploy \
      -f deploy.Dockerfile .

- name: Tag image
  run: docker tag bni-deploy ${{ vars.DIGITALOCEAN_REGISTRY }}/${{ vars.IMAGE_NAME }}
```

---

## 3. Dead Composite Actions

**Priority**: Medium

### Motivation
`.github/workflows/backend_install/action.yml` and `.github/workflows/frontend_install/action.yml` are composite actions that are never referenced by any workflow. They add maintenance surface and cause confusion. 

`backend_install` is also severely stale:
- Node.js 14.18.3 (reached end-of-life April 2023)
- Uses `npm install` instead of `npm ci` (non-reproducible installs)
- Uses `actions/setup-node@v1` (three major versions behind)

### Implementation

**Option A (simple)**: Delete both files. The three active workflows each handle their own setup inline and don't need them.

**Option B (use them)**: Refactor the active workflows to use these composite actions for DRY setup. This requires updating both files to match current Node versions and using `npm ci`. Only worth doing if the setup steps drift out of sync and become a maintenance burden.

Recommended: **Option A** — delete both files.

---

## 4. Node Version Inconsistency

**Priority**: Medium

### Motivation
Different workflows use different Node.js versions with no clear intent:

| Workflow | Node Version |
|----------|-------------|
| `backend-test.yml` | 20.18.0 |
| `frontend-test.yml` | 18.20.4 |
| `frontend_install` (unused) | 18.20.4 |
| `backend_install` (unused) | 14.18.3 |

The frontend tests run the lib build step with Node 18 while backend tests run it with Node 20. If there's a Node version compatibility issue in the lib it could pass in one workflow and fail in another. The app's `.nvmrc` or `engines` field in `package.json` should be the single source of truth.

Also, `frontend-test.yml` calls `actions/setup-node@v4` twice (lines 28 and 37) with the same version — the second call is redundant.

### Implementation
1. Decide on a single target Node version (Node 20 LTS per the upgrade plan).
2. Update `frontend-test.yml` to use Node 20.18.0 for both the lib build and frontend steps.
3. Remove the redundant second `setup-node` step in `frontend-test.yml` (the first setup persists for the whole job).
4. Set `engines` in `package.json` if not already set, so the target is documented in code.

```yaml
# frontend-test.yml — remove the second setup-node block (lines ~35-40)
# and update the first to use 20.18.0
- name: Setup Node.js
  uses: actions/setup-node@v4
  with:
    node-version: '20.18.0'
    cache: 'npm'
```

---

## 5. Stale MongoDB Health Check

**Priority**: Low

### Motivation
The MongoDB service health check in `backend-test.yml` uses the `mongo` CLI:

```yaml
--health-cmd "mongo --eval 'db.adminCommand(\"ismaster\")'"
```

The `mongo` shell was deprecated in MongoDB 5.0 and removed in MongoDB 6.0, replaced by `mongosh`. The workflow is pinned to `mongo:4.2` so this works today, but the health check will silently break if/when the MongoDB version is upgraded as part of the dependency upgrade plan.

### Implementation
Update the health check to use `mongosh` and the newer `hello` command (replacing the deprecated `isMaster`):

```yaml
services:
  mongodb:
    image: mongo:4.2
    ports:
      - 27017:27017
    options: >-
      --health-cmd "mongosh --eval 'db.adminCommand({hello:1})' --quiet"
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
```

Note: `mongosh` is only bundled with MongoDB 6.0+. When upgrading from `mongo:4.2`, switch the image and health check together.

---

## 6. No Docker Layer Caching

**Priority**: Low

### Motivation
`publish.yml` rebuilds the Docker image from scratch on every push to master. Layers that change infrequently (base OS, `npm install`, system dependencies) are re-downloaded and re-built every time, adding unnecessary build time.

### Implementation
Use `docker/build-push-action` with GitHub's cache backend instead of raw `docker build`:

```yaml
- name: Set up Docker Buildx
  uses: docker/setup-buildx-action@v3

- name: Build Docker image
  uses: docker/build-push-action@v6
  with:
    context: .
    file: deploy.Dockerfile
    tags: bni-deploy
    load: true
    build-args: |
      BUILD_DATE=${{ env.BUILD_DATE }}
      GIT_COMMIT=${{ env.GIT_COMMIT }}
      GIT_BRANCH=${{ env.GIT_BRANCH }}
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

This requires computing the build args in a prior step and exporting them as `$GITHUB_ENV` variables before the build step.

---

## Completed

_Move items here as they are resolved._
