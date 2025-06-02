// Image preloader utility module
const ImagePreloader = (() => {
    // In-memory cache to store loaded images
    const cache = {};

    /**
     * Preloads images and returns a promise that resolves with an array of HTMLImageElement objects
     * @param {string[]} urls - Array of image URLs to preload
     * @returns {Promise<HTMLImageElement[]>} Promise that resolves with loaded images
     */
    function preloadImages(urls) {
        const promises = urls.map(url => {
            // Return cached image if already loaded
            if (cache[url]) {
                return Promise.resolve(cache[url]);
            }

            // Create new promise for loading the image
            return new Promise((resolve, reject) => {
                const img = new Image();
                
                img.onload = () => {
                    // Cache the loaded image
                    cache[url] = img;
                    resolve(img);
                };
                
                img.onerror = () => {
                    reject(new Error(`Failed to load image: ${url}`));
                };
                
                // Start loading the image
                img.src = url;
            });
        });

        return Promise.all(promises);
    }

    // Export the preloadImages function
    return {
        preloadImages
    };
})();

// Make it available globally or as a module
if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImagePreloader;
} else {
    window.ImagePreloader = ImagePreloader;
}