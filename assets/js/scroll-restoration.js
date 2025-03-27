/**
 * Enhanced Scroll Restoration Script
 * 
 * This script handles saving and restoring scroll positions when navigating between pages.
 * It uses sessionStorage to persist the scroll position during the current browser session.
 * 
 * Improvements:
 * - Uses requestAnimationFrame for better timing of scroll restoration
 * - Implements a small delay to ensure reliable restoration on slow-loading pages
 * - Includes debug logging (disabled in production)
 * - Enhanced cross-browser compatibility
 */
(function() {
    'use strict';

    // Configuration
    const CONFIG = {
        // Unique key for storing scroll position in sessionStorage
        SCROLL_POSITION_KEY: 'dilg_cebu_page_scroll_position',
        // Small delay in ms to ensure DOM is fully rendered and styled before scrolling
        RESTORATION_DELAY: 50,
        // Enable debug logs (should be set to false in production)
        DEBUG_MODE: true
    };
    
    /**
     * Debug logger function that only logs when DEBUG_MODE is true
     * @param {string} message - The message to log
     * @param {any} data - Optional data to log
     */
    function debugLog(message, data) {
        if (CONFIG.DEBUG_MODE) {
            if (data !== undefined) {
                console.log(`[Scroll Restoration] ${message}`, data);
            } else {
                console.log(`[Scroll Restoration] ${message}`);
            }
        }
    }
    
    /**
     * Gets the current vertical scroll position with cross-browser support
     * @returns {number} The current scroll position
     */
    function getCurrentScrollPosition() {
        return window.scrollY || document.documentElement.scrollTop || document.body.scrollTop || 0;
    }
    
    /**
     * Saves the current vertical scroll position to sessionStorage
     */
    function saveScrollPosition() {
        const scrollPosition = getCurrentScrollPosition();
        debugLog('Saving scroll position', scrollPosition);
        sessionStorage.setItem(CONFIG.SCROLL_POSITION_KEY, scrollPosition.toString());
    }
    
    /**
     * Restores the scroll position from sessionStorage if it exists
     * Uses requestAnimationFrame and a small delay for reliable restoration
     */
    function restoreScrollPosition() {
        const savedPosition = sessionStorage.getItem(CONFIG.SCROLL_POSITION_KEY);
        
        if (savedPosition !== null) {
            const targetPosition = parseInt(savedPosition, 10);
            debugLog('Preparing to restore scroll position', targetPosition);
            
            // Use requestAnimationFrame to ensure the browser has painted before scrolling
            requestAnimationFrame(() => {
                // Add a small delay to ensure styles and images have been applied
                setTimeout(() => {
                    debugLog('Restoring scroll position now', targetPosition);
                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'auto' // Use 'auto' instead of 'smooth' to avoid animation conflicts
                    });
                    
                    // Sometimes a single scroll restoration might not be enough due to dynamic content
                    // This second attempt helps ensure the position is correctly set
                    requestAnimationFrame(() => {
                        window.scrollTo({
                            top: targetPosition,
                            behavior: 'auto'
                        });
                    });
                }, CONFIG.RESTORATION_DELAY);
            });
        } else {
            debugLog('No saved scroll position found');
        }
    }
    
    // Register event listeners
    debugLog('Initializing scroll restoration script');
    
    // Event listener to restore scroll position when the DOM is fully loaded
    document.addEventListener('DOMContentLoaded', function() {
        debugLog('DOMContentLoaded event triggered');
        restoreScrollPosition();
    });
    
    // Event listener to save scroll position before the page is unloaded
    window.addEventListener('beforeunload', function() {
        debugLog('beforeunload event triggered');
        saveScrollPosition();
    });
    
    // Additional event listener for mobile browsers that might not properly trigger beforeunload
    window.addEventListener('pagehide', function() {
        debugLog('pagehide event triggered');
        saveScrollPosition();
    });
    
    // Additional event for single-page applications or AJAX-heavy sites
    window.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'hidden') {
            debugLog('visibilitychange (hidden) event triggered');
            saveScrollPosition();
        }
    });
    
})();
