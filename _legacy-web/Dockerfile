FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY backend/package.json backend/package.json
COPY _legacy-web/package.json _legacy-web/package.json
RUN npm ci
COPY _legacy-web _legacy-web
WORKDIR /app/_legacy-web
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
RUN npm run build
CMD ["npm", "run", "start"]
