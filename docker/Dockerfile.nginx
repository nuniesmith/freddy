# ================================================
# NGINX WITH AUTOMATED SSL CERTIFICATE GENERATION
# ================================================
# Custom nginx build with Let's Encrypt + Cloudflare integration
# Generates wildcard certificates during build process

FROM nginx:mainline-alpine

# Build arguments from .env file
ARG CLOUDFLARE_EMAIL
ARG CLOUDFLARE_API_KEY
ARG CERTBOT_EMAIL
ARG DOMAIN=7gram.xyz

# Install required packages for SSL certificate generation
RUN apk add --no-cache \
    python3 \
    py3-pip \
    py3-virtualenv \
    python3-dev \
    gcc \
    musl-dev \
    libffi-dev \
    openssl-dev \
    openssl \
    curl \
    bash

# Create virtual environment and install certbot with cloudflare plugin
# This approach ensures all certbot dependencies are contained
RUN python3 -m venv /opt/certbot-venv \
    && /opt/certbot-venv/bin/pip install --upgrade pip \
    && /opt/certbot-venv/bin/pip install certbot certbot-dns-cloudflare

# Create symlinks for easy access
RUN ln -sf /opt/certbot-venv/bin/certbot /usr/local/bin/certbot \
    && ln -sf /opt/certbot-venv/bin/certbot /usr/local/bin/certbot-cloudflare

# Verify installation
RUN /opt/certbot-venv/bin/certbot --version \
    && /opt/certbot-venv/bin/certbot plugins | grep cloudflare

# Create necessary directories
RUN mkdir -p /etc/nginx/ssl \
    && mkdir -p /etc/letsencrypt \
    && mkdir -p /var/log/letsencrypt

# Copy the certificate generation script
COPY --chown=root:root scripts/docker-letsencrypt.sh /usr/local/bin/docker-letsencrypt.sh
RUN chmod +x /usr/local/bin/docker-letsencrypt.sh

# Generate SSL certificates during build
RUN /usr/local/bin/docker-letsencrypt.sh

# Copy nginx configurations
COPY --chown=root:root config/nginx/nginx.conf /etc/nginx/nginx.conf
COPY --chown=root:root config/nginx/mime.types /etc/nginx/mime.types
COPY --chown=root:root config/nginx/conf.d /etc/nginx/conf.d
COPY --chown=root:root config/nginx/includes /etc/nginx/includes
COPY --chown=root:root config/nginx/html /usr/share/nginx/html
COPY --chown=root:root config/nginx/html/errors /usr/share/nginx/html/errors

# Create certificate renewal script
COPY --chown=root:root scripts/renew-certificates.sh /usr/local/bin/renew-certificates.sh
RUN chmod +x /usr/local/bin/renew-certificates.sh

# Create startup script that can renew certificates
COPY --chown=root:root scripts/nginx-entrypoint.sh /docker-entrypoint.d/99-ssl-check.sh
RUN chmod +x /docker-entrypoint.d/99-ssl-check.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD curl -f http://localhost/health || exit 1

# Labels
LABEL maintainer="7Gram Network"
LABEL description="Nginx with automated Let's Encrypt SSL certificates via Cloudflare DNS"
LABEL version="1.0"

# Expose ports
EXPOSE 80 443

# Use default nginx entrypoint
CMD ["nginx", "-g", "daemon off;"]