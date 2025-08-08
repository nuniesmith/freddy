#!/bin/bash
# ================================================
# SSL CERTIFICATE RENEWAL SCRIPT
# ================================================
# File: scripts/renew-certificates.sh

set -e

echo "🔄 Starting SSL certificate renewal check..."

# Environment variables
DOMAIN=${DOMAIN:-"7gram.xyz"}
VENV_PATH="/opt/certbot-venv"
CERTBOT_CMD="${VENV_PATH}/bin/certbot"
SSL_DIR="/etc/nginx/ssl"
LETSENCRYPT_DIR="/etc/letsencrypt"

# Check if virtual environment exists
if [ ! -f "$CERTBOT_CMD" ]; then
    echo "❌ Certbot virtual environment not found at $VENV_PATH"
    echo "🔧 Attempting to recreate virtual environment..."
    
    python3 -m venv $VENV_PATH
    $VENV_PATH/bin/pip install --upgrade pip
    $VENV_PATH/bin/pip install certbot-dns-cloudflare
    
    if [ ! -f "$CERTBOT_CMD" ]; then
        echo "❌ Failed to create certbot virtual environment"
        exit 1
    fi
    
    echo "✅ Certbot virtual environment recreated"
fi

# Validate environment variables
if [ -z "$CLOUDFLARE_EMAIL" ] || [ -z "$CLOUDFLARE_API_KEY" ]; then
    echo "❌ Missing Cloudflare credentials for renewal"
    echo "   CLOUDFLARE_EMAIL and CLOUDFLARE_API_KEY must be set"
    exit 1
fi

# Create Cloudflare credentials file
CLOUDFLARE_CREDS="/tmp/cloudflare-renewal.ini"
cat > $CLOUDFLARE_CREDS << EOF
dns_cloudflare_email = $CLOUDFLARE_EMAIL
dns_cloudflare_api_key = $CLOUDFLARE_API_KEY
EOF

chmod 600 $CLOUDFLARE_CREDS

# Check current certificate status
if [ -f "$SSL_DIR/fullchain.pem" ]; then
    echo "📋 Current certificate status:"
    
    # Check expiration
    EXPIRY_DATE=$(openssl x509 -enddate -noout -in "$SSL_DIR/fullchain.pem" | cut -d= -f2)
    echo "   Expires: $EXPIRY_DATE"
    
    # Check if renewal is needed (less than 30 days)
    if openssl x509 -checkend 2592000 -noout -in "$SSL_DIR/fullchain.pem"; then
        echo "✅ Certificate is valid for more than 30 days. No renewal needed."
        rm -f $CLOUDFLARE_CREDS
        exit 0
    else
        echo "⚠️  Certificate expires within 30 days. Proceeding with renewal..."
    fi
else
    echo "❌ No existing certificate found. Generating new certificate..."
fi

# Attempt certificate renewal
echo "🔄 Renewing SSL certificate..."

$CERTBOT_CMD renew \
    --dns-cloudflare \
    --dns-cloudflare-credentials $CLOUDFLARE_CREDS \
    --dns-cloudflare-propagation-seconds 60 \
    --non-interactive \
    --quiet

# Check renewal result
if [ $? -eq 0 ]; then
    echo "✅ Certificate renewal completed"
    
    # Copy renewed certificates
    CERT_PATH="$LETSENCRYPT_DIR/live/$DOMAIN"
    
    if [ -d "$CERT_PATH" ]; then
        echo "📋 Copying renewed certificates..."
        
        cp "$CERT_PATH/fullchain.pem" "$SSL_DIR/fullchain.pem"
        cp "$CERT_PATH/privkey.pem" "$SSL_DIR/privkey.pem"
        cp "$CERT_PATH/cert.pem" "$SSL_DIR/cert.pem"
        cp "$CERT_PATH/chain.pem" "$SSL_DIR/chain.pem"
        
        # Set proper permissions
        chmod 644 "$SSL_DIR/fullchain.pem" "$SSL_DIR/cert.pem" "$SSL_DIR/chain.pem"
        chmod 600 "$SSL_DIR/privkey.pem"
        
        echo "✅ Renewed certificates copied and permissions set"
        
        # Test nginx configuration
        if nginx -t 2>/dev/null; then
            echo "✅ Nginx configuration is valid"
            
            # Reload nginx to use new certificates
            if nginx -s reload 2>/dev/null; then
                echo "✅ Nginx reloaded successfully"
            else
                echo "⚠️  Failed to reload nginx - manual restart may be required"
            fi
        else
            echo "❌ Nginx configuration test failed - please check configuration"
        fi
        
        # Verify new certificate
        NEW_EXPIRY=$(openssl x509 -enddate -noout -in "$SSL_DIR/fullchain.pem" | cut -d= -f2)
        echo "📋 New certificate expires: $NEW_EXPIRY"
        
    else
        echo "❌ Renewed certificate path not found: $CERT_PATH"
        exit 1
    fi
    
else
    echo "❌ Certificate renewal failed"
    exit 1
fi

# Clean up
rm -f $CLOUDFLARE_CREDS

echo "🎉 Certificate renewal process completed!"

# Log renewal
echo "$(date): Certificate renewed successfully" >> /var/log/cert-renewal.log

exit 0