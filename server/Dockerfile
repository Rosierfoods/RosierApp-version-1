# Rosier backend + admin panel — container for Google Cloud Run (also works anywhere Docker runs).
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
# Cloud Run sets PORT (8080); the server reads it.
CMD ["node", "src/index.js"]
