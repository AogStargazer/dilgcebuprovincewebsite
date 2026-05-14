// Import configuration
try {
    importScripts('/assets/js/standalone-config.js');
} catch (error) {
    console.warn('Service Worker: Failed to load standalone-config.js, using fallback configuration:', error);
}

// Get configuration with fallback defaults
const config = self.StandaloneConfig || {
    cache: {
        names: {
            critical: 'image-cache-critical-v1',
            dynamic: 'image-cache-dynamic-v1',
            fallback: 'image-cache-fallback-v1'
        },
        criticalImages: ['images/placeholder.svg', 'images/error.svg'],
        maxDynamicSize: 100,
        maxAgeMs: 7 * 24 * 60 * 60 * 1000,
        staleWhileRevalidateAgeMs: 24 * 60 * 60 * 1000,
        retryConfig: { maxRetries: 3, baseDelay: 1000, maxDelay: 10000 },
        networkTimeout: { 'slow-2g': 20000, '2g': 15000, '3g': 10000, '4g': 8000, 'default': 8000 },
        skipPrecache: false
    },
    basePath: '',
    imageDir: 'images/',
    getCriticalImagePaths: function() {
        return this.cache.criticalImages.map(imageName => this.basePath + this.imageDir + imageName);
    }
};

// Configuration constants derived from StandaloneConfig
const CACHE_CONFIG = {
    CRITICAL: config.cache.names.critical,
    DYNAMIC: config.cache.names.dynamic,
    FALLBACK: config.cache.names.fallback
};

const CACHE_STRATEGIES = {
    CRITICAL_IMAGES: config.getCriticalImagePaths ? config.getCriticalImagePaths() : config.cache.criticalImages,
    MAX_DYNAMIC_SIZE: config.cache.maxDynamicSize,
    MAX_AGE_MS: config.cache.maxAgeMs,
    STALE_WHILE_REVALIDATE_AGE_MS: config.cache.staleWhileRevalidateAgeMs,
    RETRY_CONFIG: config.cache.retryConfig,
    NETWORK_TIMEOUT: config.cache.networkTimeout
};

// Install event - pre-cache critical images
self.addEventListener('install', event => {
    console.log('Service Worker: Installing...');
    
    // Check if precaching should be skipped
    if (config.cache.skipPrecache) {
        console.log('Service Worker: Skipping precache as configured');
        event.waitUntil(self.skipWaiting());
        return;
    }
    
    event.waitUntil(
        caches.open(CACHE_CONFIG.CRITICAL)
            .then(cache => {
                console.log('Service Worker: Caching critical images');
                return cache.addAll(CACHE_STRATEGIES.CRITICAL_IMAGES.map(url => new Request(url, { cache: 'reload' })));
            })
            .then(() => {
                console.log('Service Worker: Critical images cached');
                return self.skipWaiting();
            })
            .catch(error => {
                console.error('Service Worker: Failed to cache critical images:', error);
            })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', event => {
    console.log('Service Worker: Activating...');
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                const currentCaches = new Set(Object.values(CACHE_CONFIG));
                return Promise.all(
                    cacheNames.map(cacheName => {
                        // Delete old image caches (anything that's not the current version)
                        if (cacheName.startsWith('image-cache-') && !currentCaches.has(cacheName)) {
                            console.log('Service Worker: Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                        return Promise.resolve(false);
                    })
                );
            })
            .then(() => {
                console.log('Service Worker: Old caches cleaned up');
                return self.clients.claim();
            })
            .then(() => {
                // Schedule periodic maintenance
                setInterval(performMaintenance, 30 * 60 * 1000); // Every 30 minutes
            })
    );
});

// Fetch event - handle image requests
self.addEventListener('fetch', event => {
    // Only handle image requests
    if (event.request.destination === 'image') {
        event.respondWith(handleImageRequest(event.request));
    }
});

// Core utility functions
function getNetworkInfo() {
    if ('connection' in navigator && navigator.connection) {
        return {
            effectiveType: navigator.connection.effectiveType || '4g',
            downlink: navigator.connection.downlink || 10,
            rtt: navigator.connection.rtt || 100
        };
    }
    return { effectiveType: '4g', downlink: 10, rtt: 100 };
}

async function adaptiveImageFetch(request) {
    const networkInfo = getNetworkInfo();
    const timeout = CACHE_STRATEGIES.NETWORK_TIMEOUT[networkInfo.effectiveType] || CACHE_STRATEGIES.NETWORK_TIMEOUT.default;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch(request, { 
            signal: controller.signal,
            cache: 'default'
        });
        clearTimeout(timeoutId);
        return response;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

async function staleWhileRevalidate(request) {
    const url = request.url;
    
    // Try to get from dynamic cache first
    const dynamicCache = await caches.open(CACHE_CONFIG.DYNAMIC);
    const cachedResponse = await dynamicCache.match(request);
    
    if (cachedResponse) {
        const cacheDate = new Date(cachedResponse.headers.get('sw-cached-date') || 0);
        const isStale = Date.now() - cacheDate.getTime() > CACHE_STRATEGIES.STALE_WHILE_REVALIDATE_AGE_MS;
        
        if (!isStale) {
            console.log('Service Worker: Serving fresh from cache:', url);
            return cachedResponse;
        }
        
        // Serve stale content immediately, then update in background
        console.log('Service Worker: Serving stale from cache, updating in background:', url);
        
        // Background update
        retryWithBackoff(async () => {
            const networkResponse = await adaptiveImageFetch(request);
            if (networkResponse.ok) {
                await updateCacheWithLRU(dynamicCache, request, networkResponse.clone());
            }
        }, CACHE_STRATEGIES.RETRY_CONFIG).catch(error => {
            console.warn('Service Worker: Background update failed:', url, error);
        });
        
        return cachedResponse;
    }
    
    // Not in cache, fetch from network
    const networkResponse = await adaptiveImageFetch(request);
    if (networkResponse.ok) {
        await updateCacheWithLRU(dynamicCache, request, networkResponse.clone());
    }
    return networkResponse;
}

async function updateCacheWithLRU(cache, request, response) {
    // Add timestamp header
    const responseWithTimestamp = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
            ...Object.fromEntries(response.headers.entries()),
            'sw-cached-date': new Date().toISOString()
        }
    });
    
    // Check cache size and evict if necessary
    const keys = await cache.keys();
    if (keys.length >= CACHE_STRATEGIES.MAX_DYNAMIC_SIZE) {
        // Remove oldest entries (simple LRU approximation)
        const entriesToRemove = keys.slice(0, Math.floor(CACHE_STRATEGIES.MAX_DYNAMIC_SIZE * 0.1));
        await Promise.all(entriesToRemove.map(key => cache.delete(key)));
    }
    
    await cache.put(request, responseWithTimestamp);
}

async function getUltimateFallback(url) {
    // Try critical cache first
    const criticalCache = await caches.open(CACHE_CONFIG.CRITICAL);
    const errorImagePath = config.getImagePath ? config.getImagePath('error.svg') : 'images/error.svg';
    const errorResponse = await criticalCache.match(errorImagePath);
    if (errorResponse) {
        return errorResponse;
    }
    
    // Try fallback cache
    const fallbackCache = await caches.open(CACHE_CONFIG.FALLBACK);
    const placeholderImagePath = config.getImagePath ? config.getImagePath('placeholder.svg') : 'images/placeholder.svg';
    const fallbackResponse = await fallbackCache.match(placeholderImagePath);
    if (fallbackResponse) {
        return fallbackResponse;
    }
    
    // Generate contextual fallback
    return generateContextualFallback(url);
}

function generateContextualFallback(url) {
    // Determine context from URL
    let context = 'image';
    let color = '#f0f0f0';
    let textColor = '#999';
    
    if (url.includes('mainpagealbum') || url.includes('slider')) {
        context = 'gallery';
        color = '#e8f4f8';
        textColor = '#666';
    } else if (url.includes('organizationalchart') || url.includes('LGRC')) {
        context = 'official';
        color = '#f8f8f8';
        textColor = '#333';
    } else if (url.includes('background') || url.includes('bg-')) {
        context = 'background';
        color = '#fafafa';
        textColor = '#ccc';
    }
    
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300">
        <rect width="400" height="300" fill="${color}" stroke="#ddd" stroke-width="2"/>
        <circle cx="200" cy="120" r="30" fill="${textColor}" opacity="0.3"/>
        <rect x="170" y="100" width="60" height="40" fill="none" stroke="${textColor}" stroke-width="2" opacity="0.3"/>
        <text x="200" y="180" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="${textColor}">
            ${context.charAt(0).toUpperCase() + context.slice(1)} unavailable
        </text>
        <text x="200" y="200" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="${textColor}" opacity="0.7">
            Check your connection
        </text>
    </svg>`;
    
    return new Response(svg, {
        headers: {
            'Content-Type': 'image/svg+xml',
            'Cache-Control': 'no-cache'
        }
    });
}

async function retryWithBackoff(operation, config = CACHE_STRATEGIES.RETRY_CONFIG) {
    let lastError;
    
    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            
            if (attempt === config.maxRetries) {
                break;
            }
            
            // Exponential backoff with jitter
            const delay = Math.min(
                config.baseDelay * Math.pow(2, attempt) * (0.8 + Math.random() * 0.4),
                config.maxDelay
            );
            
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    throw lastError;
}

async function handleImageRequest(request) {
    const url = request.url;
    
    try {
        return await retryWithBackoff(async () => {
            return await staleWhileRevalidate(request);
        }, CACHE_STRATEGIES.RETRY_CONFIG);
    } catch (error) {
        console.warn('Service Worker: Failed to fetch image:', url, error);
        return await getUltimateFallback(url);
    }
}

async function warmCacheProactively(urls) {
    if (!Array.isArray(urls)) {
        urls = [urls];
    }
    
    const dynamicCache = await caches.open(CACHE_CONFIG.DYNAMIC);
    const results = [];
    
    for (const url of urls) {
        try {
            const request = new Request(url);
            const cachedResponse = await dynamicCache.match(request);
            
            if (!cachedResponse) {
                const response = await adaptiveImageFetch(request);
                if (response.ok) {
                    await updateCacheWithLRU(dynamicCache, request, response.clone());
                    results.push({ url, status: 'cached' });
                } else {
                    results.push({ url, status: 'failed', error: `HTTP ${response.status}` });
                }
            } else {
                results.push({ url, status: 'already-cached' });
            }
        } catch (error) {
            results.push({ url, status: 'error', error: error.message });
        }
    }
    
    return results;
}

async function performHealthCheck() {
    const health = {
        timestamp: new Date().toISOString(),
        caches: {},
        network: getNetworkInfo()
    };
    
    // Check each cache
    for (const [name, cacheName] of Object.entries(CACHE_CONFIG)) {
        try {
            const cache = await caches.open(cacheName);
            const keys = await cache.keys();
            health.caches[name] = {
                size: keys.length,
                status: 'healthy'
            };
        } catch (error) {
            health.caches[name] = {
                size: 0,
                status: 'error',
                error: error.message
            };
        }
    }
    
    return health;
}

async function cleanupExpiredEntries() {
    const dynamicCache = await caches.open(CACHE_CONFIG.DYNAMIC);
    const keys = await dynamicCache.keys();
    let cleanedCount = 0;
    
    for (const request of keys) {
        try {
            const response = await dynamicCache.match(request);
            if (response) {
                const cacheDate = new Date(response.headers.get('sw-cached-date') || 0);
                const isExpired = Date.now() - cacheDate.getTime() > CACHE_STRATEGIES.MAX_AGE_MS;
                
                if (isExpired) {
                    await dynamicCache.delete(request);
                    cleanedCount++;
                }
            }
        } catch (error) {
            console.warn('Service Worker: Error during cleanup:', error);
        }
    }
    
    console.log(`Service Worker: Cleaned up ${cleanedCount} expired entries`);
    return cleanedCount;
}

async function performMaintenance() {
    console.log('Service Worker: Performing scheduled maintenance');
    
    try {
        const cleanedCount = await cleanupExpiredEntries();
        const healthCheck = await performHealthCheck();
        
        // Broadcast maintenance results to clients
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
            client.postMessage({
                type: 'MAINTENANCE_COMPLETE',
                data: {
                    cleanedCount,
                    health: healthCheck
                }
            });
        });
        
    } catch (error) {
        console.error('Service Worker: Maintenance failed:', error);
    }
}

// Handle messages from the main thread
self.addEventListener('message', event => {
    const data = event.data;
    const replyPort = event.ports && event.ports[0];

    if (!data || !data.type) {
        return;
    }

    if (data.type === 'SKIP_WAITING') {
        self.skipWaiting();
        return;
    }
    
    if (data.type === 'GET_CACHE_STATS' && replyPort) {
        getCacheStats().then(stats => {
            replyPort.postMessage(stats);
        });
        return;
    }
    
    if (data.type === 'CLEAR_CACHE' && replyPort) {
        clearImageCache().then(success => {
            replyPort.postMessage({ success });
        });
        return;
    }
    
    if (data.type === 'WARM_CACHE' && replyPort) {
        const urls = data.urls || [];
        warmCacheProactively(urls).then(results => {
            replyPort.postMessage({ results });
        });
        return;
    }
    
    if (data.type === 'PERFORM_HEALTH_CHECK' && replyPort) {
        performHealthCheck().then(health => {
            replyPort.postMessage({ health });
        });
    }
});

// Utility function to get cache statistics
async function getCacheStats() {
    try {
        const stats = {
            caches: {},
            totalSize: 0,
            network: getNetworkInfo()
        };
        
        for (const [name, cacheName] of Object.entries(CACHE_CONFIG)) {
            const cache = await caches.open(cacheName);
            const keys = await cache.keys();
            stats.caches[name] = {
                size: keys.length,
                urls: keys.map(request => request.url),
                cacheName: cacheName
            };
            stats.totalSize += keys.length;
        }
        
        return stats;
    } catch (error) {
        console.error('Service Worker: Failed to get cache stats:', error);
        return { error: error.message };
    }
}

// Utility function to clear image cache
async function clearImageCache() {
    try {
        const deletePromises = Object.values(CACHE_CONFIG).map(cacheName => caches.delete(cacheName));
        const results = await Promise.all(deletePromises);
        
        // Recreate critical cache with critical images (unless precaching is disabled)
        if (!config.cache.skipPrecache) {
            const criticalCache = await caches.open(CACHE_CONFIG.CRITICAL);
            await criticalCache.addAll(CACHE_STRATEGIES.CRITICAL_IMAGES.map(url => new Request(url, { cache: 'reload' })));
        }
        
        return results.some(result => result);
    } catch (error) {
        console.error('Service Worker: Failed to clear cache:', error);
        return false;
    }
}

// Error handling for unhandled promise rejections
self.addEventListener('unhandledrejection', event => {
    console.error('Service Worker: Unhandled promise rejection:', event.reason);
});

console.log('Service Worker: Script loaded');
