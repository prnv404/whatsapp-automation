FROM oven/bun:latest

WORKDIR /app

# Copy package configuration
COPY package.json bun.lock ./

# Install dependencies (only production if possible, but bun install is fast)
RUN bun install

# Copy application code
COPY src ./src
COPY tsconfig.json ./

# Command to run the application
CMD ["bun", "run", "start"]
