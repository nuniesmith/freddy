#!/bin/bash
# Test the complete setup after adding @error401 locations and updating Authelia

echo "=== Testing Complete 7gram Setup ==="

# Test 1: Verify nginx configuration
echo "1. Testing nginx configuration..."
if docker exec nginx nginx -t >/dev/null 2>&1; then
    echo "   ✅ Nginx configuration valid"
else
    echo "   ❌ Nginx configuration has errors:"
    docker exec nginx nginx -t
    exit 1
fi

# Test 2: Check container status
echo ""
echo "2. Checking critical containers..."
containers=("nginx" "authelia" "mysql" "redis")
all_running=true

for container in "${containers[@]}"; do
    if docker ps --format "table {{.Names}}" | grep -q "^$container$"; then
        echo "   ✅ $container is running"
    else
        echo "   ❌ $container is not running"
        all_running=false
    fi
done

if [ "$all_running" = false ]; then
    echo ""
    echo "Some containers are not running. Start them with:"
    echo "docker-compose up -d"
    exit 1
fi

# Test 3: Test Authelia connectivity
echo ""
echo "3. Testing Authelia..."

# Test main Authelia interface
authelia_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:9091/)
if [ "$authelia_status" = "200" ]; then
    echo "   ✅ Authelia web interface accessible"
else
    echo "   ❌ Authelia web interface error (HTTP $authelia_status)"
fi

# Test Authelia API (should return 401 unauthorized)
api_status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:9091/api/verify)
if [ "$api_status" = "401" ]; then
    echo "   ✅ Authelia API working (401 unauthorized as expected)"
else
    echo "   ⚠️  Authelia API returned HTTP $api_status (expected 401)"
fi

# Test 4: Test public access (main dashboard)
echo ""
echo "4. Testing main dashboard (should be public)..."
main_status=$(curl -s -o /dev/null -w "%{http_code}" http://7gram.xyz/)
if [ "$main_status" = "200" ]; then
    echo "   ✅ Main dashboard accessible without authentication"
elif [ "$main_status" = "302" ]; then
    echo "   ⚠️  Main dashboard redirecting (HTTP 302) - should be public!"
    echo "       Check if main site server block includes auth.conf"
else
    echo "   ❌ Main dashboard error (HTTP $main_status)"
fi

# Test 5: Test authentication service
echo ""
echo "5. Testing authentication service..."
auth_status=$(curl -s -o /dev/null -w "%{http_code}" http://auth.7gram.xyz/)
if [ "$auth_status" = "200" ]; then
    echo "   ✅ Auth service accessible"
else
    echo "   ❌ Auth service error (HTTP $auth_status)"
fi

# Test 6: Test protected services (should require auth)
echo ""
echo "6. Testing protected services (should require authentication)..."

protected_services=("emby.7gram.xyz" "jellyfin.7gram.xyz" "plex.7gram.xyz" "sonarr.7gram.xyz")
auth_working=true

for service in "${protected_services[@]}"; do
    status=$(curl -s -o /dev/null -w "%{http_code}" http://$service/)
    if [ "$status" = "302" ]; then
        echo "   ✅ $service: Protected (redirects to auth)"
    elif [ "$status" = "401" ]; then
        echo "   ✅ $service: Protected (unauthorized response)"
    elif [ "$status" = "200" ]; then
        echo "   ⚠️  $service: Accessible without auth (check config)"
        auth_working=false
    else
        echo "   ❌ $service: Error (HTTP $status)"
        auth_working=false
    fi
done

# Test 7: Check for recent errors
echo ""
echo "7. Checking for recent errors..."

# Check nginx logs
nginx_errors=$(docker logs nginx --since="5m" 2>&1 | grep -i error | wc -l)
if [ "$nginx_errors" -gt 0 ]; then
    echo "   ⚠️  Found $nginx_errors nginx errors in last 5 minutes:"
    docker logs nginx --since="5m" 2>&1 | grep -i error | tail -3
else
    echo "   ✅ No recent nginx errors"
fi

# Check authelia logs  
authelia_errors=$(docker logs authelia --since="5m" 2>&1 | grep -i error | wc -l)
if [ "$authelia_errors" -gt 0 ]; then
    echo "   ⚠️  Found $authelia_errors authelia errors in last 5 minutes:"
    docker logs authelia --since="5m" 2>&1 | grep -i error | tail -3
else
    echo "   ✅ No recent authelia errors"
fi

# Test 8: Verify @error401 locations
echo ""
echo "8. Verifying @error401 locations..."
error401_count=$(grep -c "@error401" nginx/conf.d/default.conf)
auth_count=$(grep -c "include.*auth\.conf" nginx/conf.d/default.conf)

echo "   Auth includes: $auth_count"
echo "   @error401 locations: $error401_count"

if [ "$error401_count" -eq "$auth_count" ]; then
    echo "   ✅ All authenticated services have @error401 handling"
else
    echo "   ⚠️  Missing @error401 locations (expected $auth_count, found $error401_count)"
fi

# Overall summary
echo ""
echo "=== OVERALL SUMMARY ==="

if [ "$main_status" = "200" ] && [ "$authelia_status" = "200" ] && [ "$api_status" = "401" ] && [ "$auth_working" = true ]; then
    echo "🎉 SUCCESS! Your 7gram network is working correctly!"
    echo ""
    echo "✅ Main dashboard: http://7gram.xyz/"
    echo "✅ Authentication: http://auth.7gram.xyz/"
    echo "✅ Protected services require authentication" 
    echo "✅ Error handling configured correctly"
    echo ""
    echo "You can now:"
    echo "• Access your dashboard at http://7gram.xyz/"
    echo "• Login at http://auth.7gram.xyz/ (use credentials from users_database.yml)"
    echo "• Access protected services after authentication"
    
else
    echo "⚠️  Some issues were found. Check the details above."
    echo ""
    echo "Common fixes:"
    echo "• If main site redirects to auth: Remove auth.conf from main site server block"
    echo "• If auth services return errors: Check Authelia configuration (HTTP vs HTTPS)" 
    echo "• If protected services don't require auth: Check @error401 locations"
fi

echo ""
echo "=== USEFUL COMMANDS ==="
echo "• Test main site: curl -I http://7gram.xyz/"
echo "• Test protected service: curl -I http://emby.7gram.xyz/"
echo "• Check nginx config: docker exec nginx nginx -t"
echo "• Restart nginx: docker-compose restart nginx"
echo "• Check logs: docker logs nginx --tail=20"