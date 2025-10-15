FROM node:lts-alpine AS builder

# Enable corepack and prepare yarn
RUN corepack enable && corepack prepare yarn@4.9.1 --activate

WORKDIR /usr/src/app

# Copy package.json and yarn.lock to install dependencies
COPY package.json yarn.lock ./

# Install dependencies using Yarn
RUN yarn install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Build the NestJS application
RUN yarn build

# Stage 2: Production - Create a lean image for running the application
FROM node:lts-alpine AS production

ENV NODE_ENV production

# Create a non-root user for security
RUN addgroup --system --gid 1001 nestjsuser && \
    adduser --system --uid 1001 nestjsuser nestjsuser

WORKDIR /usr/src/app

# Install app dependencies
COPY package.json yarn.lock ./

# Copy only necessary files from the builder stage
COPY --from=builder --chown=nestjsuser:nestjsuser /usr/src/app/dist ./dist
COPY --from=builder --chown=nestjsuser:nestjsuser /usr/src/app/node_modules ./node_modules
COPY --from=builder --chown=nestjsuser:nestjsuser /usr/src/app/package.json ./package.json

# Switch to the non-root user
USER nestjsuser

# Command to start the NestJS application
CMD ["node", "dist/main.js"]