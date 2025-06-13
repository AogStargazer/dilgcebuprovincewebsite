# Portability Guide

This document explains how to integrate the DILG Cebu Province website's JavaScript modules into other repositories while maintaining clean separation between library code and project-specific configuration.

## Overview

The JavaScript modules in this repository have been designed with portability in mind. All configuration values (image paths, cache names, DOM selectors, etc.) are centralized in a single configuration module, allowing easy integration into other projects without modifying the core library code.

## Integration Steps

### 1. Copy the JavaScript Assets

Copy the entire `assets/js` folder from this repository to your target repository:

```
your-repo/
├── assets/
│   └── js/
│       ├── standalone-config.js
│       ├── image-manager.js
│       ├── main-background-switcher.js
│       ├── background-switcher.js
│       ├── asset-preloader.js
│       └── service-worker.js
```

### 2. Include the Configuration Module

Add the configuration script early in your HTML, before any other JavaScript modules:

```html
<script src="assets/js/standalone-config.js"></script>
```

### 3. Override Configuration (Optional)

If your repository has different paths, selectors, or requirements, override the configuration values after loading the config module but before loading other scripts:

```html
<script src="assets/js/standalone-config.js"></script>
<script>
// Override configuration for your repository
window.StandaloneConfig.basePath = '/your-base-path/';
window.StandaloneConfig.imageDir = 'assets/images/';
window.StandaloneConfig.background.rootPath = 'assets/images/backgrounds/root/';
window.StandaloneConfig.background.mainPath = 'assets/images/backgrounds/main/';
window.StandaloneConfig.selectors.rootPage = '.your-root-selector';
window.StandaloneConfig.selectors.mainPage = '.your-main-selector';
</script>
```

### 4. Load Core Modules

Load the image manager first, followed by any background switcher modules:

```html
<!-- Core image management -->
<script src="assets/js/image-manager.js"></script>

<!-- Background switching (choose one or both based on your needs) -->
<script src="assets/js/main-background-switcher.js"></script>
<script src="assets/js/background-switcher.js"></script>

<!-- Asset preloading (optional) -->
<script src="assets/js/asset-preloader.js"></script>
```

### 5. Register Service Worker (Optional)

If your repository supports Progressive Web App (PWA) features, register the service worker:

```html
<script>
// Register service worker for offline functionality
if ('serviceWorker' in navigator && window.ImageManager) {
    ImageManager.registerServiceWorker();
}
</script>
```

### 6. Initialize Modules

Initialize the modules with any additional options:

```html
<script>
// Initialize background switcher if loaded
if (window.MainBackgroundSwitcher) {
    MainBackgroundSwitcher.init({
        // Additional options can be passed here
        autoStart: true
    });
}

// Initialize asset preloader if loaded
if (window.AssetPreloader && window.StandaloneConfig.autoPreload !== false) {
    // Preloader will auto-initialize based on configuration
}
</script>
```

## Configuration Options

The `StandaloneConfig` object supports the following customizable properties:

### Basic Paths
- `basePath`: Base path for all assets (default: `''`)
- `imageDir`: Directory containing images (default: `'images/'`)
- `serviceWorkerPath`: Path to service worker file (default: `'/assets/js/service-worker.js'`)

### Background Images
- `background.rootPath`: Path to root page backgrounds
- `background.mainPath`: Path to main page backgrounds
- `background.images`: Array of background image filenames

### DOM Selectors
- `selectors.rootPage`: CSS selector for root page elements
- `selectors.mainPage`: CSS selector for main page elements

### Caching Configuration
- `cache.staticName`: Name for static cache
- `cache.dynamicName`: Name for dynamic cache
- `cache.maxDynamicSize`: Maximum number of dynamic cache entries

### Preloader Settings
- `preloader.concurrency`: Number of concurrent image loads
- `preloader.retryDelay`: Delay between retry attempts (ms)
- `preloader.maxRetries`: Maximum retry attempts per image

### Feature Flags
- `autoInit`: Auto-initialize modules on DOM ready (default: `true`)
- `autoPreload`: Auto-start asset preloading (default: `true`)
- `skipPrecache`: Skip service worker precaching (default: `false`)

## Example Complete Integration

```html
<!DOCTYPE html>
<html>
<head>
    <title>Your Repository</title>
    <!-- Load configuration first -->
    <script src="assets/js/standalone-config.js"></script>
    <script>
        // Customize for your repository
        window.StandaloneConfig.basePath = '/my-site/';
        window.StandaloneConfig.imageDir = 'assets/img/';
        window.StandaloneConfig.background.rootPath = 'assets/img/bg/root/';
        window.StandaloneConfig.selectors.rootPage = '.homepage';
    </script>
</head>
<body>
    <!-- Your content here -->
    
    <!-- Load modules -->
    <script src="assets/js/image-manager.js"></script>
    <script src="assets/js/background-switcher.js"></script>
    <script src="assets/js/asset-preloader.js"></script>
    
    <!-- Initialize -->
    <script>
        // Register service worker
        if ('serviceWorker' in navigator && window.ImageManager) {
            ImageManager.registerServiceWorker();
        }
        
        // Initialize background switcher
        if (window.BackgroundSwitcher) {
            BackgroundSwitcher.init();
        }
    </script>
</body>
</html>
```

## Benefits of This Approach

1. **No Code Modification**: Library code remains untouched across repositories
2. **Centralized Configuration**: All customization happens in one place
3. **Flexible Integration**: Choose which modules to include based on needs
4. **Backward Compatibility**: Existing code continues to work
5. **Easy Updates**: Library updates can be applied without losing customizations

## Troubleshooting

### Module Not Found Errors
Ensure scripts are loaded in the correct order: configuration first, then image-manager, then other modules.

### Path Resolution Issues
Check that `basePath` and `imageDir` are correctly set for your repository structure.

### Service Worker Registration Fails
Verify that `serviceWorkerPath` points to the correct location and that your server serves the service worker with appropriate headers.

### Background Images Not Loading
Confirm that background image paths in the configuration match your actual file structure.