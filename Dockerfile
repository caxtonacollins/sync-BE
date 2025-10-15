# syntax=docker/dockerfile:1
FROM node:22-alpine

RUN corepack enable

WORKDIR /usr/src/app

COPY package.json yarn.lock ./

RUN yarn install

COPY prisma ./prisma
COPY . .

RUN yarn prisma generate && \
    yarn build && \
    yarn install --production

RUN rm -rf node_modules/.cache

EXPOSE 3000

CMD ["yarn", "start:prod"]
