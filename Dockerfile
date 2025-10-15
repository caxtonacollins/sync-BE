# syntax=docker/dockerfile:1
FROM node:22-alpine

# Install build dependencies
RUN apk add --no-cache python3 make g++ gcc libc-dev

# Enable corepack and prepare yarn
RUN corepack enable && corepack prepare yarn@4.9.1 --activate

WORKDIR /usr/src/app

# Copy package files
COPY package.json yarn.lock ./

# Install all dependencies
RUN yarn install --immutable

# Copy prisma schema
COPY prisma ./prisma/

# Generate Prisma Client
RUN yarn prisma generate

# Copy the rest of the application
COPY . .

# Build the application
RUN yarn build

# Install only production dependencies (excludes devDependencies)
RUN yarn workspaces focus --all --production

# Clean up build dependencies and cache
RUN apk del python3 make g++ gcc libc-dev && \
    rm -rf node_modules/.cache

# Expose the port your app runs on
EXPOSE 3000

CMD ["yarn", "start:prod"]
