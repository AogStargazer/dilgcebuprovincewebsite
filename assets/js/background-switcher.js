/**
 * background-switcher.js
 * Dynamically changes background images based on the time in the Philippines.
 * This script handles both the landing page and main site pages by detecting
 * the appropriate image path based on page location.
 */

// Base paths for background images based on page location
const ROOT_IMAGES_PATH = './images/';  // For landing/root page
const MAIN_IMAGES_PATH = '../images/'; // For inner pages

// Image filenames
const DAYTIME_IMAGE = 'Cebu_Capitol_Compound.png';
const NIGHTTIME_IMAGE = 'Cebu_Capitol_Compound_Night.png';
const NIGHTTIME_IMAGES = ['Cebu_Capitol_Compound_Night.png', 'Cebu_Capitol_Compound_Night_Alternate.png'];

// Execute when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    try {
        updateBackgroundBasedOnTime();
    } catch (error) {
        console.error('Error updating background:', error);
    }
});

/**
 * Gets the current hour in Philippines time (Asia/Manila timezone)
 * @returns {number} The current hour (0-23)
 */
function getCurrentPhilippinesHour() {
    try {
        const now = new Date();
        const philippinesTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
        return philippinesTime.getHours();
    } catch (error) {
        console.error('Error getting Philippines time:', error);
        // Fallback to local time if timezone conversion fails
        return new Date().getHours();
    }
}

/**
 * Determines if it's currently daytime in the Philippines
 * Daytime is defined as between 6:00 AM (inclusive) and 6:00 PM (exclusive)
 * @returns {boolean} True if it's daytime, false if it's nighttime
 */
function isDaytime() {
    const currentHour = getCurrentPhilippinesHour();
    return currentHour >= 6 && currentHour < 18;
}

/**
 * Updates the background images based on time of day
 * Uses a cache-busting timestamp to ensure fresh images are loaded
 * when the time of day changes (prevents browser caching issues)
 */
function updateBackgroundBasedOnTime() {
    const isDaytimeNow = isDaytime();
    // Cache-busting parameter to force browser to reload images when they change
    const cacheParam = `?v=${Date.now()}`;
    
    // Find all elements that need background updates
    document.querySelectorAll('.root-page, .main-page').forEach(element => {
        // Determine which base path to use based on the element's class
        let imagePath;
        if (element.classList.contains('root-page')) {
            imagePath = ROOT_IMAGES_PATH;
        } else if (element.classList.contains('main-page')) {
            imagePath = MAIN_IMAGES_PATH;
        } else {
            console.warn('Element has neither root-page nor main-page class:', element);
            return; // Skip this element
        }

        // Select the appropriate image based on time of day
        const imageFile = isDaytimeNow ? DAYTIME_IMAGE : NIGHTTIME_IMAGES[Math.floor(Math.random() * NIGHTTIME_IMAGES.length)];
        const fullImagePath = imagePath + imageFile;
        
        try {
            // Apply the background image with cache-busting parameter
            element.style.backgroundImage = `url('${fullImagePath + cacheParam}')`;
        } catch (error) {
            console.error('Failed to set background image:', error);
        }
    });

    console.log(`Background updated: ${isDaytimeNow ? 'Daytime' : 'Nighttime'} mode.`);
}
