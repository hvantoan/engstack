# Build stage
FROM node:24-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Vite inline biến môi trường lúc build — thiếu ARG thì image prod không có client ID.
ARG VITE_GOOGLE_CLIENT_ID=""
ARG VITE_API_BASE_URL="/api/v1"
ARG VITE_CONTENT_VERSION="dev"
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID \
    VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_CONTENT_VERSION=$VITE_CONTENT_VERSION
RUN npm run build

# Serve stage
FROM nginx:stable-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
