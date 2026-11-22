# API de ReCircula Campus (NestJS) para AWS Lambda (imagen de contenedor) con Lambda Web Adapter.
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
ENV AWS_LWA_PORT=4200
# Traduce las peticiones de Lambda a HTTP normal hacia el servidor NestJS.
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 4200
CMD ["node", "dist/main.js"]