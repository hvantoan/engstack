# syntax=docker/dockerfile:1
FROM golang:1.26-alpine AS builder
WORKDIR /src
RUN apk add --no-cache git ca-certificates
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-w -s" -o /out/api ./cmd/api \
 && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-w -s" -o /out/seed ./cmd/seed

# scratch keeps the image ~28MB: the binaries are already fully static.
FROM scratch
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=builder /out/api /app/bin/api
COPY --from=builder /out/seed /app/bin/seed
USER 10001:10001
EXPOSE 8080
ENTRYPOINT ["/app/bin/api"]
