// sw.js - Service Worker for 7Gram Dashboard PWA
// Provides offline support, caching, and enhanced performance

const VERSION = '2.1.0';
const CACHE_NAME = `7gram-dashboard-v${VERSION}`;
const STATIC_CACHE_NAME = `7gram-static-v${VERSION}`;
const API_CACHE_NAME = `7gram-api-v${VERSION}`;
const IMAGE_CACHE_NAME = `7gram-images-v${VERSION}`;

// Core files that are essential for offline functionality
const CORE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Static assets that should be cached (only confirmed existing files)
const STATIC_ASSETS = [
  '/assets/css/main.css',
  '/assets/css/components.css',
  '/assets/css/themes/default.css',
  '/assets/css/themes/dark.css',
  '/assets/js/main.js',
  '/assets/js/modules/serviceLoader.js',
  '/assets/js/modules/searchManager.js',
  '/assets/js/modules/themeManager.js',
  '/assets/js/modules/componentLoader.js',
  '/assets/js/modules/healthChecker.js'
];

// Configuration files that change frequently
const CONFIG_ASSETS = [
  '/config/dashboard.json',
  '/config/services.json',
  '/config/themes.json'
];

// Cache-first strategy for these file types
const CACHE_FIRST_PATTERNS = [
  /\.(?:png|jpg|jpeg|gif|svg|webp|ico|avif)$/i,
  /\.(?:css|js)$/i,
  /\.(?:woff|woff2|ttf|eot|otf)$/i,
  /\/assets\//,
  /\/icons\//
];

// Network-first strategy for API calls and dynamic content
const NETWORK_FIRST_PATTERNS = [
  /\/api\//,
  /\/health/,
  /\/config\//,
  /\.json$/,
  /\/discover/,
  /\/dynamic/
];

// Files to never cache
const NEVER_CACHE_PATTERNS = [
  /\/sw\.js$/,
  /\/admin/,
  /\/debug/,
  /chrome-extension:/,
  /moz-extension:/
];

// Network timeout in milliseconds
const NETWORK_TIMEOUT = 8000;

// Install event - cache essential assets
self.addEventListener('install', event => {
  console.log('🔧 Service Worker: Installing version', VERSION);
  
  event.waitUntil(
    Promise.all([
      // Cache core assets first
      cacheAssets(STATIC_CACHE_NAME, [...CORE_ASSETS, ...STATIC_ASSETS]),
      // Cache config files separately
      cacheAssets(API_CACHE_NAME, CONFIG_ASSETS)
    ]).then(() => {
      console.log('✅ Service Worker: Installation complete');
      return self.skipWaiting(); // Force activation
    }).catch(error => {
      console.error('❌ Service Worker installation failed:', error);
      throw error;
    })
  );
});

// Activate event - clean up old caches and take control
self.addEventListener('activate', event => {
  console.log('🚀 Service Worker: Activating version', VERSION);
  
  event.waitUntil(
    Promise.all([
      // Clean up old caches
      cleanupOldCaches(),
      // Take control of all clients immediately
      self.clients.claim()
    ]).then(() => {
      console.log('✅ Service Worker: Activation complete');
      // Notify clients about the new service worker
      notifyClients('SW_ACTIVATED', { version: VERSION });
    }).catch(error => {
      console.error('❌ Service Worker activation failed:', error);
    })
  );
});

// Fetch event - implement smart caching strategies
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip non-HTTP(S) requests
  if (!url.protocol.startsWith('http')) {
    return;
  }
  
  // Skip external requests unless explicitly allowed
  if (url.origin !== location.origin) {
    return;
  }
  
  // Skip never-cache patterns
  if (NEVER_CACHE_PATTERNS.some(pattern => pattern.test(url.pathname))) {
    return;
  }
  
  event.respondWith(handleRequest(request));
});

// Cache assets with individual error handling
async function cacheAssets(cacheName, assets) {
  console.log(`📦 Caching ${assets.length} assets to ${cacheName}...`);
  
  try {
    const cache = await caches.open(cacheName);
    const results = await Promise.allSettled(
      assets.map(async (asset) => {
        try {
          // Create request with cache-busting for fresh content
          const request = new Request(asset, { cache: 'reload' });
          const response = await fetch(request);
          
          if (response.ok) {
            await cache.put(asset, response);
            console.log(`✅ Cached: ${asset}`);
          } else {
            console.warn(`⚠️ Failed to cache ${asset}: HTTP ${response.status}`);
          }
        } catch (error) {
          console.warn(`⚠️ Failed to cache ${asset}:`, error.message);
        }
      })
    );
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    console.log(`📦 Successfully cached ${successful}/${assets.length} assets`);
    
  } catch (error) {
    console.error(`❌ Failed to open cache ${cacheName}:`, error);
    throw error;
  }
}

// Clean up old caches
async function cleanupOldCaches() {
  try {
    const cacheNames = await caches.keys();
    const currentCaches = [CACHE_NAME, STATIC_CACHE_NAME, API_CACHE_NAME, IMAGE_CACHE_NAME];
    
    const deletePromises = cacheNames
      .filter(cacheName => !currentCaches.includes(cacheName))
      .map(cacheName => {
        console.log('🗑️ Deleting old cache:', cacheName);
        return caches.delete(cacheName);
      });
    
    await Promise.all(deletePromises);
    console.log('🧹 Cache cleanup complete');
    
  } catch (error) {
    console.error('❌ Failed to cleanup old caches:', error);
  }
}

// Main request handler with smart routing
async function handleRequest(request) {
  const url = new URL(request.url);
  
  try {
    // Route to appropriate strategy based on URL patterns
    if (NETWORK_FIRST_PATTERNS.some(pattern => pattern.test(url.pathname))) {
      return await networkFirstStrategy(request);
    }
    
    if (CACHE_FIRST_PATTERNS.some(pattern => pattern.test(url.pathname))) {
      return await cacheFirstStrategy(request);
    }
    
    // HTML pages - stale while revalidate
    if (request.headers.get('accept')?.includes('text/html')) {
      return await staleWhileRevalidateStrategy(request);
    }
    
    // Images - cache with fallback
    if (url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico|avif)$/i)) {
      return await cacheFirstStrategy(request, IMAGE_CACHE_NAME);
    }
    
    // Default to network first with cache fallback
    return await networkFirstStrategy(request);
    
  } catch (error) {
    console.warn('⚠️ Request handling failed for', url.pathname, ':', error.message);
    return await handleRequestError(request, error);
  }
}

// Cache-first strategy for static assets
async function cacheFirstStrategy(request, cacheNameOverride = STATIC_CACHE_NAME) {
  try {
    const cache = await caches.open(cacheNameOverride);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      // Serve from cache, update in background if stale
      const cacheDate = new Date(cachedResponse.headers.get('date') || 0);
      const isStale = Date.now() - cacheDate.getTime() > 24 * 60 * 60 * 1000; // 24 hours
      
      if (isStale) {
        fetchAndUpdateCache(request, cache).catch(error => {
          console.debug('Background update failed:', error.message);
        });
      }
      
      return cachedResponse;
    }
    
    // Not in cache, fetch from network
    const networkResponse = await fetchWithTimeout(request);
    
    if (networkResponse.ok) {
      // Clone before caching because response can only be used once
      const responseToCache = networkResponse.clone();
      await cache.put(request, responseToCache);
    }
    
    return networkResponse;
    
  } catch (error) {
    console.warn('⚠️ Cache-first strategy failed:', error.message);
    throw error;
  }
}

// Network-first strategy for dynamic content
async function networkFirstStrategy(request) {
  try {
    // Try network first with timeout
    const networkResponse = await fetchWithTimeout(request);
    
    if (networkResponse.ok) {
      // Cache successful responses for offline fallback
      const shouldCache = request.url.includes('/config/') || 
                         request.url.includes('/api/') ||
                         request.url.includes('/health');
      
      if (shouldCache) {
        const cache = await caches.open(API_CACHE_NAME);
        const responseToCache = networkResponse.clone();
        await cache.put(request, responseToCache);
      }
    }
    
    return networkResponse;
    
  } catch (error) {
    console.log('🔄 Network failed, trying cache for:', request.url);
    
    // Network failed, try cache
    const cache = await caches.open(API_CACHE_NAME);
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('📦 Served from cache:', request.url);
      // Add header to indicate this is from cache
      const response = cachedResponse.clone();
      response.headers.set('X-Served-By', 'ServiceWorker-Cache');
      return response;
    }
    
    throw error;
  }
}

// Stale while revalidate for HTML pages
async function staleWhileRevalidateStrategy(request) {
  const cache = await caches.open(STATIC_CACHE_NAME);
  
  // Start fetch in background (don't await)
  const networkPromise = fetchWithTimeout(request)
    .then(networkResponse => {
      if (networkResponse.ok) {
        const responseToCache = networkResponse.clone();
        cache.put(request, responseToCache);
      }
      return networkResponse;
    })
    .catch(error => {
      console.debug('Background fetch failed for', request.url, ':', error.message);
    });
  
  // Try to serve from cache first
  const cachedResponse = await cache.match(request);
  
  if (cachedResponse) {
    // Return cached version immediately
    return cachedResponse;
  }
  
  // No cache available, wait for network
  try {
    return await networkPromise;
  } catch (error) {
    // Both cache and network failed
    throw error;
  }
}

// Fetch with timeout
async function fetchWithTimeout(request, timeout = NETWORK_TIMEOUT) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(request, {
      signal: controller.signal,
      headers: {
        ...request.headers,
        'Cache-Control': 'no-cache' // Ensure fresh content
      }
    });
    
    clearTimeout(timeoutId);
    return response;
    
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error.name === 'AbortError') {
      throw new Error(`Network timeout (${timeout}ms) for ${request.url}`);
    }
    
    throw error;
  }
}

// Background fetch and cache update
async function fetchAndUpdateCache(request, cache) {
  try {
    const response = await fetchWithTimeout(request);
    if (response.ok) {
      const responseToCache = response.clone();
      await cache.put(request, responseToCache);
      console.debug('🔄 Background cache update successful for:', request.url);
    }
  } catch (error) {
    console.debug('⚠️ Background cache update failed:', error.message);
  }
}

// Handle request errors with appropriate fallbacks
async function handleRequestError(request, error) {
  const url = new URL(request.url);
  
  console.warn(`⚠️ Request failed for ${url.pathname}:`, error.message);
  
  // Try to serve from any available cache
  const cacheNames = [STATIC_CACHE_NAME, API_CACHE_NAME, CACHE_NAME, IMAGE_CACHE_NAME];
  
  for (const cacheName of cacheNames) {
    try {
      const cache = await caches.open(cacheName);
      const cachedResponse = await cache.match(request);
      
      if (cachedResponse) {
        console.log(`📦 Fallback: Served ${url.pathname} from ${cacheName}`);
        return cachedResponse;
      }
    } catch (cacheError) {
      console.debug(`Cache ${cacheName} not available:`, cacheError.message);
    }
  }
  
  // Return appropriate error response based on request type
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    return createOfflinePage();
  }
  
  if (url.pathname.match(/\.(css|js)$/)) {
    return createAssetFallback(url.pathname);
  }
  
  if (url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)$/)) {
    return createImageFallback();
  }
  
  // Default error response
  return new Response(
    JSON.stringify({ 
      error: 'Service Unavailable', 
      message: 'This content is not available offline',
      timestamp: new Date().toISOString(),
      url: request.url
    }), 
    { 
      status: 503, 
      statusText: 'Service Unavailable',
      headers: { 
        'Content-Type': 'application/json',
        'X-Served-By': 'ServiceWorker-Fallback'
      }
    }
  );
}

// Create enhanced offline page
function createOfflinePage() {
  return new Response(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>7Gram Dashboard - Offline</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
          }
          
          .container {
            background: rgba(255, 255, 255, 0.1);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 20px;
            padding: 2rem;
            text-align: center;
            max-width: 500px;
            width: 100%;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
          }
          
          h1 { font-size: 2.5rem; margin-bottom: 0.5rem; font-weight: 700; }
          h2 { font-size: 1.5rem; margin-bottom: 1.5rem; opacity: 0.9; }
          p { font-size: 1.1rem; line-height: 1.6; margin-bottom: 1rem; opacity: 0.8; }
          
          .buttons { display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap; margin: 2rem 0; }
          
          .button {
            background: rgba(255, 255, 255, 0.2);
            border: 2px solid rgba(255, 255, 255, 0.3);
            color: white;
            padding: 0.75rem 1.5rem;
            border-radius: 50px;
            text-decoration: none;
            font-size: 1rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.3s ease;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
          }
          
          .button:hover {
            background: rgba(255, 255, 255, 0.3);
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
          }
          
          .status {
            margin-top: 2rem;
            padding: 1rem;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 10px;
            font-size: 0.9rem;
          }
          
          .status-online { color: #4ade80; }
          .status-offline { color: #f87171; }
          .status-checking { color: #fbbf24; }
          
          .cached-content {
            margin-top: 2rem;
            padding: 1rem;
            background: rgba(255, 255, 255, 0.05);
            border-radius: 10px;
            font-size: 0.9rem;
          }
          
          .service-link {
            display: block;
            margin: 0.5rem 0;
            padding: 0.5rem;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 8px;
            color: white;
            text-decoration: none;
            transition: background 0.3s ease;
          }
          
          .service-link:hover {
            background: rgba(255, 255, 255, 0.2);
          }
          
          @media (max-width: 480px) {
            .container { padding: 1.5rem; }
            h1 { font-size: 2rem; }
            .buttons { flex-direction: column; }
            .button { justify-content: center; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🏠 7Gram Dashboard</h1>
          <h2>📡 You're Offline</h2>
          <p>Some features are not available while offline, but cached content will continue to work.</p>
          
          <div class="buttons">
            <button class="button" onclick="location.reload()">
              <span>🔄</span> Try Again
            </button>
            <a href="/" class="button">
              <span>🏠</span> Dashboard
            </a>
          </div>
          
          <div class="status">
            <div id="connection-status" class="status-offline">
              🔴 Offline
            </div>
          </div>
          
          <div class="cached-content">
            <strong>🗃️ Available Offline:</strong>
            <a href="/" class="service-link">🏠 Dashboard Home</a>
            <a href="/config/services.json" class="service-link">⚙️ Services Config</a>
          </div>
        </div>
        
        <script>
          let retryCount = 0;
          const maxRetries = 5;
          
          function updateConnectionStatus() {
            const status = document.getElementById('connection-status');
            
            if (navigator.onLine) {
              status.className = 'status-checking';
              status.innerHTML = '🟡 Checking connection...';
              
              // Verify actual connectivity
              fetch('/?_sw_test=' + Date.now(), { 
                method: 'HEAD', 
                cache: 'no-cache',
                signal: AbortSignal.timeout(5000)
              })
              .then(response => {
                if (response.ok) {
                  status.className = 'status-online';
                  status.innerHTML = '🟢 Back online - Reloading...';
                  setTimeout(() => location.reload(), 1000);
                } else {
                  throw new Error('Server not responding');
                }
              })
              .catch(() => {
                status.className = 'status-offline';
                status.innerHTML = '🔴 Still offline';
              });
            } else {
              status.className = 'status-offline';
              status.innerHTML = '🔴 No internet connection';
            }
          }
          
          function periodicCheck() {
            if (retryCount < maxRetries && navigator.onLine) {
              retryCount++;
              updateConnectionStatus();
            }
          }
          
          // Event listeners
          window.addEventListener('online', () => {
            retryCount = 0;
            updateConnectionStatus();
          });
          
          window.addEventListener('offline', updateConnectionStatus);
          
          // Initial check
          updateConnectionStatus();
          
          // Periodic connectivity check
          setInterval(periodicCheck, 15000);
        </script>
      </body>
    </html>
  `, {
    headers: { 
      'Content-Type': 'text/html',
      'Cache-Control': 'no-cache',
      'X-Served-By': 'ServiceWorker-Offline'
    }
  });
}

// Create fallback for missing CSS/JS assets
function createAssetFallback(pathname) {
  const isCSS = pathname.endsWith('.css');
  const content = isCSS ? '/* Asset not available offline */' : '// Asset not available offline';
  const contentType = isCSS ? 'text/css' : 'application/javascript';
  
  return new Response(content, {
    headers: { 
      'Content-Type': contentType,
      'X-Served-By': 'ServiceWorker-Fallback'
    }
  });
}

// Create fallback for missing images
function createImageFallback() {
  // Simple 1x1 transparent PNG
  const imageData = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  return new Response(Uint8Array.from(atob(imageData), c => c.charCodeAt(0)), {
    headers: { 
      'Content-Type': 'image/png',
      'X-Served-By': 'ServiceWorker-Fallback'
    }
  });
}

// Message handling for cache management and communication
self.addEventListener('message', event => {
  if (event.data && event.data.type) {
    handleMessage(event.data, event);
  }
});

async function handleMessage(data, event) {
  try {
    switch (data.type) {
      case 'SKIP_WAITING':
        await self.skipWaiting();
        break;
        
      case 'GET_VERSION':
        event.ports[0]?.postMessage({
          version: VERSION,
          caches: [STATIC_CACHE_NAME, API_CACHE_NAME, IMAGE_CACHE_NAME],
          timestamp: Date.now()
        });
        break;
        
      case 'CLEAR_CACHE':
        await clearAllCaches();
        event.ports[0]?.postMessage({ success: true });
        break;
        
      case 'CACHE_STATS':
        const stats = await getCacheStats();
        event.ports[0]?.postMessage(stats);
        break;
        
      case 'FORCE_UPDATE':
        await forceUpdateCache();
        event.ports[0]?.postMessage({ success: true });
        break;
        
      default:
        console.warn('⚠️ Unknown message type:', data.type);
    }
  } catch (error) {
    console.error('❌ Message handling failed:', error);
    event.ports[0]?.postMessage({ error: error.message });
  }
}

// Get cache statistics
async function getCacheStats() {
  try {
    const cacheNames = await caches.keys();
    const stats = {};
    
    for (const cacheName of cacheNames) {
      const cache = await caches.open(cacheName);
      const keys = await cache.keys();
      stats[cacheName] = {
        count: keys.length,
        urls: keys.map(req => req.url)
      };
    }
    
    return {
      version: VERSION,
      caches: stats,
      totalCaches: cacheNames.length,
      timestamp: Date.now()
    };
  } catch (error) {
    return { error: error.message };
  }
}

// Force cache update
async function forceUpdateCache() {
  console.log('🔄 Force updating cache...');
  await clearAllCaches();
  await cacheAssets(STATIC_CACHE_NAME, [...CORE_ASSETS, ...STATIC_ASSETS]);
  await cacheAssets(API_CACHE_NAME, CONFIG_ASSETS);
  console.log('✅ Cache force update complete');
}

// Clear all caches
async function clearAllCaches() {
  try {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
    console.log('🗑️ All caches cleared');
  } catch (error) {
    console.error('❌ Failed to clear caches:', error);
    throw error;
  }
}

// Notify all clients about service worker events
async function notifyClients(type, data = {}) {
  try {
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({ type, ...data });
    });
  } catch (error) {
    console.warn('⚠️ Failed to notify clients:', error);
  }
}

// Startup logging
console.log('🚀 7Gram Dashboard Service Worker loaded');
console.log('📦 Cache version:', CACHE_NAME);
console.log('🔧 Features: Offline support, Smart caching, Error recovery, Performance optimization');
console.log('⚡ Network timeout:', NETWORK_TIMEOUT + 'ms');
console.log('🎯 Cache strategies: Cache-first for static, Network-first for dynamic, SWR for HTML');