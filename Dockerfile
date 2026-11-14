# Multi-stage production image for the QOWL Next.js app.
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci

FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

FROM node:22-bookworm-slim AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
RUN useradd -m -u 1001 qowl
COPY --from=build --chown=qowl /app ./
USER qowl
EXPOSE 3000
# Apply pending migrations, then start. (Run migrations as a separate release step if you scale horizontally.)
CMD ["sh", "-c", "npx prisma migrate deploy && npx next start -p ${PORT}"]
