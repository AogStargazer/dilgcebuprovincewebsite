/**
 * background-switcher.js
 * Dynamically changes background images based on the time in the Philippines.
 */

// Base paths for background images based on page location
const ROOT_IMAGES_PATH = './images/';
const MAIN_IMAGES_PATH = '../images/';

// Execute when the DOM is fully loaded
document.addEventListener('DOMContentLoaded', function() {
    updateBackgroundBasedOnTime();
});

/**
 * Gets the current hour in Philippines time (Asia/Manila timezone)
 * @returns {number} The current hour (0-23)
 */
function getCurrentPhilippinesHour() {
    const now = new Date();
    const philippinesTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
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
 * Updates the background images based on time of day
 */
function updateBackgroundBasedOnTime() {
    const daytime = isDaytime();
    const timestamp = `?v=${Date.now()}`;

    document.querySelectorAll('.root-page, .main-page').forEach(element => {
        // Determine which base path to use based on the element's class
        let basePath;
        if (element.classList.contains('root-page')) {
            basePath = ROOT_IMAGES_PATH;
        } else if (element.classList.contains('main-page')) {
            basePath = MAIN_IMAGES_PATH;
        }

        // Set the appropriate image based on time of day
        const backgroundImage = daytime 
            ? basePath + 'Cebu_Capitol_Compound.png' 
            : basePath + 'Cebu_Capitol_Compound_Night.png';

        // Apply the background image with cache-busting timestamp
        element.style.backgroundImage = `url('${backgroundImage + timestamp}')`;
    });

    console.log(`Background updated: ${daytime ? 'Daytime' : 'Nighttime'} mode.`);
}
