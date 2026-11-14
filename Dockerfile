# CentiMeet API (Fastify) — για Google Cloud Run ή οποιονδήποτε host με Docker.
# Χτίζεται από τη ρίζα του monorepo: εγκαθιστά ΜΟΝΟ api + shared (όχι το Expo).
FROM node:22-slim

WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN npm ci --workspace @centimeet/shared --workspace @centimeet/api --include=dev --no-audit --no-fund

COPY packages/shared packages/shared
COPY apps/api apps/api

ENV NODE_ENV=production
ENV TRUST_PROXY=true
# Το Cloud Run δίνει τη θύρα στο PORT (8080)
ENV PORT=8080
EXPOSE 8080
WORKDIR /app/apps/api
USER node
CMD ["npx", "tsx", "src/index.ts"]
