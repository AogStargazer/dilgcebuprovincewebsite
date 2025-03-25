/**
 * Main Background Switcher
 * 
 * This script handles background image switching for the main/index.html page
 * based on the time of day.
 */

// Define image paths relative to main/index.html
const ROOT_IMAGES_PATH = './images/';  // for root-page elements if used
const MAIN_IMAGES_PATH = 'images/';    // because main/index.html is inside the 'main' folder

// Background image filenames
const DAY_IMAGE = 'Cebu_Capitol_Compound.png';
const NIGHT_IMAGE = 'Cebu_Capitol_Compound_Night.png';

// Time thresholds for day/night switching (24-hour format)
const DAY_START_HOUR = 6;   // 6:00 AM
const NIGHT_START_HOUR = 18; // 6:00 PM

/**
 * Determines if it's currently daytime based on the local time
 * @returns {boolean} True if it's daytime, false if it's nighttime
 */
function isDaytime() {
    const currentHour = new Date().getHours();
    return currentHour >= DAY_START_HOUR && currentHour < NIGHT_START_HOUR;
}

/**
 * Updates the background image for main page elements based on time of day
 */
function updateMainPageBackground() {
    // Select all elements with the 'main-page' class
    const mainPageElements = document.querySelectorAll('.main-page');
    
    // Determine which image to use based on time
    const imageName = isDaytime() ? DAY_IMAGE : NIGHT_IMAGE;
    
    // Add a timestamp for cache-busting
    const timestamp = new Date().getTime();
    const imageUrl = `${MAIN_IMAGES_PATH}${imageName}?t=${timestamp}`;
    
    // Update the background image for each main-page element
    mainPageElements.forEach(element => {
        element.style.backgroundImage = `url('${imageUrl}')`;
    });
}

// Update backgrounds when the document is loaded
document.addEventListener('DOMContentLoaded', updateMainPageBackground);

// Update backgrounds when the window is resized
window.addEventListener('resize', updateMainPageBackground);

// Update backgrounds when the page visibility changes
// (useful when user returns to the tab after it's been in the background)
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        updateMainPageBackground();
    }
});

// Set up an interval to check and update the background periodically
// This ensures the background changes appropriately at day/night transition times
setInterval(updateMainPageBackground, 60000); // Check every minute