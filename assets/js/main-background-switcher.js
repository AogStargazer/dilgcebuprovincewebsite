/**
 * Main Background Switcher
 * 
 * This script handles background image switching for the main/index.html page
 * based on the time of day. It's designed to be compatible with other background
 * switchers in the project through a common interface.
 * 
 * @module MainBackgroundSwitcher
 * @author DILG Cebu Province Web Team
 * @version 1.1.0
 */

// Background Switcher Configuration
const BackgroundConfig = {
    // Image paths relative to main/index.html
    paths: {
        main: 'images/',  // because main/index.html is inside the 'main' folder
        root: './images/' // for root-page elements if used
    },
    
    // Background image filenames
    images: {
        day: 'Cebu_Capitol_Compound.png',
        night: 'Cebu_Capitol_Compound_Night.png'
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
     * @returns {string} The complete image URL with cache-busting parameter
     */
    function getBackgroundImageUrl() {
        // Determine which image to use based on time
        let imageName;
        if (isDaytime()) {
            imageName = BackgroundConfig.images.day;
        } else {
            const nightImages = ['Cebu_Capitol_Compound_Night.png', 'Cebu_Capitol_Compound_Night_Alternate.png'];
            imageName = nightImages[Math.floor(Math.random() * nightImages.length)];
        }
        
        // Add a timestamp for cache-busting
        const timestamp = new Date().getTime();
        return `${BackgroundConfig.paths.main}${imageName}?t=${timestamp}`;
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
        // Initial update
        updateBackground();
        
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
