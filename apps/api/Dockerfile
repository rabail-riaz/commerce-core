FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY apps/api apps/api
WORKDIR /app/apps/api
RUN npx prisma generate && npm run build
CMD ["npm", "run", "start:docker"]
