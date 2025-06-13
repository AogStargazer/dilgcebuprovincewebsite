/**
 * Standalone Configuration Module
 * 
 * This module provides centralized configuration for all image management,
 * background switching, asset preloading, and service worker functionality.
 * 
 * Usage in other repositories:
 * 1. Copy the entire assets/js folder to your repository
 * 2. Include this config file first: <script src="assets/js/standalone-config.js"></script>
 * 3. Optionally override values: window.StandaloneConfig.basePath = '/your-path/';
 * 4. Load other scripts: image-manager.js, background-switcher.js, etc.
 * 5. Initialize: ImageManager.init() or let auto-initialization handle it
 * 
 * Override Examples:
 * // Override base path for subdirectory deployment
 * window.StandaloneConfig.basePath = '/subdirectory/';
 * 
 * // Override image directory
 * window.StandaloneConfig.imageDir = 'assets/images/';
 * 
 * // Disable auto-initialization
 * window.StandaloneConfig.autoInit = false;
 * 
 * // Override background image paths
 * window.StandaloneConfig.background.rootPath = './assets/images/';
 * window.StandaloneConfig.background.mainPath = '../assets/images/';
 * 
 * @module StandaloneConfig
 * @version 1.0.0
 */

(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        // CommonJS
        module.exports = factory();
    } else {
        // Browser globals
        root.StandaloneConfig = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /**
     * Default configuration object with all tunable values
     */
    const config = {
        // Base path for all assets (useful for subdirectory deployments)
        basePath: '',
        
        // Image directory relative to basePath
        imageDir: 'images/',
        
        // Service worker configuration
        serviceWorkerPath: '/assets/js/service-worker.js',
        
        // Auto-initialization flags
        autoInit: true,        // Auto-initialize ImageManager on DOM ready
        autoPreload: true,     // Auto-preload discovered assets
        
        // ImageManager configuration
        imageManager: {
            concurrency: 4,
            timeout: 10000,
            retryCount: 3,
            retryDelay: 1000,
            placeholder: 'placeholder.svg',    // Will be prefixed with basePath + imageDir
            errorImage: 'error.svg',           // Will be prefixed with basePath + imageDir
            rootMargin: '200px',
            fadeInClass: 'img-loaded'
        },
        
        // Background switcher configuration
        background: {
            // Paths for different page contexts
            rootPath: './images/',      // For landing/root page elements
            mainPath: '../images/',     // For inner page elements
            
            // Image filenames
            daytimeImage: 'Cebu_Capitol_Compound.png',
            nighttimeImage: 'Cebu_Capitol_Compound_Night.png',
            nighttimeImages: [
                'Cebu_Capitol_Compound_Night.png',
                'Cebu_Capitol_Compound_Night_Alternate.png'
            ],
            
            // Time thresholds (24-hour format)
            dayStart: 6,    // 6:00 AM
            nightStart: 18, // 6:00 PM
            
            // Update interval in milliseconds
            updateInterval: 60000, // Check every minute
            
            // CSS selectors for elements to update
            selectors: {
                root: '.root-page',
                main: '.main-page',
                combined: '.root-page, .main-page'
            }
        },
        
        // Asset preloader configuration
        preloader: {
            maxRetries: 3,
            retryDelay: 1000,
            maxConcurrent: 6,
            priorities: { 
                font: 1, 
                style: 2, 
                script: 3, 
                image: 4, 
                fetch: 5 
            },
            respectDataSaver: true,
            enableMutationObserver: true,
            circuitThreshold: 5,
            circuitTimeout: 30000
        },
        
        // Service worker cache configuration
        cache: {
            names: {
                critical: 'image-cache-critical-v1',
                dynamic: 'image-cache-dynamic-v1',
                fallback: 'image-cache-fallback-v1'
            },
            
            // Critical images that should always be cached
            criticalImages: [
                'placeholder.svg',
                'error.svg'
            ],
            
            maxDynamicSize: 100,
            maxAgeMs: 7 * 24 * 60 * 60 * 1000, // 7 days
            staleWhileRevalidateAgeMs: 24 * 60 * 60 * 1000, // 1 day
            
            retryConfig: {
                maxRetries: 3,
                baseDelay: 1000,
                maxDelay: 10000
            },
            
            networkTimeout: {
                'slow-2g': 20000,
                '2g': 15000,
                '3g': 10000,
                '4g': 8000,
                'default': 8000
            },
            
            // Skip precaching critical images (useful for repos that don't need PWA features)
            skipPrecache: false
        },
        
        // Network adaptation settings
        network: {
            adaptToConnection: true,
            saveDataMode: true,
            
            // Connection-specific overrides
            connectionSettings: {
                'slow-2g': {
                    concurrency: 1,
                    retryDelay: 3000,
                    timeout: 20000,
                    pauseLoading: true
                },
                '2g': {
                    concurrency: 2,
                    retryDelay: 2000,
                    timeout: 15000,
                    pauseLoading: false
                },
                '3g': {
                    concurrency: 3,
                    retryDelay: 1500,
                    timeout: 12000,
                    pauseLoading: false
                },
                '4g': {
                    // Use defaults
                    pauseLoading: false
                }
            }
        }
    };
    
    /**
     * Helper function to get full image path
     * @param {string} imageName - The image filename
     * @returns {string} - Full path to the image
     */
    config.getImagePath = function(imageName) {
        return this.basePath + this.imageDir + imageName;
    };
    
    /**
     * Helper function to get background image path for specific context
     * @param {string} imageName - The image filename
     * @param {string} context - 'root' or 'main'
     * @returns {string} - Full path to the background image
     */
    config.getBackgroundPath = function(imageName, context) {
        const basePath = context === 'main' ? this.background.mainPath : this.background.rootPath;
        return basePath + imageName;
    };
    
    /**
     * Helper function to get all critical image paths for service worker
     * @returns {Array<string>} - Array of critical image paths
     */
    config.getCriticalImagePaths = function() {
        return this.cache.criticalImages.map(imageName => this.getImagePath(imageName));
    };
    
    /**
     * Helper function to merge user overrides with defaults
     * @param {Object} overrides - User configuration overrides
     * @returns {Object} - Merged configuration
     */
    config.merge = function(overrides) {
        if (!overrides || typeof overrides !== 'object') {
            return this;
        }
        
        // Deep merge function
        function deepMerge(target, source) {
            const result = { ...target };
            
            for (const key in source) {
                if (source.hasOwnProperty(key)) {
                    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                        result[key] = deepMerge(target[key] || {}, source[key]);
                    } else {
                        result[key] = source[key];
                    }
                }
            }
            
            return result;
        }
        
        return deepMerge(this, overrides);
    };
    
    /**
     * Helper function to validate configuration
     * @returns {Array<string>} - Array of validation warnings
     */
    config.validate = function() {
        const warnings = [];
        
        // Check required paths
        if (!this.imageDir) {
            warnings.push('imageDir is required');
        }
        
        if (!this.serviceWorkerPath) {
            warnings.push('serviceWorkerPath is required for PWA features');
        }
        
        // Check background paths
        if (!this.background.rootPath || !this.background.mainPath) {
            warnings.push('background.rootPath and background.mainPath are required');
        }
        
        // Check critical images
        if (!Array.isArray(this.cache.criticalImages) || this.cache.criticalImages.length === 0) {
            warnings.push('cache.criticalImages should be a non-empty array');
        }
        
        // Check time thresholds
        if (this.background.dayStart >= this.background.nightStart) {
            warnings.push('background.dayStart should be less than background.nightStart');
        }
        
        return warnings;
    };
    
    /**
     * Helper function to get current environment info
     * @returns {Object} - Environment information
     */
    config.getEnvironmentInfo = function() {
        return {
            userAgent: navigator.userAgent,
            language: navigator.language,
            platform: navigator.platform,
            cookieEnabled: navigator.cookieEnabled,
            onLine: navigator.onLine,
            connection: navigator.connection ? {
                effectiveType: navigator.connection.effectiveType,
                downlink: navigator.connection.downlink,
                rtt: navigator.connection.rtt,
                saveData: navigator.connection.saveData
            } : null,
            screen: {
                width: screen.width,
                height: screen.height,
                pixelRatio: window.devicePixelRatio || 1
            },
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            }
        };
    };
    
    return config;
}));