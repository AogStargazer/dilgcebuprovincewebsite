/**
 * Main Background Switcher for GAD
 * 
 * This script handles background image switching for the main/index.html page
 * based on the time of day. It's designed to be compatible with other background
 * switchers in the project through a common interface.
 * 
 * @module MainBackgroundSwitcher
 * @author DILG Cebu Province Web Team
 * @version 1.1.0
 */

// Import the ImageManager utility
// Note: Assumes image-manager.js is loaded before this script

// Background Switcher Configuration
const BackgroundConfig = {
    // Image paths relative to main/index.html
    paths: {
        main: 'images/',  // because main/index.html is inside the 'main' folder
        root: './images/' // for root-page elements if used
    },
    
    // Background image filenames
    images: {
        day: 'Cebu_Capitol_Compound-GAD.png',
        night: 'Cebu_Capitol_Compound_Night-GAD.png'
    },
    
    // Time thresholds for day/night switching (24-hour format)
    timeThresholds: {
        dayStart: 6,   // 6:00 AM
        nightStart: 18 // 6:00 PM
    },
    
    // Update interval in milliseconds
    updateInterval: 60000, // Check every minute
    
    // CSS selector for elements to update
    selector: '.main-page'
};

/**
 * Main Background Switcher Module
 * Handles all background switching functionality for the main page
 */
const MainBackgroundSwitcher = (function() {
    /**
     * Determines if it's currently daytime based on the local time
     * @returns {boolean} True if it's daytime, false if it's nighttime
     */
    function isDaytime() {
        const currentHour = new Date().getHours();
        return currentHour >= BackgroundConfig.timeThresholds.dayStart && 
               currentHour < BackgroundConfig.timeThresholds.nightStart;
    }
    
    /**
     * Gets the appropriate image URL based on time of day
     * @returns {string} The complete image URL without cache-busting
     */
    function getBackgroundImageUrl() {
        // Determine which image to use based on time
        let imageName;
        if (isDaytime()) {
            imageName = BackgroundConfig.images.day;
        } else {
            const nightImages = ['Cebu_Capitol_Compound_Night-GAD.png', 'Cebu_Capitol_Compound_Night_Alternate-GAD.png'];
            imageName = nightImages[Math.floor(Math.random() * nightImages.length)];
        }
        
        // Return clean URL without timestamp (images are preloaded and cached)
        return `${BackgroundConfig.paths.main}${imageName}`;
    }
    
    /**
     * Updates the background image for main page elements based on time of day
     */
    function updateBackground() {
        // Select all elements matching the configured selector
        const elements = document.querySelectorAll(BackgroundConfig.selector);
        
        // Get the appropriate image URL
        const imageUrl = getBackgroundImageUrl();
        
        // Update the background image for each element
        elements.forEach(element => {
            element.style.backgroundImage = `url('${imageUrl}')`;
        });
    }
    
    /**
     * Initializes the background switcher
     */
    function init() {
        // Initialize ImageManager with network-aware configuration
        if (typeof ImageManager !== 'undefined') {
            ImageManager.init({ networkAware: true });
        }
        
        // Gather all image URLs for preloading
        const imageUrls = [
            BackgroundConfig.paths.main + BackgroundConfig.images.day,
            BackgroundConfig.paths.main + BackgroundConfig.images.night,
            BackgroundConfig.paths.main + 'Cebu_Capitol_Compound_Night_Alternate-GAD.png'
        ];
        
        // Subscribe to image completion events for telemetry-based logging
        let firstImageReady = false;
        document.addEventListener('imageComplete', (event) => {
            const { url, loadTime, retries } = event.detail;
            if (imageUrls.includes(url)) {
                console.log(`Background image loaded: ${url} (${loadTime.toFixed(2)}ms, ${retries} retries)`);
                
                // Trigger background update when first critical image is ready
                if (!firstImageReady) {
                    firstImageReady = true;
                    updateBackground();
                }
            }
        });
        
        document.addEventListener('imageError', (event) => {
            const { url, error } = event.detail;
            if (imageUrls.includes(url)) {
                console.error(`Failed to load background image: ${url}`, error);
            }
        });
        
        // Preload images with high priority before starting background switching
        if (typeof ImageManager !== 'undefined') {
            ImageManager.preload(imageUrls, { priority: 'high' })
                .then((results) => {
                    const successCount = results.filter(result => result.status === 'fulfilled').length;
                    const failureCount = results.filter(result => result.status === 'rejected').length;
                    
                    if (successCount > 0) {
                        console.log(`Background images preloaded: ${successCount} successful, ${failureCount} failed`);
                    }
                    
                    // Ensure background is updated even if some images failed
                    if (!firstImageReady) {
                        updateBackground();
                    }
                })
                .catch((error) => {
                    console.error('Critical failure in background image preloading:', error);
                    // Proceed with background switching even if preloading fails
                    updateBackground();
                });
        } else {
            console.warn('ImageManager not available, proceeding without preloading');
            updateBackground();
        }
        
        // Set up event listeners
        document.addEventListener('DOMContentLoaded', updateBackground);
        
        // Update backgrounds when the page visibility changes
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') {
                updateBackground();
            }
        });
        
        // Set up an interval to check and update the background periodically
        setInterval(updateBackground, BackgroundConfig.updateInterval);
    }
    
    // Public API
    return {
        init: init,
        updateBackground: updateBackground,
        isDaytime: isDaytime
    };
})();

// Initialize the background switcher
MainBackgroundSwitcher.init();
