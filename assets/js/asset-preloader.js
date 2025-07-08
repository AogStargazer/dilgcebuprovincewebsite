/**
 * Advanced Asset Preloader with Retry Logic, Concurrency Control, and Network Awareness
 * 
 * UMD module that accepts StandaloneConfig for centralized configuration management.
 * 
 * Configuration via StandaloneConfig.preloader:
 * - maxRetries: Maximum retry attempts per asset (default: 3)
 * - retryDelay: Base delay for exponential backoff in ms (default: 1000)
 * - maxConcurrent: Maximum concurrent preload operations (default: 6)
 * - priorities: Asset type priority mapping (default: font=1, style=2, script=3, image=4)
 * - respectDataSaver: Honor navigator.connection.saveData (default: true)
 * - enableMutationObserver: Watch for dynamically added assets (default: true)
 * - circuitThreshold: Failures before circuit opens (default: 5)
 * - circuitTimeout: Circuit breaker timeout in ms (default: 30000)
 * 
 * Global API (backward compatible):
 * - window.safePreload(url, type): Preload with retry logic
 * - window.preloadAssets(manifest): Preload array of assets with concurrency control
 * - window.collectPageAssets(): Discover assets on current page
 * - window.shouldPreload(): Check if preloading should proceed
 * - window.watchForDynamicAssets(): Enable dynamic asset watching
 * - window.circuitBreaker: Circuit breaker instance for debugging
 * - window.__getPreloadMetrics(): Get preload performance metrics
 * - window.AssetPreloader: Main module export
 * 
 * @module AssetPreloader
 * @version 2.0.0
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD
        define(['StandaloneConfig'], factory);
    } else if (typeof module === 'object' && module.exports) {
        // CommonJS
        module.exports = factory(require('./standalone-config'));
    } else {
        // Browser globals
        root.AssetPreloader = factory(root.StandaloneConfig);
    }
}(typeof self !== 'undefined' ? self : this, function (StandaloneConfig) {
    'use strict';

    // Hard check for the configuration dependency. The script cannot run without it.
    if (!StandaloneConfig) {
        console.error("AssetPreloader FATAL ERROR: StandaloneConfig is not defined. Please ensure standalone-config.js is loaded before asset-preloader.js.");
        return {}; // Return an empty object to prevent further script errors.
    }

    // Get configuration, fallback to global or defaults
    const config = StandaloneConfig || (typeof window !== 'undefined' ? window.StandaloneConfig : null) || {
        autoPreload: true,
        preloader: {
            maxRetries: 3,
            retryDelay: 1000,
            maxConcurrent: 6,
            priorities: { font: 1, style: 2, script: 3, image: 4, fetch: 5 },
            respectDataSaver: true,
            enableMutationObserver: true,
            circuitThreshold: 5,
            circuitTimeout: 30000
        }
    };

    // Configuration with defaults and user overrides (backward compatibility)
    const PRELOAD_CONFIG = Object.assign({}, config.preloader, window.__PRELOAD_CONFIG__ || {});

    // Priority mapping for asset sorting
    const PRIORITY_MAP = PRELOAD_CONFIG.priorities;

    // Deduplication sets
    const preloadedAssets = new Set();
    const failedAssets = new Set();

    // Metrics tracking
    const preloadMetrics = {
        totalAttempts: 0,
        successCount: 0,
        failureCount: 0,
        retryCount: 0,
        averageLoadTime: 0,
        loadTimes: []
    };

    /**
     * Circuit breaker implementation
     */
    const circuitBreaker = {
        failures: new Map(),
        
        shouldBlock(url) {
            const failure = this.failures.get(url);
            if (!failure) return false;
            
            if (failure.count >= PRELOAD_CONFIG.circuitThreshold) {
                const timeSinceLastFailure = Date.now() - failure.lastFailure;
                return timeSinceLastFailure < PRELOAD_CONFIG.circuitTimeout;
            }
            return false;
        },
        
        recordFailure(url) {
            const failure = this.failures.get(url) || { count: 0, lastFailure: 0 };
            failure.count++;
            failure.lastFailure = Date.now();
            this.failures.set(url, failure);
        },
        
        reset(url) {
            this.failures.delete(url);
        }
    };

    /**
     * Track preload metrics
     */
    function trackPreloadMetric(url, success, duration) {
        preloadMetrics.totalAttempts++;
        if (success) {
            preloadMetrics.successCount++;
            preloadMetrics.loadTimes.push(duration);
            preloadMetrics.averageLoadTime = preloadMetrics.loadTimes.reduce((a, b) => a + b, 0) / preloadMetrics.loadTimes.length;
        } else {
            preloadMetrics.failureCount++;
        }
    }

    /**
     * Check if asset should be skipped
     */
    function shouldSkipAsset(url) {
        return preloadedAssets.has(url) || failedAssets.has(url);
    }

    /**
     * Check if preloading should proceed based on network conditions
     */
    function shouldPreload() {
        if (!PRELOAD_CONFIG.respectDataSaver) return true;
        
        if (navigator.connection) {
            if (navigator.connection.saveData) return false;
            if (navigator.connection.effectiveType && 
                ['slow-2g', '2g'].includes(navigator.connection.effectiveType)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Sort assets by priority
     */
    function prioritizeAssets(assets) {
        return assets.sort((a, b) => {
            const typeA = getAssetType(a);
            const typeB = getAssetType(b);
            const priorityA = PRIORITY_MAP[typeA] || 999;
            const priorityB = PRIORITY_MAP[typeB] || 999;
            return priorityA - priorityB;
        });
    }

    /**
     * Core preload function with success/failure tracking
     * @param {string} url - The URL of the asset to preload
     * @param {string} asType - The type of asset ('script', 'style', 'font', 'image')
     * @returns {Promise<boolean>} - Promise that resolves to true/false based on load outcome
     */
function safePreloadCore(url, asType) {
    return new Promise((resolve) => {
        const startTime = performance.now();
        
        try {
            const link = document.createElement('link');
            link.rel = 'preload';
            link.as = asType;
            link.href = url;

            // Add crossorigin for fonts and other cross-origin assets
            if (asType === 'font' || (asType === 'script' && !url.startsWith(location.origin))) {
                link.crossOrigin = 'anonymous';
            }

            link.onload = () => {
                const duration = performance.now() - startTime;
                trackPreloadMetric(url, true, duration);
                resolve(true);
                // Clean up the link element from the head after it has done its job
                link.remove(); 
            };

            link.onerror = () => {
                const duration = performance.now() - startTime;
                trackPreloadMetric(url, false, duration);
                circuitBreaker.recordFailure(url);
                resolve(false);
                link.remove();
            };

            document.head.appendChild(link);

        } catch (error) {
            const duration = performance.now() - startTime;
            trackPreloadMetric(url, false, duration);
            circuitBreaker.recordFailure(url);
            resolve(false);
        }
    });
}

    /**
     * Preload with retry logic and circuit breaker
     * @param {string} url - The URL of the asset to preload
     * @param {string} asType - The type of asset ('script', 'style', 'font', 'image')
     * @returns {Promise<boolean>} - Promise that resolves to true/false based on final outcome
     */
    function safePreloadWithRetry(url, asType) {
        return new Promise(async (resolve) => {
            // Check circuit breaker
            if (circuitBreaker.shouldBlock(url)) {
                resolve(false);
                return;
            }

            let attempt = 0;
            let success = false;

            while (attempt <= PRELOAD_CONFIG.maxRetries && !success) {
                if (attempt > 0) {
                    preloadMetrics.retryCount++;
                    // Exponential backoff
                    const delay = PRELOAD_CONFIG.retryDelay * Math.pow(2, attempt - 1);
                    await new Promise(r => setTimeout(r, delay));
                }

                success = await safePreloadCore(url, asType);
                attempt++;
            }

            resolve(success);
        });
    }

    /**
     * Determine asset type from file extension
     * @param {string} url - The URL to analyze
     * @returns {string} - The asset type ('script', 'style', 'font', 'image')
     */
    function getAssetType(url) {
        const extension = url.split('.').pop().toLowerCase();
        
        if (extension === 'js') {
            return 'script';
        } else if (extension === 'css') {
            return 'style';
        } else if (['woff2', 'woff', 'ttf', 'otf', 'eot'].includes(extension)) {
            return 'font';
        } else if (['png', 'jpg', 'jpeg', 'svg', 'gif', 'webp', 'ico'].includes(extension)) {
            return 'image';
        } else {
            // Default fallback
            return 'fetch';
        }
    }

    /**
     * Preload assets with concurrency control and priority sorting
     * @param {Array<string>} manifest - Array of asset URLs to preload
     * @returns {Promise} - Promise that resolves when all preloads complete
     */
function preloadAssetsWithConcurrency(manifest) {
    if (!Array.isArray(manifest)) {
        return Promise.resolve();
    }

    const filteredAssets = manifest.filter(url => !shouldSkipAsset(url));
    if (filteredAssets.length === 0) {
        return Promise.resolve();
    }

    const prioritizedAssets = prioritizeAssets(filteredAssets);
    const queue = [...prioritizedAssets];

    return new Promise((resolve) => {
        let inFlight = 0;
        let processedCount = 0;

        function processNext() {
            if (processedCount === prioritizedAssets.length) {
                resolve();
                return;
            }

            while (inFlight < PRELOAD_CONFIG.maxConcurrent && queue.length > 0) {
                const url = queue.shift();
                inFlight++;

                const asType = getAssetType(url);
                safePreloadWithRetry(url, asType).then(success => {
                    if (success) {
                        preloadedAssets.add(url);
                        circuitBreaker.reset(url);
                    } else {
                        failedAssets.add(url);
                    }
                }).finally(() => {
                    inFlight--;
                    processedCount++;
                    processNext();
                });
            }
        }

        processNext();
    });
}

    /**
     * Preload all assets from manifest (backward compatible wrapper)
     * @param {Array<string>} manifest - Array of asset URLs to preload
     * @returns {Promise} - Promise that resolves when all preloads complete
     */
    function preloadAssets(manifest) {
        if (!shouldPreload()) {
            return Promise.resolve();
        }
        
        return preloadAssetsWithConcurrency(manifest);
    }

    /**
     * Extract assets from a single DOM element
     * @param {Element} element - DOM element to scan
     * @returns {Array<string>} - Array of asset URLs found
     */
    function extractAssetsFromElement(element) {
        const urls = [];
        
        // Check common attributes
        const url = element.src || element.href || element.data;
        if (url && !url.startsWith('data:') && !url.startsWith('javascript:')) {
            try {
                const absoluteUrl = new URL(url, location.href).href;
                if (absoluteUrl.startsWith(location.origin) || !url.includes('://')) {
                    urls.push(absoluteUrl);
                }
            } catch (e) {
                // Skip invalid URLs
            }
        }
        
        // Handle srcset
        if (element.srcset) {
            element.srcset.split(',').forEach(srcsetItem => {
                const srcUrl = srcsetItem.trim().split(' ')[0];
                if (srcUrl && !srcUrl.startsWith('data:')) {
                    try {
                        const absoluteUrl = new URL(srcUrl, location.href).href;
                        if (absoluteUrl.startsWith(location.origin) || !srcUrl.includes('://')) {
                            urls.push(absoluteUrl);
                        }
                    } catch (e) {
                        // Skip invalid URLs
                    }
                }
            });
        }
        
        // Handle style attribute
        if (element.style && element.getAttribute('style')) {
            const style = element.getAttribute('style');
            const urlMatches = style.match(/url\(['"]?([^'")]+)['"]?\)/g);
            if (urlMatches) {
                urlMatches.forEach(match => {
                    const url = match.replace(/url\(['"]?([^'")]+)['"]?\)/, '$1');
                    if (url && !url.startsWith('data:')) {
                        try {
                            const absoluteUrl = new URL(url, location.href).href;
                            if (absoluteUrl.startsWith(location.origin) || !url.includes('://')) {
                                urls.push(absoluteUrl);
                            }
                        } catch (e) {
                            // Skip invalid URLs
                        }
                    }
                });
            }
        }
        
        return urls;
    }

    /**
     * Watch for dynamically added assets using MutationObserver
     */
    function watchForDynamicAssets() {
        // Disconnect any existing observer to prevent duplicates
        if (AssetPreloader.observer) {
            AssetPreloader.observer.disconnect();
        }
        if (!PRELOAD_CONFIG.enableMutationObserver || typeof MutationObserver === 'undefined') {
            return;
        }

        const observer = new MutationObserver((mutations) => {
            const newAssets = [];
            
            mutations.forEach((mutation) => {
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        // Check the node itself
                        newAssets.push(...extractAssetsFromElement(node));
                        
                        // Check child elements
                        const childElements = node.querySelectorAll && node.querySelectorAll('*');
                        if (childElements) {
                            childElements.forEach(child => {
                                newAssets.push(...extractAssetsFromElement(child));
                            });
                        }
                    }
                });
            });
            
            if (newAssets.length > 0) {
                preloadAssets(newAssets);
            }
        });

        AssetPreloader.observer = observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    /**
     * Collect all assets referenced on the current page (enhanced version)
     * Scans DOM elements, inline styles, CSSOM, @import rules, and preconnect hints
     * @returns {Array<string>} - De-duplicated array of asset URLs
     * 
     * @warning This function can be performance-intensive on large, complex pages.
     * For production sites, generating a server-side asset manifest is a more performant pattern.
     */
    function collectAdvancedAssets(logPerformance = false) {
        const assetUrls = new Set();
        if (logPerformance) performance.mark('asset-collection:start');
        
        try {
            // 1. Scan DOM elements for src/href attributes
            if (logPerformance) performance.mark('asset-collection:dom-scan:start');
            const selectors = [
                'link[href]',           // CSS, icons, etc.
                'script[src]',          // JavaScript files
                'img[src]',             // Images
                'img[srcset]',          // Responsive images
                'video[src]',           // Video sources
                'audio[src]',           // Audio sources
                'source[src]',          // Media sources
                'source[srcset]',       // Responsive media sources
                'object[data]',         // Object data
                'embed[src]',           // Embedded content
                'iframe[src]'           // Iframes (same-origin only)
            ];
            
            selectors.forEach(selector => {
                try {
                    document.querySelectorAll(selector).forEach(element => {
                        extractAssetsFromElement(element).forEach(url => assetUrls.add(url));
                    });
                } catch (e) {
                    // Skip if selector fails
                }
            });
            if (logPerformance) {
                performance.mark('asset-collection:dom-scan:end');
                performance.measure('Asset Collection: DOM Scan', 'asset-collection:dom-scan:start', 'asset-collection:dom-scan:end');
            }
            
            // 2. Scan inline style attributes for url() references
            if (logPerformance) performance.mark('asset-collection:style-attr:start');
            try {
                document.querySelectorAll('[style]').forEach(element => {
                    extractAssetsFromElement(element).forEach(url => assetUrls.add(url));
                });
            } catch (e) {
                console.warn('Asset Preloader: Error scanning inline styles.', e);
            }
            if (logPerformance) {
                performance.mark('asset-collection:style-attr:end');
                performance.measure('Asset Collection: Style Attributes', 'asset-collection:style-attr:start', 'asset-collection:style-attr:end');
            }
            
            // 3. Scan <style> tags for @import rules
            if (logPerformance) performance.mark('asset-collection:style-tag:start');
            try {
                document.querySelectorAll('style').forEach(styleElement => {
                    const cssText = styleElement.textContent || styleElement.innerText || '';
                    const importMatches = cssText.match(/@import\s+(?:url\()?['"]?([^'")]+)['"]?\)?/g);
                    if (importMatches) {
                        importMatches.forEach(match => {
                            const url = match.replace(/@import\s+(?:url\()?['"]?([^'")]+)['"]?\)?/, '$1');
                            if (url && !url.startsWith('data:')) {
                                try {
                                    const absoluteUrl = new URL(url, location.href).href;
                                    if (absoluteUrl.startsWith(location.origin) || !url.includes('://')) {
                                        assetUrls.add(absoluteUrl);
                                    }
                                } catch (e) {
                                    // Skip invalid URLs
                                }
                            }
                        });
                    }
                });
            } catch (e) {
                console.warn('Asset Preloader: Error scanning <style> tags.', e);
            }
            if (logPerformance) {
                performance.mark('asset-collection:style-tag:end');
                performance.measure('Asset Collection: Style Tags', 'asset-collection:style-tag:start', 'asset-collection:style-tag:end');
            }
            
            // 4. Scan CSSOM for url() references and @font-face rules
            if (logPerformance) performance.mark('asset-collection:cssom:start');
            try {
                Array.from(document.styleSheets).forEach(styleSheet => {
                    try {
                        // Skip cross-origin stylesheets to avoid SecurityError
                        if (styleSheet.href && !styleSheet.href.startsWith(location.origin)) {
                            return;
                        }
                        
                        Array.from(styleSheet.cssRules || []).forEach(rule => {
                            try {
                                // Check regular CSS rules for url() references
                                if (rule.style) {
                                    const cssText = rule.style.cssText;
                                    const urlMatches = cssText.match(/url\(['"]?([^'")]+)['"]?\)/g);
                                    if (urlMatches) {
                                        urlMatches.forEach(match => {
                                            const url = match.replace(/url\(['"]?([^'")]+)['"]?\)/, '$1');
                                            if (url && !url.startsWith('data:')) {
                                                try {
                                                    const absoluteUrl = new URL(url, location.href).href;
                                                    if (absoluteUrl.startsWith(location.origin) || !url.includes('://')) {
                                                        assetUrls.add(absoluteUrl);
                                                    }
                                                } catch (e) {
                                                    // Skip invalid URLs
                                                }
                                            }
                                        });
                                    }
                                }
                                
                                // Check @font-face rules specifically
                                if (rule.type === CSSRule.FONT_FACE_RULE && rule.style.src) {
                                    const srcValue = rule.style.src;
                                    const urlMatches = srcValue.match(/url\(['"]?([^'")]+)['"]?\)/g);
                                    if (urlMatches) {
                                        urlMatches.forEach(match => {
                                            const url = match.replace(/url\(['"]?([^'")]+)['"]?\)/, '$1');
                                            if (url && !url.startsWith('data:')) {
                                                try {
                                                    const absoluteUrl = new URL(url, location.href).href;
                                                    if (absoluteUrl.startsWith(location.origin) || !url.includes('://')) {
                                                        assetUrls.add(absoluteUrl);
                                                    }
                                                } catch (e) {
                                                    // Skip invalid URLs
                                                }
                                            }
                                        });
                                    }
                                }
                            } catch (e) {
                                // Skip individual rules that cause errors
                            }
                        });
                    } catch (e) {
                        // Skip stylesheets that cause SecurityError or other issues
                    }
                });
            } catch (e) {
                console.warn('Asset Preloader: Error scanning document.styleSheets.', e);
            }
            if (logPerformance) {
                performance.mark('asset-collection:cssom:end');
                performance.measure('Asset Collection: CSSOM', 'asset-collection:cssom:start', 'asset-collection:cssom:end');
            }
            
            // 5. Harvest domains from preconnect hints for potential DNS prefetch
            // This part is for future optimization and does not add URLs to the preload list directly.
            if (logPerformance) performance.mark('asset-collection:preconnect:start');
            try {
                document.querySelectorAll('link[rel="preconnect"]').forEach(link => {
                    if (link.href) {
                        try {
                            const url = new URL(link.href);
                            // Could potentially prefetch common assets from these domains
                            // For now, just ensure they're in our awareness
                        } catch (e) {
                            // Skip invalid preconnect URLs
                        }
                    }
                });
            } catch (e) {
                console.warn('Asset Preloader: Error scanning preconnect links.', e);
            }
            if (logPerformance) {
                performance.mark('asset-collection:preconnect:end');
                performance.measure('Asset Collection: Preconnect Scan', 'asset-collection:preconnect:start', 'asset-collection:preconnect:end');
            }
            
        } catch (e) {
            // Gracefully handle any unexpected errors
            console.error('Asset Preloader: A critical error occurred during asset collection.', e);
        }
        
        if (logPerformance) {
            performance.mark('asset-collection:end');
            performance.measure('Asset Collection: Total', 'asset-collection:start', 'asset-collection:end');

            const measures = performance.getEntriesByType('measure');
            console.groupCollapsed(`Asset Preloader Performance Report (${measures.find(m => m.name === 'Asset Collection: Total')?.duration.toFixed(2) || 'N/A'}ms)`);
            measures.forEach(measure => {
                if (measure.name.startsWith('Asset Collection:')) {
                    console.log(`- ${measure.name.replace('Asset Collection: ', '')}: ${measure.duration.toFixed(2)}ms`);
                }
            });
            console.groupEnd();
            performance.clearMeasures();
        }
        
        return Array.from(assetUrls);
    }

    /**
     * Auto-preload assets detected from the current page (enhanced version)
     * Falls back to window.__ASSET_MANIFEST__ if no assets are found
     * This function is called automatically on DOMContentLoaded if config.autoPreload is true
     * 
     * The new strategy prioritizes a static `window.__ASSET_MANIFEST__` for performance.
     * If the manifest is present, the slow dynamic asset collection is skipped entirely.
     */
    function autoPreload() {
        // Check if auto-preload is disabled via config
        if (!config.autoPreload || !shouldPreload()) {
            return;
        }

        let assetList = [];

        // PRIORITY 1: Use a static manifest. This is the fastest and most reliable method.
        if (Array.isArray(window.__ASSET_MANIFEST__) && window.__ASSET_MANIFEST__.length > 0) {
            assetList = [...window.__ASSET_MANIFEST__];
            console.log(`Asset preloader: Using static manifest with ${assetList.length} assets.`);
        } 
        // PRIORITY 2: Fallback to slow dynamic collection if no manifest is found.
        else {
            // Call with diagnostics enabled. The function will handle its own logging.
            assetList = collectAdvancedAssets(true);
        }
        
        if (assetList.length > 0) {
            preloadAssets(assetList);
        }
        
        // Enable dynamic asset watching if configured
        // This should always wait for the DOM to be ready before attaching.
        if (PRELOAD_CONFIG.enableMutationObserver) {
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', watchForDynamicAssets);
            } else {
                watchForDynamicAssets();
            }
        }
    }

    // Create the main AssetPreloader module object
    const AssetPreloader = {
        // Core functionality
        safePreload: safePreloadWithRetry,
        preloadAssets: preloadAssets,
        collectPageAssets: collectAdvancedAssets,
        
        // Control and utility functions
        shouldPreload: shouldPreload,
        watchForDynamicAssets: watchForDynamicAssets,
        autoPreload: autoPreload,
        observer: null, // To hold the MutationObserver instance
        
        // Configuration and debugging
        getConfig: () => ({...PRELOAD_CONFIG}),
        getMetrics: () => ({...preloadMetrics}),
        getCircuitBreaker: () => circuitBreaker,
        
        // Initialization
        init: function(options) {
            if (options && typeof options === 'object') {
                Object.assign(PRELOAD_CONFIG, options);
            }
            autoPreload();
            return this;
        },
        
        // Manual control
        start: autoPreload,
        stop: function() {
            if (this.observer) {
                this.observer.disconnect();
            }
            return this;
        }
    };

    // Expose functions globally for backward compatibility
    if (typeof window !== 'undefined') {
        window.safePreload = safePreloadWithRetry;
        window.preloadAssets = preloadAssets;
        window.collectPageAssets = collectAdvancedAssets; // Backward compatible alias
        
        // Additional debugging and control APIs
        window.shouldPreload = shouldPreload;
        window.watchForDynamicAssets = watchForDynamicAssets;
        window.circuitBreaker = circuitBreaker;
        window.__getPreloadMetrics = () => ({...preloadMetrics});
        
        // Main module export
        window.AssetPreloader = AssetPreloader;
    }
    
    // Auto-preload assets when DOM is ready (only if autoPreload is enabled)
    // This enables automatic asset detection without requiring manual manifest setup
    // Manual calls to preloadAssets() will still work as before
    // The script should be placed in the <head> for best performance.
    if (typeof document !== 'undefined') {
        // Run immediately if auto-preload is enabled.
        // Using a timeout ensures this runs after the current script execution stack clears,
        // allowing an inline __ASSET_MANIFEST__ to be defined and read correctly.
        if (config.autoPreload) {
            setTimeout(autoPreload, 0);
        }
    }

    // Return the module for UMD
    return AssetPreloader;

}));
