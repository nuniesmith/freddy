#!/bin/bash
# ================================================
# DOCKER LET'S ENCRYPT CERTIFICATE GENERATION
# ================================================
# Modified version for Docker build context with Cloudflare DNS

set -e  # Exit on any error

echo "🚀 Starting Let's Encrypt certificate generation for Docker..."

# Validate required environment variables
if [ -z "$CLOUDFLARE_EMAIL" ] || [ -z "$CLOUDFLARE_API_KEY" ] || [ -z "$CERTBOT_EMAIL" ]; then
    echo "❌ Error: Required environment variables not set!"
    echo "Required: CLOUDFLARE_EMAIL, CLOUDFLARE_API_KEY, CERTBOT_EMAIL"
    exit 1
fi

# Set domain (default to 7gram.xyz)
DOMAIN=${DOMAIN:-"7gram.xyz"}

echo "📧 Using email: $CERTBOT_EMAIL"
echo "🌐 Domain: $DOMAIN"
echo "☁️  Cloudflare email: $CLOUDFLARE_EMAIL"

# Create Cloudflare credentials file
echo "🔐 Creating Cloudflare DNS credentials..."
cat > /etc/letsencrypt/cloudflare.ini <<EOF
# Cloudflare API credentials for DNS challenge
dns_cloudflare_email = $CLOUDFLARE_EMAIL
dns_cloudflare_api_key = $CLOUDFLARE_API_KEY
EOF

# Secure the credentials file
chmod 600 /etc/letsencrypt/cloudflare.ini

echo "🔍 Testing Cloudflare API connection..."
# Test API connection
API_TEST=$(curl -s -H "X-Auth-Email: $CLOUDFLARE_EMAIL" -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
    "https://api.cloudflare.com/client/v4/user/tokens/verify" | grep -o '"success":true' || echo "")

if [ -z "$API_TEST" ]; then
    echo "⚠️  Warning: Could not verify Cloudflare API connection"
    echo "⚠️  Proceeding anyway - check your credentials if certificate generation fails"
else
    echo "✅ Cloudflare API connection verified"
fi

# Generate wildcard certificate using Cloudflare DNS challenge
# IMPORTANT: Use the certbot from virtual environment that has the cloudflare plugin
echo "🔒 Generating wildcard certificate for $DOMAIN..."
/opt/certbot-venv/bin/certbot certonly \
    --dns-cloudflare \
    --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
    --dns-cloudflare-propagation-seconds 60 \
    -d "$DOMAIN" \
    -d "*.$DOMAIN" \
    --agree-tos \
    --email "$CERTBOT_EMAIL" \
    --non-interactive \
    --keep-until-expiring \
    --expand

# Check if certificates were generated
if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    echo "❌ Certificate generation failed!"
    echo "🔍 Debug info:"
    ls -la /etc/letsencrypt/live/ || echo "No certificates directory found"
    echo "🔍 Checking certbot installation:"
    /opt/certbot-venv/bin/certbot --version
    /opt/certbot-venv/bin/pip list | grep certbot
    exit 1
fi

echo "✅ Certificates generated successfully!"

# Copy certificates to nginx SSL directory with multiple formats
echo "📋 Copying certificates to /etc/nginx/ssl/..."

# Copy with original Let's Encrypt names
cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" /etc/nginx/ssl/
cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" /etc/nginx/ssl/

# Copy with nginx-friendly names
cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" "/etc/nginx/ssl/$DOMAIN.crt"
cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" "/etc/nginx/ssl/$DOMAIN.key"

# Copy intermediate certificates as well
cp "/etc/letsencrypt/live/$DOMAIN/chain.pem" /etc/nginx/ssl/ 2>/dev/null || echo "No chain.pem found (not critical)"
cp "/etc/letsencrypt/live/$DOMAIN/cert.pem" /etc/nginx/ssl/ 2>/dev/null || echo "No cert.pem found (not critical)"

# Set proper ownership and permissions immediately
echo "🔧 Setting proper ownership and permissions..."
# Ensure nginx group exists during build
if ! getent group nginx >/dev/null 2>&1; then
    echo "Creating nginx group..."
    addgroup -g 101 nginx
fi
if ! getent passwd nginx >/dev/null 2>&1; then
    echo "Creating nginx user..."
    adduser -D -g nginx -u 101 nginx
fi

# Set ownership to root:nginx and proper permissions
chown root:nginx /etc/nginx/ssl/*.pem /etc/nginx/ssl/*.crt /etc/nginx/ssl/*.key 2>/dev/null || true
chmod 644 /etc/nginx/ssl/fullchain.pem /etc/nginx/ssl/*.crt 2>/dev/null || true
chmod 640 /etc/nginx/ssl/privkey.pem /etc/nginx/ssl/*.key 2>/dev/null || true

echo "📋 Certificate files created:"
ls -la /etc/nginx/ssl/

# Create certificate info file for reference
cat > /etc/nginx/ssl/cert-info.txt <<EOF
Certificate Information
======================
Domain: $DOMAIN
Generated: $(date)
Expires: $(date -d "+90 days")
Files:
- fullchain.pem (full certificate chain)
- privkey.pem (private key)
- $DOMAIN.crt (certificate chain - nginx format)
- $DOMAIN.key (private key - nginx format)

Let's Encrypt Certificate Path: /etc/letsencrypt/live/$DOMAIN/
Cloudflare API Email: $CLOUDFLARE_EMAIL
Certificate Email: $CERTBOT_EMAIL
EOF

echo "📄 Certificate info saved to /etc/nginx/ssl/cert-info.txt"

# Test certificate validity
echo "🧪 Testing certificate validity..."
openssl x509 -in /etc/nginx/ssl/fullchain.pem -text -noout | grep -E "Subject:|Issuer:|Not After" || echo "Could not parse certificate details"

echo "✅ Docker SSL certificate generation complete!"
echo ""
echo "📋 Available certificate formats in /etc/nginx/ssl/:"
echo "  • fullchain.pem & privkey.pem (Let's Encrypt format)"
echo "  • $DOMAIN.crt & $DOMAIN.key (nginx format)"
echo ""
echo "🔧 Use in nginx.conf:"
echo "  ssl_certificate /etc/nginx/ssl/fullchain.pem;"
echo "  ssl_certificate_key /etc/nginx/ssl/privkey.pem;"
echo ""