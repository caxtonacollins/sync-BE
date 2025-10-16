FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY prisma ./prisma
COPY libs ./libs
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN pnpm install --frozen-lockfile
RUN npx prisma generate
RUN pnpm build

FROM node:22-alpine AS runtime

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY --from=builder /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/libs ./libs
COPY --from=builder /app/src ./src

ENV NODE_ENV=production

CMD ["node", "dist/src/main.js"]