# Development image. This is NOT the deploy image — that is deploy.Dockerfile,
# which builds the app; this one only supplies the toolchain and then gets out
# of the way. The source arrives as a bind mount at /app, so nothing is COPYed
# in and the build context is this directory alone.
#
# Node matches .nvmrc / package.json engines. Bump all three together.
ARG NODE_VERSION=20.19.4
FROM node:${NODE_VERSION}-bookworm

# canvas and sharp are native modules. Both publish prebuilt binaries for
# linux-x64-glibc, so the toolchain below is usually unused — but the moment a
# prebuild is missing (a new node minor, an arm64 host) node-gyp needs cairo's
# headers, and an npm ci that fails only on someone else's machine is a bad
# trade for a few hundred megabytes here. netcat-openbsd is what
# scripts/test-db-setup.sh probes the database with.
RUN apt-get update -qq \
 && DEBIAN_FRONTEND=noninteractive apt-get install -yq --no-install-recommends \
      build-essential python3 pkg-config \
      libcairo2-dev libpango1.0-dev libjpeg-dev libgif-dev librsvg2-dev \
      ca-certificates curl git less vim netcat-openbsd \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

# GitHub CLI — `gh pr create` from inside the container is the normal way a
# task ends, so it belongs in the image rather than in a setup step.
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
      | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
 && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
      > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update -qq \
 && DEBIAN_FRONTEND=noninteractive apt-get install -yq --no-install-recommends gh \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

# Installed globally so it survives a container rebuild rather than being
# reinstalled into a bind-mounted node_modules on every create.
RUN npm install -g @anthropic-ai/claude-code

RUN git config --system core.editor vi

# The node image already ships a `node` user at uid/gid 1000, which is the uid
# a Linux workstation hands out first — so bind-mounted files are owned
# correctly without any remapping. Pre-create the named-volume mount points as
# that user: a volume's ownership is seeded from the image's directory the
# first time it is created, and a root-owned one is unwritable afterwards.
RUN mkdir -p /app/node_modules /app/frontend/node_modules /app/log /home/node/.npm \
 && chown -R node:node /app /home/node/.npm

WORKDIR /app
USER node
