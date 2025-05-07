# DILG Cebu Province Website

This repository contains the official website for the Department of the Interior and Local Government (DILG) Cebu Province. The site is a static export of a WordPress site built with Elementor, optimized for GitHub Pages hosting.

## Project Overview

The DILG Cebu Province website provides information about the department's services, programs, and initiatives. It features a responsive design with dynamic elements like day/night background switching and scroll position restoration.

## File Structure

The website follows this organization:

```
/ (root)
├── index.html                # Landing page
├── aboutus.html              # About Us page
├── amumasabarangay.html      # Amuma sa Barangay program page
├── attachedagencies.html     # Attached Agencies page
├── bansiwag.html             # Bansiwag program page
├── contact-info.html         # Contact Information page
├── fdp.html                  # Full Disclosure Policy page
├── fdpLGUs.html              # LGU Compliance on Full Disclosure page
├── gad.html                  # Gender and Development page
├── hiring.html               # Vacant Positions page
├── history.html              # History page
├── invitationtobid.html      # Invitation to Bid page
├── issuances.html            # Issuances page
├── lguportal.html            # LGU Portal page
├── maintenanceindex.html     # Maintenance page
├── mandate.html              # Mandate page
├── news.html                 # News page
├── noticetoproceed.html      # Notice to Proceed page
├── organizationalchartchief.html # Key Officials & Management page
├── organizationalstructure.html # Organizational Structure page
├── template.html             # Template for new pages
├── theprovincialdirector.html # Provincial Director page
├── transparency.html         # Transparency Seal page
├── transparencyofwork.html   # Transparency at Work page
├── styles.css                # Main CSS file
├── main-index-styles.css     # Styles for main index
├── menu.css                  # Navigation menu styles
├── CNAME                     # Custom domain configuration
├── archive/                  # Archived content
│   └── index.html
├── assets/                   # Asset files
│   ├── fonts/                # Custom fonts
│   │   └── Whitehella.otf    # Only font file currently present
│   └── js/                   # JavaScript files
│       ├── main-background-switcher.js  # Day/night background switching for main page
│       └── background-switcher.js       # General background switching functionality
├── css/                      # Additional CSS files
│   └── attached-agencies.css # Styles for attached agencies page
└── README.md                 # This file
```

## CSS Structure

The website uses multiple CSS files:

1. **styles.css** - Main stylesheet at the repository root for optimal compatibility with GitHub Pages
2. **main-index-styles.css** - Specific styles for the main index page
3. **menu.css** - Navigation menu styles
4. **css/attached-agencies.css** - Styles for the attached agencies page

This organization ensures that styles are properly applied regardless of which page is being viewed.

## JavaScript Files

The website uses two JavaScript files for dynamic background switching:

1. **assets/js/main-background-switcher.js** - Handles background image switching for the main/index page based on time of day
2. **assets/js/background-switcher.js** - General background switching functionality for all pages

**Note:** The code references a `scroll-restoration.js` file that is not currently present in the repository. This file should either be added to the `assets/js/` directory or the reference to it should be removed from the HTML files.

## Background Images

The website features dynamic background images that change based on the time of day in the Philippines (daytime: 6:00 AM to 6:00 PM; nighttime: 6:00 PM to 6:00 AM).

**IMPORTANT:** The JavaScript files reference background images that are not currently in the repository. You need to:

1. Create an `images/` directory in the root folder
2. Add the following background images to this directory:
   - `Cebu_Capitol_Compound.png` (daytime)
   - `Cebu_Capitol_Compound_Night.png` (nighttime)
   - `Cebu_Capitol_Compound_Night_Alternate.png` (alternate nighttime)

**Note:** The filenames are case-sensitive and must match exactly as shown above. The background switcher scripts automatically detect the time and switch between these images.

## Image Slider

The main page features a centered image slider that displays images from the `images/mainpagealbum/` directory. To add or update images in the slider:

1. Create the `images/mainpagealbum/` directory if it doesn't exist
2. Place your slider images in this folder, numbered sequentially (1.jpg, 2.jpg, etc.)
3. The slider will automatically display all images from this location
4. For best results, use landscape-oriented images with consistent dimensions

## Font Usage

Currently, only the `Whitehella.otf` font is present in the `assets/fonts/` directory. The CSS references an `EuphoriaScript` font that is not in the repository. To complete the font setup:

1. Add the `EuphoriaScript-Regular.ttf` font to the `assets/fonts/` directory, or
2. Update the CSS to use an alternative font or web font

The website currently uses:
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
   - **Important:** Create the `images/` directory and add the required background images as specified in the "Background Images" section above.
   - Double-check that all filenames match exactly, including capitalization.

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
