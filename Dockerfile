# syntax=docker/dockerfile:1
FROM node:24-alpine

# Use the Yarn version pinned in package.json (packageManager field) via Corepack.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /app

# Install deps first so this layer is cached unless the lockfile changes.
COPY package.json yarn.lock ./
RUN yarn install --immutable

# App source (data/secrets are NOT copied — they come in via a mounted volume).
COPY src ./src

# Served port + where the app reads/writes its JSON state.
ENV PORT=4440
ENV DATA_DIR=/data

EXPOSE 4440

# `yarn node` injects the Yarn PnP runtime so requires resolve correctly.
CMD ["yarn", "node", "src/index.js"]
