FROM --platform=amd64 node:20-alpine as extract

WORKDIR /bpni

COPY package*.json ./
RUN npm ci --ignore-scripts && npm cache clean --force

# TODO separate build build stage for asset extract
COPY ./assets/database/database-2024.json ./assets/database/database-2024.json
COPY ./assets/avatar-reference ./assets/avatar-reference

FROM extract as build-backend
WORKDIR /bpni
COPY ./lib ./lib
RUN npm run build:lib
COPY ./scripts/copy_lib.sh ./scripts/
RUN ./scripts/copy_lib.sh
COPY ./tsconfig.json ./
COPY ./app ./app
COPY ./scripts/copy_assets.sh ./scripts/batch.sh ./scripts/
RUN ./scripts/copy_assets.sh
COPY ./scripts/copy_views.sh ./scripts/
RUN ./scripts/copy_views.sh
COPY ./scripts/copy_public.sh ./scripts/
RUN ./scripts/copy_public.sh
COPY ./scripts ./scripts
RUN npm run build:backend

FROM extract as build-frontend
WORKDIR /bpni/frontend
COPY ./frontend/package*.json ./
RUN npm ci --ignore-scripts && npm cache clean --force
COPY ./lib ../lib
COPY ./frontend ./
RUN npm run build -- --output-path=../build/app/public/
RUN npm run build:admin -- --output-path=../build/app/public/admin/

# Debian (glibc) base: node-canvas ships no musl prebuilds, and building it from
# source on alpine needs the full cairo toolchain. The glibc prebuild is static.
FROM --platform=amd64 node:20-slim as serve-prod
WORKDIR /bpni
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
# --ignore-scripts skips canvas's install script (prebuild-install), which is what
# fetches build/Release/canvas.node. Rebuild only canvas, then fail the build early
# if the binding still can't load.
RUN npm rebuild canvas && node -e "require('canvas')"
COPY --from=build-backend /bpni/build /bpni/build
COPY --from=build-frontend /bpni/build/app/public /bpni/build/app/public
# Migrations run from the deploy console (cd /bpni/build && npm run migrate:up);
# migrate-mongo resolves its config and migrationsDir relative to cwd, so both
# must ship inside the runtime image.
COPY migrate-mongo-config.js /bpni/build/
COPY migrations /bpni/build/migrations

# glibc malloc grows one arena per thread by default; sharp/libvips's thread
# pool spreads allocations across them and freed pages never return to the OS,
# so parent RSS ratchets upward under image traffic. Capping arenas is the
# standard mitigation on glibc (sharp docs recommend this or jemalloc).
# Inherited by the forked preview render worker.
ENV MALLOC_ARENA_MAX=2

# Optional: Set version information via environment variables
ARG BUILD_DATE
ARG GIT_COMMIT
ARG GIT_BRANCH
ENV BUILD_DATE=${BUILD_DATE}
ENV GIT_COMMIT=${GIT_COMMIT}
ENV GIT_BRANCH=${GIT_BRANCH}

EXPOSE 3000
WORKDIR /bpni/build
CMD [ "node", "app/server.js" ]
