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

    // NetworkMonitor for connection events
    class NetworkMonitor {
        constructor() {
            this.listeners = [];
            this.currentConnection = null;
            this.init();
        }

        init() {
            if ('connection' in navigator) {
                this.currentConnection = navigator.connection;
                navigator.connection.addEventListener('change', this.handleConnectionChange.bind(this));
            }
            
            window.addEventListener('online', this.handleOnlineChange.bind(this));
            window.addEventListener('offline', this.handleOnlineChange.bind(this));
        }

        handleConnectionChange() {
            const info = this.getNetworkInfo();
            this.notifyListeners(info);
        }

        handleOnlineChange() {
            const info = this.getNetworkInfo();
            this.notifyListeners(info);
        }

        getNetworkInfo() {
            const info = {
                online: navigator.onLine,
                effectiveType: '4g',
                downlink: 10,
                rtt: 100,
                saveData: false
            };

            if (this.currentConnection) {
                info.effectiveType = this.currentConnection.effectiveType || '4g';
                info.downlink = this.currentConnection.downlink || 10;
                info.rtt = this.currentConnection.rtt || 100;
                info.saveData = this.currentConnection.saveData || false;
            }

            return info;
        }

        subscribe(callback) {
            this.listeners.push(callback);
        }

        unsubscribe(callback) {
            this.listeners = this.listeners.filter(listener => listener !== callback);
        }

        notifyListeners(info) {
            this.listeners.forEach(callback => callback(info));
        }
    }

    // BandwidthMonitor for on-the-fly bandwidth tests
    class BandwidthMonitor {
        constructor() {
            this.bandwidth = 0;
            this.lastMeasurement = 0;
            this.measurementInterval = 30000; // 30 seconds
        }

        async measureBandwidth() {
            const now = Date.now();
            if (now - this.lastMeasurement < this.measurementInterval) {
                return this.bandwidth;
            }

            try {
                const testUrl = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
                const startTime = performance.now();
                
                const response = await fetch(testUrl, { cache: 'no-cache' });
                await response.blob();
                
                const endTime = performance.now();
                const duration = endTime - startTime;
                const bytes = 43; // Size of the test image
                
                this.bandwidth = (bytes * 8) / (duration / 1000); // bits per second
                this.lastMeasurement = now;
                
                return this.bandwidth;
            } catch (error) {
                console.warn('Bandwidth measurement failed:', error);
                return this.bandwidth;
            }
        }

        getBandwidth() {
            return this.bandwidth;
        }
    }

    // CircuitBreaker with OPEN/HALF_OPEN/CLOSED states
    class CircuitBreaker {
        constructor(threshold = 5, timeout = 60000) {
            this.threshold = threshold;
            this.timeout = timeout;
            this.failureCount = 0;
            this.lastFailureTime = 0;
            this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        }

        async execute(operation) {
            if (this.state === 'OPEN') {
                if (Date.now() - this.lastFailureTime > this.timeout) {
                    this.state = 'HALF_OPEN';
                } else {
                    throw new Error('Circuit breaker is OPEN');
                }
            }

            try {
                const result = await operation();
                this.onSuccess();
                return result;
            } catch (error) {
                this.onFailure();
                throw error;
            }
        }

        onSuccess() {
            this.failureCount = 0;
            this.state = 'CLOSED';
        }

        onFailure() {
            this.failureCount++;
            this.lastFailureTime = Date.now();
            
            if (this.failureCount >= this.threshold) {
                this.state = 'OPEN';
            }
        }

        getState() {
            return this.state;
        }

        reset() {
            this.failureCount = 0;
            this.state = 'CLOSED';
        }
    }

    // LRUImageCache enforcing max items and memory
    class LRUImageCache {
        constructor(maxItems = 100, maxMemoryMB = 50) {
            this.maxItems = maxItems;
            this.maxMemory = maxMemoryMB * 1024 * 1024; // Convert to bytes
            this.cache = new Map();
            this.accessOrder = [];
            this.currentMemory = 0;
        }

        estimateImageSize(image) {
            if (image.naturalWidth && image.naturalHeight) {
                return image.naturalWidth * image.naturalHeight * 4; // Assume 4 bytes per pixel
            }
            return 1024; // Default estimate
        }

        get(url) {
            if (this.cache.has(url)) {
                // Move to end (most recently used)
                this.accessOrder = this.accessOrder.filter(key => key !== url);
                this.accessOrder.push(url);
                return this.cache.get(url);
            }
            return null;
        }

        set(url, image) {
            const size = this.estimateImageSize(image);
            
            // Remove existing entry if present
            if (this.cache.has(url)) {
                const oldSize = this.cache.get(url).size || 0;
                this.currentMemory -= oldSize;
                this.accessOrder = this.accessOrder.filter(key => key !== url);
            }

            // Evict items if necessary
            while ((this.cache.size >= this.maxItems || this.currentMemory + size > this.maxMemory) && this.accessOrder.length > 0) {
                this.evictLRU();
            }

            // Add new item
            this.cache.set(url, { image, size });
            this.accessOrder.push(url);
            this.currentMemory += size;
        }

        evictLRU() {
            if (this.accessOrder.length === 0) return;
            
            const lruKey = this.accessOrder.shift();
            const item = this.cache.get(lruKey);
            if (item) {
                this.currentMemory -= item.size;
                this.cache.delete(lruKey);
            }
        }

        has(url) {
            return this.cache.has(url);
        }

        clear() {
            this.cache.clear();
            this.accessOrder = [];
            this.currentMemory = 0;
        }

        getStats() {
            return {
                count: this.cache.size,
                memoryUsage: this.currentMemory,
                maxMemory: this.maxMemory,
                urls: Array.from(this.cache.keys())
            };
        }
    }

    // ProgressiveImageLoader extending the base loader
    class ProgressiveImageLoader {
        constructor(config) {
            this.config = config;
        }

        estimateImageSize(url) {
            // Simple heuristic based on URL patterns
            if (url.includes('thumb') || url.includes('small')) return 50000;
            if (url.includes('medium')) return 200000;
            if (url.includes('large') || url.includes('full')) return 800000;
            return 300000; // Default estimate
        }

        async loadWithStrategy(url, strategy = 'progressive') {
            switch (strategy) {
                case 'progressive':
                    return this.loadProgressive(url);
                case 'immediate':
                    return this.loadImmediate(url);
                default:
                    return this.loadProgressive(url);
            }
        }

        async loadProgressive(url) {
            // Try to load a lower quality version first if available
            const progressiveUrl = this.getProgressiveUrl(url);
            
            if (progressiveUrl !== url) {
                try {
                    const lowQualityImage = await this.loadImmediate(progressiveUrl);
                    // Load high quality in background
                    setTimeout(() => this.loadImmediate(url), 100);
                    return lowQualityImage;
                } catch (error) {
                    // Fallback to original URL
                    return this.loadImmediate(url);
                }
            }
            
            return this.loadImmediate(url);
        }

        getProgressiveUrl(url) {
            // Simple progressive URL generation
            if (url.includes('.jpg') || url.includes('.jpeg')) {
                return url.replace(/\.(jpg|jpeg)/, '_low.$1');
            }
            return url;
        }

        loadImmediate(url) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                const timeoutId = setTimeout(() => {
                    reject(new Error(`Image load timeout: ${url}`));
                }, this.config.timeout);

                img.onload = () => {
                    clearTimeout(timeoutId);
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

    // RobustImageLoader with per-domain circuit breakers
    class RobustImageLoader {
        constructor(config) {
            this.config = config;
            this.activeLoads = 0;
            this.queue = [];
            this.circuitBreakers = new Map();
            this.progressiveLoader = new ProgressiveImageLoader(config);
            this.paused = false;
            this.metrics = {
                totalLoads: 0,
                successfulLoads: 0,
                failedLoads: 0,
                averageLoadTime: 0
            };
        }

        getDomain(url) {
            try {
                return new URL(url).hostname;
            } catch {
                return 'localhost';
            }
        }

        getCircuitBreaker(domain) {
            if (!this.circuitBreakers.has(domain)) {
                this.circuitBreakers.set(domain, new CircuitBreaker());
            }
            return this.circuitBreakers.get(domain);
        }

        pause() {
            this.paused = true;
        }

        resume() {
            this.paused = false;
            this.processQueue();
        }

        async load(url, element = null) {
            return new Promise((resolve, reject) => {
                this.queue.push({ url, resolve, reject, retries: 0, element, startTime: Date.now() });
                this.processQueue();
            });
        }

        async processQueue() {
            if (this.paused || this.activeLoads >= this.config.concurrency || this.queue.length === 0) {
                return;
            }

            const task = this.queue.shift();
            this.activeLoads++;
            this.metrics.totalLoads++;

            try {
                const domain = this.getDomain(task.url);
                const circuitBreaker = this.getCircuitBreaker(domain);
                
                const image = await circuitBreaker.execute(() => 
                    this.progressiveLoader.loadWithStrategy(task.url, 'progressive')
                );
                
                const loadTime = Date.now() - task.startTime;
                this.updateMetrics(true, loadTime);
                
                if (task.element) {
                    task.element.dispatchEvent(new CustomEvent('imageComplete', {
                        detail: { url: task.url, loadTime, retries: task.retries }
                    }));
                }
                
                task.resolve(image);
            } catch (error) {
                if (task.retries < this.config.retryCount) {
                    task.retries++;
                    const delay = this.config.retryDelay * Math.pow(2, task.retries) * (0.8 + Math.random() * 0.4);
                    
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
                    this.updateMetrics(false, Date.now() - task.startTime);
                    task.reject(error);
                }
            } finally {
                this.activeLoads--;
                this.processQueue();
            }
        }

        updateMetrics(success, loadTime) {
            if (success) {
                this.metrics.successfulLoads++;
            } else {
                this.metrics.failedLoads++;
            }
            
            // Update average load time
            const totalSuccessful = this.metrics.successfulLoads;
            if (totalSuccessful > 0) {
                this.metrics.averageLoadTime = 
                    (this.metrics.averageLoadTime * (totalSuccessful - 1) + loadTime) / totalSuccessful;
            }
        }

        getMetrics() {
            return { ...this.metrics };
        }

        getCircuitBreakerStates() {
            const states = {};
            for (const [domain, breaker] of this.circuitBreakers) {
                states[domain] = breaker.getState();
            }
            return states;
        }
    }

    // PriorityQueue for prioritized loading
    class PriorityQueue {
        constructor() {
            this.items = [];
        }

        enqueue(item, priority) {
            const queueItem = { item, priority };
            let added = false;
            
            for (let i = 0; i < this.items.length; i++) {
                if (queueItem.priority > this.items[i].priority) {
                    this.items.splice(i, 0, queueItem);
                    added = true;
                    break;
                }
            }
            
            if (!added) {
                this.items.push(queueItem);
            }
        }

        dequeue() {
            return this.items.shift()?.item;
        }

        isEmpty() {
            return this.items.length === 0;
        }

        size() {
            return this.items.length;
        }
    }

    // ViewportAwareLazyLoader for prioritized, viewport-aware lazy loading
    class ViewportAwareLazyLoader {
        constructor(config, imageCache, imageLoader) {
            this.config = config;
            this.imageCache = imageCache;
            this.imageLoader = imageLoader;
            this.observer = null;
            this.priorityQueue = new PriorityQueue();
            this.processing = false;
            this.init();
        }

        init() {
            if (!('IntersectionObserver' in window)) {
                this.loadAllImages();
                return;
            }

            this.observer = new IntersectionObserver(
                this.handleIntersection.bind(this),
                {
                    rootMargin: this.config.rootMargin,
                    threshold: [0, 0.1, 0.5, 1.0]
                }
            );
        }

        observe(element) {
            if (this.observer) {
                this.observer.observe(element);
            } else {
                this.loadElement(element);
            }
        }

        handleIntersection(entries) {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const priority = this.calculatePriority(entry);
                    this.priorityQueue.enqueue(entry.target, priority);
                    this.observer.unobserve(entry.target);
                }
            });
            
            this.processQueue();
        }

        calculatePriority(entry) {
            let priority = 0;
            
            // Higher priority for more visible elements
            priority += entry.intersectionRatio * 100;
            
            // Higher priority for elements closer to viewport center
            const rect = entry.boundingClientRect;
            const viewportCenter = window.innerHeight / 2;
            const elementCenter = rect.top + rect.height / 2;
            const distanceFromCenter = Math.abs(viewportCenter - elementCenter);
            priority += Math.max(0, 100 - (distanceFromCenter / viewportCenter) * 100);
            
            // Higher priority for larger elements
            const area = rect.width * rect.height;
            priority += Math.min(50, area / 10000);
            
            return priority;
        }

        async processQueue() {
            if (this.processing || this.priorityQueue.isEmpty()) {
                return;
            }
            
            this.processing = true;
            
            while (!this.priorityQueue.isEmpty()) {
                const element = this.priorityQueue.dequeue();
                await this.loadElement(element);
            }
            
            this.processing = false;
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
                    image = this.imageCache.get(url).image;
                } else {
                    image = await this.imageLoader.load(url, element);
                    this.imageCache.set(url, image);
                }

                // Apply the loaded image
                if (element.tagName === 'IMG') {
                    element.src = url;
                    if (element.dataset.lqip) {
                        element.style.filter = '';
                    }
                } else if (element.dataset.bgSrc) {
                    element.style.backgroundImage = `url(${url})`;
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
                
                if (element.dataset.lqip) {
                    element.style.filter = '';
                }
                
                if (this.config.errorImage && element.tagName === 'IMG') {
                    element.src = this.config.errorImage;
                } else if (element.dataset.bgSrc && this.config.errorImage) {
                    element.style.backgroundImage = `url(${this.config.errorImage})`;
                }

                element.dispatchEvent(new CustomEvent('imageError', { detail: { url, element, error } }));
            }
        }

        loadAllImages() {
            const lazyImages = document.querySelectorAll('[data-src], [data-bg-src]');
            lazyImages.forEach(img => this.loadElement(img));
        }

        disconnect() {
            if (this.observer) {
                this.observer.disconnect();
            }
        }
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


    // Main ImageManager class
    class ImageManager {
        constructor() {
            this.config = { ...DEFAULT_CONFIG };
            this.networkMonitor = new NetworkMonitor();
            this.bandwidthMonitor = new BandwidthMonitor();
            this.imageCache = new LRUImageCache();
            this.imageLoader = new RobustImageLoader(this.config);
            this.lazyLoader = new ViewportAwareLazyLoader(this.config, this.imageCache, this.imageLoader);
            this.initialized = false;
            
            // Subscribe to network changes
            this.networkMonitor.subscribe(this.adaptToNetwork.bind(this));
        }

        adaptToNetwork(networkInfo) {
            const config = { ...this.config };
            
            // Adjust configuration based on network conditions
            switch (networkInfo.effectiveType) {
                case 'slow-2g':
                    config.concurrency = 1;
                    config.retryDelay = 3000;
                    config.timeout = 20000;
                    this.imageLoader.pause();
                    break;
                case '2g':
                    config.concurrency = 2;
                    config.retryDelay = 2000;
                    config.timeout = 15000;
                    this.imageLoader.resume();
                    break;
                case '3g':
                    config.concurrency = 3;
                    config.retryDelay = 1500;
                    config.timeout = 12000;
                    this.imageLoader.resume();
                    break;
                case '4g':
                default:
                    this.imageLoader.resume();
                    break;
            }
            
            // Apply save data mode
            if (networkInfo.saveData) {
                config.concurrency = Math.max(1, Math.floor(config.concurrency / 2));
                this.imageLoader.pause();
            }
            
            // Update config
            this.config = config;
            this.imageLoader.config = config;
        }

        async init(customConfig = {}) {
            // Merge custom config with defaults
            this.config = { ...DEFAULT_CONFIG, ...customConfig };
            
            // Measure bandwidth
            await this.bandwidthMonitor.measureBandwidth();
            
            // Adapt to current network conditions
            const networkInfo = this.networkMonitor.getNetworkInfo();
            this.adaptToNetwork(networkInfo);
            
            // Reinitialize components with new config
            this.imageLoader = new RobustImageLoader(this.config);
            this.lazyLoader = new ViewportAwareLazyLoader(this.config, this.imageCache, this.imageLoader);
            
            // Register service worker
            await this.registerServiceWorker();
            
            this.initialized = true;
            return this;
        }

        getPerformanceMetrics() {
            return {
                cache: this.imageCache.getStats(),
                network: this.networkMonitor.getNetworkInfo(),
                bandwidth: this.bandwidthMonitor.getBandwidth(),
                loader: this.imageLoader.getMetrics(),
                circuitBreakers: this.imageLoader.getCircuitBreakerStates()
            };
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
        getPerformanceMetrics: () => imageManager.getPerformanceMetrics(),
        DEFAULT_CONFIG: DEFAULT_CONFIG
    };
}));
