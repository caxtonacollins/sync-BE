# syntax=docker/dockerfile:1
FROM node:22-alpine

WORKDIR /usr/src/

COPY package.json yarn.lock ./

RUN npx prisma generate && \
    yarn build && \
    yarn install
    
COPY . .

RUN yarn build

EXPOSE 3000

CMD ["yarn", "start"]
