#!/bin/bash
# ================================================
# SSL DEBUGGING SCRIPT
# ================================================
# Run this inside your nginx container to debug SSL issues

echo "🔍 SSL Certificate Debugging Report"
echo "=================================="

# Basic system info
echo "📋 System Information:"
echo "User: $(whoami)"
echo "Date: $(date)"
echo "Hostname: $(hostname)"
echo

# Check if nginx user exists
echo "👤 User Information:"
echo "nginx user info:"
id nginx 2>/dev/null || echo "❌ nginx user not found"
echo "Current user groups: $(groups)"
echo

# Check SSL directory
echo "📁 SSL Directory Status:"
if [ -d "/etc/nginx/ssl" ]; then
    echo "✅ /etc/nginx/ssl exists"
    echo "Directory permissions: $(ls -ld /etc/nginx/ssl)"
    echo
    echo "SSL files:"
    ls -la /etc/nginx/ssl/ 2>/dev/null || echo "Directory is empty or inaccessible"
else
    echo "❌ /etc/nginx/ssl does not exist"
fi
echo

# Check Let's Encrypt directory
echo "🔐 Let's Encrypt Directory:"
if [ -d "/etc/letsencrypt" ]; then
    echo "✅ /etc/letsencrypt exists"
    echo "Available domains:"
    ls -la /etc/letsencrypt/live/ 2>/dev/null || echo "No domains found"
else
    echo "❌ /etc/letsencrypt does not exist"
fi
echo

# Test file access as nginx user
echo "🧪 File Access Tests:"
if [ -f "/etc/nginx/ssl/fullchain.pem" ]; then
    echo "Testing fullchain.pem access:"
    echo "  Root access: $(test -r /etc/nginx/ssl/fullchain.pem && echo '✅ OK' || echo '❌ FAIL')"
    echo "  Nginx access: $(su -s /bin/sh nginx -c 'test -r /etc/nginx/ssl/fullchain.pem' 2>/dev/null && echo '✅ OK' || echo '❌ FAIL')"
else
    echo "❌ fullchain.pem not found"
fi

if [ -f "/etc/nginx/ssl/privkey.pem" ]; then
    echo "Testing privkey.pem access:"
    echo "  Root access: $(test -r /etc/nginx/ssl/privkey.pem && echo '✅ OK' || echo '❌ FAIL')"
    echo "  Nginx access: $(su -s /bin/sh nginx -c 'test -r /etc/nginx/ssl/privkey.pem' 2>/dev/null && echo '✅ OK' || echo '❌ FAIL')"
else
    echo "❌ privkey.pem not found"
fi
echo

# Check nginx configuration
echo "🔧 Nginx Configuration:"
echo "Testing nginx config:"
nginx -t 2>&1 || echo "❌ Nginx config test failed"
echo

echo "SSL-related configuration:"
grep -r "ssl_certificate" /etc/nginx/ 2>/dev/null || echo "No SSL configuration found"
echo

# Check processes
echo "🔄 Process Information:"
echo "Running processes:"
ps aux | head -1
ps aux | grep nginx | grep -v grep || echo "No nginx processes found"
echo

# Check environment variables
echo "🌍 Environment Variables:"
echo "SSL-related environment variables:"
env | grep -E "(SSL|CERT|CLOUDFLARE|DOMAIN)" | sort || echo "No SSL-related env vars found"
echo

# Check disk space
echo "💾 Disk Space:"
df -h /etc/nginx/ssl 2>/dev/null || echo "Cannot check disk space"
echo

# Certificate information (if available)
if command -v openssl >/dev/null 2>&1 && [ -f "/etc/nginx/ssl/fullchain.pem" ]; then
    echo "📋 Certificate Information:"
    echo "Certificate details:"
    openssl x509 -in /etc/nginx/ssl/fullchain.pem -text -noout | grep -E "(Subject:|Issuer:|Not Before:|Not After:|DNS:)" 2>/dev/null || echo "Cannot parse certificate"
else
    echo "⚠️  Cannot check certificate details (openssl not available or cert not found)"
fi
echo

echo "🔍 Debug report complete!"
echo "=================================="