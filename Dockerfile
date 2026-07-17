FROM node:18-alpine

# Install Chromium and required font packages for Puppeteer
RUN apk add --no-cache \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont

# Prevent Puppeteer from downloading its own Chrome (reduces build time) 
# and point it to the system-installed Chromium binary
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

WORKDIR /app

# Copy dependency files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy application files
COPY . .

# Port configuration (can be overridden by process.env.PORT)
EXPOSE 3000

# Run the server
CMD ["node", "server.js"]
