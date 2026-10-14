FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY backend/package.json backend/package.json
COPY _legacy-web/package.json _legacy-web/package.json
RUN npm ci
COPY backend backend
WORKDIR /app/backend
RUN npx prisma generate && npm run build
CMD ["npm", "run", "start:docker"]
