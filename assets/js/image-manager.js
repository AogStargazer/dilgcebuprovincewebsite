(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        // CommonJS
        module.exports = factory();
    } else {
        // Browser globals
        root.ImageManager = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // Default configuration
    const DEFAULT_CONFIG = {
        concurrency: 4,
        timeout: 10000,
        retryCount: 3,
        retryDelay: 1000,
        placeholder: 'images/placeholder.svg',
        errorImage: 'images/error.svg',
        rootMargin: '200px',
        fadeInClass: 'img-loaded',
        serviceWorkerPath: '/assets/js/service-worker.js'
    };

    // Network-aware configuration adjustment
    function getNetworkAwareConfig(baseConfig) {
        const config = { ...baseConfig };
        
        if ('connection' in navigator && navigator.connection) {
            const connection = navigator.connection;
            const effectiveType = connection.effectiveType;
            
            switch (effectiveType) {
                case 'slow-2g':
                    config.concurrency = 1;
                    config.retryDelay = 3000;
                    config.timeout = 20000;
                    break;
                case '2g':
                    config.concurrency = 2;
                    config.retryDelay = 2000;
                    config.timeout = 15000;
                    break;
                case '3g':
                    config.concurrency = 3;
                    config.retryDelay = 1500;
                    config.timeout = 12000;
                    break;
                case '4g':
                default:
                    // Use default values
                    break;
            }
        }
        
        return config;
    }

    // Utility function to parse srcset and select best URL
    function parseSrcset(srcset, viewportWidth = window.innerWidth, devicePixelRatio = window.devicePixelRatio || 1) {
        if (!srcset) return null;
        
        const candidates = srcset.split(',').map(candidate => {
            const parts = candidate.trim().split(/\s+/);
            const url = parts[0];
            const descriptor = parts[1] || '1x';
            
            let width = 0;
            let density = 1;
            
            if (descriptor.endsWith('w')) {
                width = parseInt(descriptor.slice(0, -1));
            } else if (descriptor.endsWith('x')) {
                density = parseFloat(descriptor.slice(0, -1));
            }
            
            return { url, width, density };
        });
        
        // Find best candidate based on viewport width and device pixel ratio
        let bestCandidate = candidates[0];
        const targetWidth = viewportWidth * devicePixelRatio;
        
        for (const candidate of candidates) {
            if (candidate.width > 0) {
                // Width-based selection
                if (candidate.width >= targetWidth && 
                    (bestCandidate.width === 0 || candidate.width < bestCandidate.width)) {
                    bestCandidate = candidate;
                }
            } else {
                // Density-based selection
                if (candidate.density >= devicePixelRatio && 
                    candidate.density < bestCandidate.density) {
                    bestCandidate = candidate;
                }
            }
        }
        
        return bestCandidate.url;
    }

    // Internal cache for loaded images
    class ImageCache {
        constructor() {
            this.cache = new Map();
        }

        get(url) {
            return this.cache.get(url);
        }

        set(url, image) {
            this.cache.set(url, image);
        }

        has(url) {
            return this.cache.has(url);
        }

        clear() {
            this.cache.clear();
        }

        getStats() {
            return {
                count: this.cache.size,
                urls: Array.from(this.cache.keys())
            };
        }
    }

    // Image loader with concurrency control and retry logic
    class ImageLoader {
        constructor(config) {
            this.config = config;
            this.activeLoads = 0;
            this.queue = [];
        }

        async load(url, element = null) {
            return new Promise((resolve, reject) => {
                this.queue.push({ url, resolve, reject, retries: 0, element });
                this.processQueue();
            });
        }

        async processQueue() {
            if (this.activeLoads >= this.config.concurrency || this.queue.length === 0) {
                return;
            }

            const task = this.queue.shift();
            this.activeLoads++;

            try {
                const image = await this.loadImage(task.url, task);
                task.resolve(image);
            } catch (error) {
                if (task.retries < this.config.retryCount) {
                    task.retries++;
                    // Exponential backoff with jitter
                    const delay = this.config.retryDelay * Math.pow(2, task.retries) * (0.8 + Math.random() * 0.4);
                    
                    // Dispatch progress event
                    if (task.element) {
                        task.element.dispatchEvent(new CustomEvent('imageProgress', {
                            detail: { url: task.url, retries: task.retries, delay }
                        }));
                    }
                    
                    setTimeout(() => {
                        this.queue.unshift(task);
                        this.processQueue();
                    }, delay);
                } else {
                    task.reject(error);
                }
            } finally {
                this.activeLoads--;
                this.processQueue();
            }
        }

        loadImage(url, task = {}) {
            return new Promise((resolve, reject) => {
                const startTime = performance.now();
                const img = new Image();
                
                // Dispatch before load event
                if (task.element) {
                    task.element.dispatchEvent(new CustomEvent('imageBeforeLoad', {
                        detail: { url, startTime }
                    }));
                }
                
                const timeoutId = setTimeout(() => {
                    reject(new Error(`Image load timeout: ${url}`));
                }, this.config.timeout);

                img.onload = () => {
                    clearTimeout(timeoutId);
                    const loadTime = performance.now() - startTime;
                    
                    // Dispatch complete event with metrics
                    if (task.element) {
                        task.element.dispatchEvent(new CustomEvent('imageComplete', {
                            detail: { url, loadTime, retries: task.retries || 0 }
                        }));
                    }
                    
                    resolve(img);
                };

                img.onerror = () => {
                    clearTimeout(timeoutId);
                    reject(new Error(`Failed to load image: ${url}`));
                };

                img.src = url;
            });
        }
    }

    // Lazy loader using IntersectionObserver
    class LazyLoader {
        constructor(config, imageCache, imageLoader) {
            this.config = config;
            this.imageCache = imageCache;
            this.imageLoader = imageLoader;
            this.observer = null;
            this.init();
        }

        init() {
            if (!('IntersectionObserver' in window)) {
                // Fallback for browsers without IntersectionObserver
                this.loadAllImages();
                return;
            }

            this.observer = new IntersectionObserver(
                this.handleIntersection.bind(this),
                {
                    rootMargin: this.config.rootMargin,
                    threshold: 0.1
                }
            );
        }

        observe(element) {
            if (this.observer) {
                this.observer.observe(element);
            } else {
                // Fallback: load immediately
                this.loadElement(element);
            }
        }

        handleIntersection(entries) {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    this.loadElement(entry.target);
                    this.observer.unobserve(entry.target);
                }
            });
        }

        async loadElement(element) {
            let url = element.dataset.src || element.dataset.bgSrc;
            if (!url) return;

            try {
                // Handle responsive srcset
                if (element.dataset.srcset) {
                    const bestUrl = parseSrcset(element.dataset.srcset);
                    if (bestUrl) {
                        url = bestUrl;
                    }
                }

                // Set LQIP placeholder if available
                if (element.dataset.lqip) {
                    if (element.tagName === 'IMG') {
                        element.src = element.dataset.lqip;
                        element.style.filter = 'blur(5px)';
                    } else {
                        element.style.backgroundImage = `url(${element.dataset.lqip})`;
                        element.style.filter = 'blur(5px)';
                    }
                } else if (this.config.placeholder && element.tagName === 'IMG') {
                    element.src = this.config.placeholder;
                }

                let image;
                if (this.imageCache.has(url)) {
                    image = this.imageCache.get(url);
                } else {
                    image = await this.imageLoader.load(url, element);
                    this.imageCache.set(url, image);
                }

                // Apply the loaded image
                if (element.tagName === 'IMG') {
                    element.src = url;
                    // Remove blur filter if LQIP was used
                    if (element.dataset.lqip) {
                        element.style.filter = '';
                    }
                } else if (element.dataset.bgSrc) {
                    element.style.backgroundImage = `url(${url})`;
                    // Remove blur filter if LQIP was used
                    if (element.dataset.lqip) {
                        element.style.filter = '';
                    }
                }

                // Add fade-in class
                if (this.config.fadeInClass) {
                    element.classList.add(this.config.fadeInClass);
                }

                // Dispatch custom event
                element.dispatchEvent(new CustomEvent('imageLoaded', { detail: { url, element } }));

            } catch (error) {
                console.warn('Failed to load image:', url, error);
                
                // Remove blur filter even on error
                if (element.dataset.lqip) {
                    element.style.filter = '';
                }
                
                // Set error image if available
                if (this.config.errorImage && element.tagName === 'IMG') {
                    element.src = this.config.errorImage;
                } else if (element.dataset.bgSrc && this.config.errorImage) {
                    element.style.backgroundImage = `url(${this.config.errorImage})`;
                }

                // Dispatch error event
                element.dispatchEvent(new CustomEvent('imageError', { detail: { url, element, error } }));
            }
        }

        loadAllImages() {
            // Fallback method for browsers without IntersectionObserver
            const lazyImages = document.querySelectorAll('[data-src], [data-bg-src]');
            lazyImages.forEach(img => this.loadElement(img));
        }

        disconnect() {
            if (this.observer) {
                this.observer.disconnect();
            }
        }
    }

    // Main ImageManager class
    class ImageManager {
        constructor() {
            this.config = { ...DEFAULT_CONFIG };
            this.imageCache = new ImageCache();
            this.imageLoader = new ImageLoader(this.config);
            this.lazyLoader = new LazyLoader(this.config, this.imageCache, this.imageLoader);
            this.initialized = false;
        }

        init(customConfig = {}) {
            // Merge custom config with defaults and apply network-aware adjustments
            this.config = getNetworkAwareConfig({ ...DEFAULT_CONFIG, ...customConfig });
            
            // Reinitialize components with new config
            this.imageLoader = new ImageLoader(this.config);
            this.lazyLoader = new LazyLoader(this.config, this.imageCache, this.imageLoader);
            
            // Register service worker
            this.registerServiceWorker();
            
            this.initialized = true;
            return this;
        }

        async registerServiceWorker() {
            if ('serviceWorker' in navigator && this.config.serviceWorkerPath) {
                try {
                    const registration = await navigator.serviceWorker.register(this.config.serviceWorkerPath);
                    console.log('ServiceWorker registered successfully:', registration);
                } catch (error) {
                    console.warn('ServiceWorker registration failed:', error);
                }
            }
        }

        scanDOM() {
            // Scan for lazy loading images
            const lazyImages = document.querySelectorAll('img[loading="lazy"], [data-src], [data-bg-src]');
            
            lazyImages.forEach(element => {
                // Convert native lazy loading to our system
                if (element.tagName === 'IMG' && element.loading === 'lazy' && element.src && !element.dataset.src) {
                    element.dataset.src = element.src;
                    element.src = this.config.placeholder || '';
                }
                
                this.lazyLoader.observe(element);
            });
        }

        async preload(urls) {
            if (!Array.isArray(urls)) {
                urls = [urls];
            }

            const promises = urls.map(async url => {
                if (this.imageCache.has(url)) {
                    return this.imageCache.get(url);
                }

                try {
                    const image = await this.imageLoader.load(url);
                    this.imageCache.set(url, image);
                    return image;
                } catch (error) {
                    console.warn('Failed to preload image:', url, error);
                    throw error;
                }
            });

            return Promise.allSettled(promises);
        }

        getCache() {
            return this.imageCache;
        }

        getCacheStats() {
            return this.imageCache.getStats();
        }

        clearCache() {
            this.imageCache.clear();
        }

        destroy() {
            this.lazyLoader.disconnect();
            this.clearCache();
        }
    }

    // Create singleton instance
    const imageManager = new ImageManager();

    // Auto-initialize on DOMContentLoaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            if (!imageManager.initialized) {
                imageManager.init();
            }
            imageManager.scanDOM();
        });
    } else {
        // DOM is already loaded
        setTimeout(() => {
            if (!imageManager.initialized) {
                imageManager.init();
            }
            imageManager.scanDOM();
        }, 0);
    }

    // Export the singleton instance with static-like methods
    return {
        init: (config) => imageManager.init(config),
        scanDOM: () => imageManager.scanDOM(),
        preload: (urls) => imageManager.preload(urls),
        getCache: () => imageManager.getCache(),
        getCacheStats: () => imageManager.getCacheStats(),
        clearCache: () => imageManager.clearCache(),
        destroy: () => imageManager.destroy(),
        registerServiceWorker: () => imageManager.registerServiceWorker(),
        DEFAULT_CONFIG: DEFAULT_CONFIG
    };
}));
