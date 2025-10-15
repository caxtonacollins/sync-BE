FROM node:22-alpine AS builder
WORKDIR /usr/src/app
RUN corepack enable
COPY package.json yarn.lock ./
RUN yarn install --immutable
COPY . .
RUN yarn build

FROM node:22-alpine AS runner
WORKDIR /usr/src/app
RUN corepack enable
COPY package.json yarn.lock ./
RUN yarn install --immutable --production
COPY --from=builder /usr/src/app/dist ./dist
EXPOSE 3000
CMD ["yarn", "start:prod"]
