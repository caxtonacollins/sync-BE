# syntax=docker/dockerfile:1
FROM node:22-alpine

# Install build dependencies
RUN apk add --no-cache python3 make g++ gcc libc-dev

# Enable corepack and prepare yarn
RUN corepack enable && corepack prepare yarn@4.9.1 --activate

WORKDIR /usr/src/app

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies with peer dependency warnings ignored
RUN yarn install --ignore-peer-deps

# Copy prisma schema
COPY prisma ./prisma/

# Copy the rest of the application
COPY . .

# Generate Prisma Client and build
RUN yarn prisma generate && \
    yarn build && \
    yarn install --ignore-peer-deps --production

# Clean up build dependencies and cache
RUN apk del python3 make g++ gcc libc-dev && \
    rm -rf node_modules/.cache

# Expose the port your app runs on
EXPOSE 3000

CMD ["yarn", "start:prod"]
