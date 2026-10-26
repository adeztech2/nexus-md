FROM node:20-slim

WORKDIR /app
ENV NODE_ENV=production

# Install dependencies first (cached unless package.json changes)
COPY package*.json ./
RUN npm install --omit=dev

COPY . .

EXPOSE 3000
CMD ["node", "index.js"]
