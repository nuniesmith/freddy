#!/bin/bash
# ================================================
# NGINX ENTRYPOINT SCRIPT
# ================================================
# This script runs during nginx container startup to check SSL certificates

set -e

echo "🚀 Nginx SSL startup check..."

DOMAIN=${DOMAIN:-"7gram.xyz"}

# Debug: Check current user
echo "🔍 Current user: $(whoami)"
echo "🔍 Nginx user info: $(id nginx 2>/dev/null || echo 'nginx user not found')"

# Check if SSL directory exists
if [ ! -d "/etc/nginx/ssl" ]; then
    echo "❌ SSL directory does not exist, creating..."
    mkdir -p /etc/nginx/ssl
fi

echo "🔍 SSL directory contents:"
ls -la /etc/nginx/ssl/ 2>/dev/null || echo "Directory is empty or inaccessible"

# Check if SSL certificates exist
if [ -f "/etc/nginx/ssl/fullchain.pem" ] && [ -f "/etc/nginx/ssl/privkey.pem" ]; then
    echo "✅ SSL certificates found"
    
    # Show detailed file permissions
    echo "🔍 Current SSL file permissions:"
    ls -la /etc/nginx/ssl/
    
    # Check certificate validity (if openssl is available)
    if command -v openssl >/dev/null 2>&1; then
        if openssl x509 -checkend 2592000 -noout -in /etc/nginx/ssl/fullchain.pem 2>/dev/null; then
            echo "✅ SSL certificate is valid for at least 30 days"
        else
            echo "⚠️  SSL certificate expires within 30 days - consider renewal"
        fi
        
        # Check certificate domain
        CERT_DOMAIN=$(openssl x509 -noout -text -in /etc/nginx/ssl/fullchain.pem 2>/dev/null | grep -A1 "Subject Alternative Name" | grep -o "$DOMAIN" | head -1 || echo "")
        if [ -n "$CERT_DOMAIN" ]; then
            echo "✅ Certificate matches domain: $DOMAIN"
        else
            echo "⚠️  Certificate may not match domain: $DOMAIN"
        fi
    else
        echo "⚠️  OpenSSL not available, skipping certificate validation"
    fi
    
    # Fix file ownership and permissions
    echo "🔧 Fixing SSL certificate ownership and permissions..."
    
    # Ensure nginx user exists
    if ! id nginx >/dev/null 2>&1; then
        echo "❌ nginx user does not exist!"
        exit 1
    fi
    
    # Set ownership to root:nginx (nginx needs read access)
    chown root:nginx /etc/nginx/ssl/*.pem /etc/nginx/ssl/*.crt /etc/nginx/ssl/*.key 2>/dev/null || true
    
    # Set permissions: readable by group (nginx), private key only by owner+group
    chmod 644 /etc/nginx/ssl/fullchain.pem /etc/nginx/ssl/*.crt 2>/dev/null || true
    chmod 640 /etc/nginx/ssl/privkey.pem /etc/nginx/ssl/*.key 2>/dev/null || true
    
    # Verify permissions are correct
    echo "🔍 Fixed SSL file permissions:"
    ls -la /etc/nginx/ssl/
    
    # Test if nginx user can read the files
    echo "🧪 Testing file access for nginx user..."
    if su -s /bin/sh nginx -c "test -r /etc/nginx/ssl/fullchain.pem"; then
        echo "✅ nginx can read certificate file"
    else
        echo "❌ nginx cannot read certificate file"
    fi
    
    if su -s /bin/sh nginx -c "test -r /etc/nginx/ssl/privkey.pem"; then
        echo "✅ nginx can read private key file"
    else
        echo "❌ nginx cannot read private key file"
        echo "🔧 Attempting emergency permission fix..."
        chmod 644 /etc/nginx/ssl/privkey.pem
        if su -s /bin/sh nginx -c "test -r /etc/nginx/ssl/privkey.pem"; then
            echo "✅ Emergency fix worked - nginx can now read private key"
        else
            echo "❌ Emergency fix failed"
        fi
    fi
    
else
    echo "❌ SSL certificates not found in /etc/nginx/ssl/"
    echo "📋 Available files:"
    find /etc/nginx/ssl/ -type f 2>/dev/null || echo "Directory does not exist or is empty"
    
    # Check if certificates exist in Let's Encrypt directory
    if [ -d "/etc/letsencrypt/live/$DOMAIN" ]; then
        echo "🔍 Found certificates in Let's Encrypt directory:"
        ls -la "/etc/letsencrypt/live/$DOMAIN/"
        
        echo "🔧 Copying certificates to nginx directory..."
        cp "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" /etc/nginx/ssl/ 2>/dev/null || echo "Failed to copy fullchain.pem"
        cp "/etc/letsencrypt/live/$DOMAIN/privkey.pem" /etc/nginx/ssl/ 2>/dev/null || echo "Failed to copy privkey.pem"
        
        # Fix permissions after copying
        chown root:nginx /etc/nginx/ssl/*.pem 2>/dev/null || true
        chmod 644 /etc/nginx/ssl/fullchain.pem 2>/dev/null || true
        chmod 640 /etc/nginx/ssl/privkey.pem 2>/dev/null || true
    else
        echo "❌ No certificates found in Let's Encrypt directory either"
        
        # Try to generate certificates if credentials are available
        if [ -n "$CLOUDFLARE_EMAIL" ] && [ -n "$CLOUDFLARE_API_KEY" ] && [ -n "$CERTBOT_EMAIL" ]; then
            echo "🔧 Attempting to generate SSL certificates..."
            if [ -f "/usr/local/bin/docker-letsencrypt.sh" ]; then
                /usr/local/bin/docker-letsencrypt.sh || echo "❌ Certificate generation failed"
            else
                echo "❌ Certificate generation script not found"
            fi
        else
            echo "❌ Cannot generate certificates - missing environment variables"
            echo "Required: CLOUDFLARE_EMAIL, CLOUDFLARE_API_KEY, CERTBOT_EMAIL"
        fi
    fi
fi

# Test nginx configuration
echo "🧪 Testing nginx configuration..."
if nginx -t 2>&1; then
    echo "✅ Nginx configuration is valid"
else
    echo "❌ Nginx configuration has errors"
    
    # Show nginx configuration for debugging
    echo "🔍 Nginx SSL configuration in use:"
    grep -r "ssl_certificate" /etc/nginx/ 2>/dev/null || echo "No SSL configuration found"
    
    # If SSL config fails, try to create a temporary non-SSL config
    echo "🔧 Creating temporary HTTP-only configuration..."
    cat > /etc/nginx/conf.d/temp-http.conf <<'EOF'
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;
    
    location / {
        return 200 'SSL certificates not ready. Container starting in HTTP mode.';
        add_header Content-Type text/plain;
    }
    
    location /health {
        return 200 'OK';
        add_header Content-Type text/plain;
    }
}
EOF
    
    # Disable SSL configs temporarily
    if [ -d "/etc/nginx/conf.d" ]; then
        find /etc/nginx/conf.d -name "*.conf" ! -name "temp-http.conf" -exec mv {} {}.disabled \; 2>/dev/null || true
    fi
    
    echo "🧪 Testing HTTP-only configuration..."
    if nginx -t; then
        echo "✅ HTTP-only configuration is valid"
    else
        echo "❌ Even HTTP-only configuration failed"
    fi
fi

echo "🚀 Nginx SSL startup check complete"