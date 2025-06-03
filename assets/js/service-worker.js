const CACHE_NAME = 'image-cache-v1';
const CRITICAL_IMAGES = [
    'images/placeholder.svg',
    'images/error.svg'
];

// Install event - pre-cache critical images
self.addEventListener('install', event => {
    console.log('Service Worker: Installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Caching critical images');
                return cache.addAll(CRITICAL_IMAGES.map(url => new Request(url, { cache: 'reload' })));
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
                return Promise.all(
                    cacheNames.map(cacheName => {
                        // Delete old image caches (anything that's not the current version)
                        if (cacheName.startsWith('image-cache-') && cacheName !== CACHE_NAME) {
                            console.log('Service Worker: Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('Service Worker: Old caches cleaned up');
                return self.clients.claim();
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

async function handleImageRequest(request) {
    const url = request.url;
    
    try {
        // Try to get from cache first
        const cache = await caches.open(CACHE_NAME);
        const cachedResponse = await cache.match(request);
        
        if (cachedResponse) {
            console.log('Service Worker: Serving from cache:', url);
            return cachedResponse;
        }
        
        // Not in cache, try to fetch from network
        console.log('Service Worker: Fetching from network:', url);
        const networkResponse = await fetch(request);
        
        // If successful, cache the response
        if (networkResponse.ok) {
            // Clone the response before caching (response can only be consumed once)
            const responseToCache = networkResponse.clone();
            await cache.put(request, responseToCache);
            console.log('Service Worker: Cached new image:', url);
            return networkResponse;
        } else {
            throw new Error(`Network response not ok: ${networkResponse.status}`);
        }
        
    } catch (error) {
        console.warn('Service Worker: Failed to fetch image:', url, error);
        
        // Network failed and not in cache, serve error image as fallback
        try {
            const cache = await caches.open(CACHE_NAME);
            const errorResponse = await cache.match('images/error.svg');
            
            if (errorResponse) {
                console.log('Service Worker: Serving error image fallback for:', url);
                return errorResponse;
            }
        } catch (fallbackError) {
            console.error('Service Worker: Failed to serve error image fallback:', fallbackError);
        }
        
        // If even the error image fails, return a minimal SVG response
        return new Response(
            '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="#f0f0f0"/><text x="50" y="50" text-anchor="middle" dy=".3em" font-family="Arial" font-size="12" fill="#999">Error</text></svg>',
            {
                headers: {
                    'Content-Type': 'image/svg+xml',
                    'Cache-Control': 'no-cache'
                }
            }
        );
    }
}

// Handle messages from the main thread
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'GET_CACHE_STATS') {
        getCacheStats().then(stats => {
            event.ports[0].postMessage(stats);
        });
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        clearImageCache().then(success => {
            event.ports[0].postMessage({ success });
        });
    }
});

// Utility function to get cache statistics
async function getCacheStats() {
    try {
        const cache = await caches.open(CACHE_NAME);
        const keys = await cache.keys();
        
        const stats = {
            cacheSize: keys.length,
            cachedUrls: keys.map(request => request.url),
            cacheName: CACHE_NAME
        };
        
        return stats;
    } catch (error) {
        console.error('Service Worker: Failed to get cache stats:', error);
        return { error: error.message };
    }
}

// Utility function to clear image cache
async function clearImageCache() {
    try {
        const deleted = await caches.delete(CACHE_NAME);
        if (deleted) {
            // Recreate cache with critical images
            const cache = await caches.open(CACHE_NAME);
            await cache.addAll(CRITICAL_IMAGES.map(url => new Request(url, { cache: 'reload' })));
        }
        return deleted;
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