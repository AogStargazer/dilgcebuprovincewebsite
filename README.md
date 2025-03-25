# DILG Cebu Province Website

This repository contains the official website for the Department of the Interior and Local Government (DILG) Cebu Province.

## File Structure

The website follows this organization:

```
dilgcebuprovincewebsite-1/
├── index.html              # Landing page
├── styles.css              # Main CSS file (at repository root)
├── main/                   # Main website content
│   ├── index.html          # Main website homepage
│   └── images/             # Images for main section
│       ├── Cebu_Capitol_Compound.png       # Daytime background image
│       └── Cebu_Capitol_Compound_Night.png # Nighttime background image
├── assets/                 # Asset files
│   ├── fonts/              # Custom fonts
│   │   ├── EuphoriaScript-Regular.ttf
│   │   └── Whitehella.otf
│   └── js/                 # JavaScript files
│       └── background-switcher.js  # Script for day/night background switching
├── images/                 # Image files
│   ├── logo.png            # DILG Cebu Province Logo
│   ├── lgrc.png            # LGRC Logo
│   ├── Cebu_Capitol_Compound.png       # Daytime background image
│   ├── Cebu_Capitol_Compound_Night.png # Nighttime background image
│   └── mainpagealbum/      # Folder for main page image slider
└── README.md               # This file
```

## CSS Structure

The main `styles.css` file is located at the repository root for optimal compatibility with GitHub Pages. This ensures that styles are properly applied regardless of which page is being viewed.

## Background Images

The website features dynamic background images that change based on the time of day in the Philippines (daytime: 6:00 AM to 6:00 PM; nighttime: 6:00 PM to 6:00 AM). 

**IMPORTANT:** These background images are **required** for the website to function properly. If you're experiencing missing backgrounds, please ensure the following files are placed in their respective directories:

1. For the landing page (root-page):
   - `Cebu_Capitol_Compound.png` (daytime) in the `./images/` directory
   - `Cebu_Capitol_Compound_Night.png` (nighttime) in the `./images/` directory

2. For the main website (main-page):
   - `Cebu_Capitol_Compound.png` (daytime) in the `./main/images/` directory
   - `Cebu_Capitol_Compound_Night.png` (nighttime) in the `./main/images/` directory

**Note:** The filenames are case-sensitive and must match exactly as shown above. The background-switcher.js script automatically detects the time and switches between these images. If these directories don't exist, you'll need to create them manually.

## Image Slider

The main page features a centered, large image slider that displays images from the `./images/mainpagealbum/` directory. To add or update images in the slider:

1. Create the `mainpagealbum` folder inside the `images` directory if it doesn't exist
2. Place your slider images in this folder
3. The slider will automatically display all images from this location
4. For best results, use landscape-oriented images with consistent dimensions

## Font Usage

Custom fonts are stored in the `assets/fonts/` directory and are referenced in the CSS using relative paths. The website uses:

- EuphoriaScript: For special menu items
- Whitehella: For headings and emphasis text
- System fonts: As fallbacks

## Deployment on GitHub Pages

To deploy this website on GitHub Pages:

1. **Repository Setup**:
   - Ensure your repository is named `username.github.io` for a user site, or configure GitHub Pages in repository settings for a project site.

2. **Branch Configuration**:
   - Go to your repository on GitHub
   - Navigate to Settings > Pages
   - Select the branch to deploy (usually `main` or `master`)
   - Save the settings

3. **Path Configuration**:
   - The site uses both absolute paths (starting with `/`) and relative paths (starting with `./`) for CSS and assets to ensure compatibility with GitHub Pages.
   - The main CSS file should remain at the repository root.
   - **Important:** Make sure all background images are placed in their correct directories as specified in the "Background Images" section above. The relative paths (`./images/` and `./main/images/`) are critical for proper rendering on GitHub Pages.
   - Double-check that all filenames match exactly, including capitalization (e.g., `Cebu_Capitol_Compound.png`, not `cebu_capitol_compound.png` or `Cebu_Capitol_Compund.png`).

4. **Testing**:
   - After deployment, verify all pages render correctly
   - Check that fonts, images, and styles load properly
   - Test navigation links to ensure they work as expected

## Local Development

To work on this website locally:

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/dilgcebuprovincewebsite-1.git
   ```

2. Open the project in your preferred code editor

3. Use a local server to preview changes (to avoid CORS issues with fonts):
   - With Python: `python -m http.server`
   - With Node.js: `npx serve`
   - Or use extensions like Live Server for VS Code

4. Make changes and test locally before pushing to GitHub

## Responsive Design

The website is designed to be responsive across different screen sizes:
- Desktop (>768px)
- Tablet (480px-768px)
- Mobile (<480px)

Media queries in the CSS adjust layouts, font sizes, and navigation for each screen size.
