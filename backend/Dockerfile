# Build stage
FROM golang:1.26-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -o main ./cmd/api

# Run stage
FROM alpine:latest

WORKDIR /app

# Install ca-certificates in case we need to make HTTPS requests
RUN apk --no-cache add ca-certificates tzdata

# Set timezone to Asia/Bangkok
ENV TZ=Asia/Bangkok

# Copy binary from builder
COPY --from=builder /app/main .

# Copy migrations if any exist and need to be accessed
COPY --from=builder /app/migrations ./migrations

# Expose port (must match PORT env)
EXPOSE 8080

# Command to run
CMD ["./main"]
