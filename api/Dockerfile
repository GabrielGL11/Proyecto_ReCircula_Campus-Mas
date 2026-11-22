# API de ReCircula Campus (NestJS) para AWS App Runner.
# Construir desde la carpeta api/:  docker build -t recircula-api .
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4200
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
USER node
EXPOSE 4200
CMD ["node", "dist/main.js"]
