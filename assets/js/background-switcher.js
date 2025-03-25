/**
 * background-switcher.js
 * 
 * This script dynamically changes the background images based on the time of day in the Philippines.
 * It switches between daytime and nighttime images for elements with classes 'root-page' and 'main-page'.
 */

// Execute when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    updateBackgroundBasedOnTime();
});

/**
 * Gets the current hour in Philippines time (Asia/Manila timezone)
 * @returns {number} The current hour (0-23)
 */
function getCurrentPhilippinesHour() {
    // Create a date object with the current time
    const now = new Date();
    
    // Convert to Philippines time (UTC+8)
    // Note: This assumes the user's system clock is set correctly
    // For more precise timezone handling, a library like moment-timezone could be used
    const philippinesTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    
    // Return the hour in 24-hour format (0-23)
    return philippinesTime.getHours();
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
 * Updates the background images of elements with classes 'root-page' and 'main-page'
 * based on whether it's currently daytime or nighttime
 */
function updateBackgroundBasedOnTime() {
    // Determine if it's daytime or nighttime
    function updateBackgroundBasedOnTime() {
        const daytime = isDaytime();
    
    // Select all elements with the specified classes
    const rootPageElements = document.querySelectorAll('.root-page');
    const mainPageElements = document.querySelectorAll('.main-page');
    
    // Set the appropriate background image paths based on time of day
    const rootBackgroundImage = daytime 
        ? './images/Cebu_Capitol_Compound.png' 
        : './images/Cebu_Capitol_Compound_Night.png';
    
    const mainBackgroundImage = daytime 
        ? './main/images/Cebu_Capitol_Compound.png' 
        : './main/images/Cebu_Capitol_Compound_Night.png';
    
    // Add cache-busting query parameter to prevent caching issues
    const timestamp = `?v=${Date.now()}`;

    // Apply background images
    document.querySelectorAll('.root-page').forEach(element => {
        element.style.backgroundImage = `url('${rootBackgroundImage + timestamp}')`;
    });

    document.querySelectorAll('.main-page').forEach(element => {
        element.style.backgroundImage = `url('${mainBackgroundImage + timestamp}')`;
    });

    console.log(`Background updated: ${daytime ? 'Daytime' : 'Nighttime'} mode.`);
}
