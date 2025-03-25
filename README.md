# DILG Cebu Province Website

This repository contains the official website for the Department of the Interior and Local Government (DILG) Cebu Province.

## File Structure

The website follows this organization:

```
dilgcebuprovincewebsite-1/
├── index.html              # Landing page
├── styles.css              # Main CSS file (at repository root)
├── main/                   # Main website content
│   └── index.html          # Main website homepage
├── assets/                 # Asset files
│   ├── fonts/              # Custom fonts
│   │   ├── EuphoriaScript-Regular.ttf
│   │   └── Whitehella.otf
│   └── js/                 # JavaScript files
├── images/                 # Image files
│   ├── logo.png            # DILG Cebu Province Logo
│   └── lgrc.png            # LGRC Logo
└── README.md               # This file
```

## CSS Structure

The main `styles.css` file is located at the repository root for optimal compatibility with GitHub Pages. This ensures that styles are properly applied regardless of which page is being viewed.

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
