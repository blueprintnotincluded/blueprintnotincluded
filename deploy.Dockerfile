FROM --platform=amd64 node:20-alpine as extract

WORKDIR /bpni

COPY package*.json ./
RUN npm ci --ignore-scripts && npm cache clean --force

# TODO separate build build stage for asset extract
COPY ./assets/database/database.json ./assets/database/database.json

FROM extract as build-backend
WORKDIR /bpni
COPY ./lib ./lib
RUN npm run build:lib
COPY ./scripts/copy_lib.sh ./scripts/
RUN ./scripts/copy_lib.sh
COPY ./tsconfig.json ./
COPY ./app ./app
COPY ./scripts/copy_assets.sh ./scripts/
RUN ./scripts/copy_assets.sh
COPY ./scripts/copy_views.sh ./scripts/
RUN ./scripts/copy_views.sh
COPY ./scripts/copy_public.sh ./scripts/
RUN ./scripts/copy_public.sh
RUN npm run build:backend

FROM extract as build-frontend
WORKDIR /bpni/frontend
COPY ./frontend/package*.json ./
RUN npm ci --ignore-scripts && npm cache clean --force
COPY ./lib ../lib
COPY ./frontend ./
RUN npm run build -- --output-path=../build/app/public/

FROM --platform=amd64 node:20-alpine as serve-prod
WORKDIR /bpni
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build-backend /bpni/build /bpni/build
COPY --from=build-frontend /bpni/build/app/public /bpni/build/app/public

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
