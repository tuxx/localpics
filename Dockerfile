# Use Alpine as the base image
FROM alpine:3.19

# Install FFmpeg for thumbnail generation
RUN apk add --no-cache ffmpeg ca-certificates

# Create a non-root user to run the application
RUN adduser -D -H -h /app appuser

# Create directories for the application
RUN mkdir -p /app/thumbnails /data && \
    chown -R appuser:appuser /app /data

# Set working directory
WORKDIR /app

# Copy the pre-built binary (you'll need to build this with 'make build' before building the container)
COPY build/localpics .

# Make sure the binary is executable
RUN chmod +x /app/localpics

# Switch to non-root user
USER appuser

# Expose the default port
EXPOSE 8080

# Set default volume for media files
VOLUME ["/data"]

# Run the application
ENTRYPOINT ["/app/localpics"]
