FROM node:22-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  git \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate

WORKDIR /workspace

COPY packages/sandbox-cli/docker/sandbox-entrypoint.sh /usr/local/bin/sandbox-entrypoint.sh
COPY packages/sandbox-cli/docker/sandbox-bootstrap.mjs /usr/local/bin/sandbox-bootstrap.mjs

RUN chmod +x /usr/local/bin/sandbox-entrypoint.sh

ENTRYPOINT ["/usr/local/bin/sandbox-entrypoint.sh"]
