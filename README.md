# DILG Cebu Province Website

Static website for the Department of the Interior and Local Government (DILG) Cebu Province. The repository contains the public site pages, Cebu Province/LGU map pages, organizational chart pages, resource pages, news articles, PDF viewer assets, and supporting images/scripts used for GitHub Pages-style hosting.

## Project Overview

The site is a static HTML/CSS/JavaScript build. Most pages share the same header/navigation pattern, common stylesheet, local image assets, and local font files. The homepage includes a main image slider and time-based background switching for Cebu Capitol imagery.

No build step is required for normal content updates. Edit the HTML, CSS, JavaScript, image, or PDF files directly and preview through a local static server.

## Main Pages

### Home and Office Information

- `index.html` - Homepage with image slider, navigation, and homepage sections
- `aboutus.html` - About DILG Cebu Province
- `history.html` - Office history
- `mandate.html` - Mandate
- `contact-info.html` - Contact information
- `ip-phonedirectory.html` - IP phone directory
- `theprovincialdirector.html` - Provincial Director page
- `maintenanceindex.html` - Maintenance page

### Transparency, Citizen Services, and Procurement

- `transparency.html` - Transparency Seal
- `fdp.html` - Full Disclosure Policy
- `fdpLGUs.html` - LGU compliance on Full Disclosure Policy
- `citizenscharter.html` - Citizen's Charter page
- `citizenscharterencoded.html` - Encoded Citizen's Charter page
- `hiring.html` - Vacant positions
- `invitationtobid.html` - Invitation to Bid
- `noticetoproceed.html` - Notice to Proceed

### Programs, Resources, and Publications

- `lgrc.html` - Local Governance Resource Center
- `resourcelgu.html` - Resources for Local Government Units
- `dilgprogramsresource.html` - DILG programs and resources
- `localgovtcode.html` - Local Government Code resource
- `annualreport.html` - Annual reports
- `publicationsandnewsletters.html` - Publications and newsletters
- `pangatungdanan.html` - Pangatungdanan
- `kalambuan.html` - Kalambuan
- `bansiwag.html` - Bansiwag
- `amumasabarangay.html` - Amuma sa Barangay
- `gad.html` - Gender and Development

### LGU and Map Pages

- `lgus.html` - Cebu Province LGUs
- `cebuprovincemap.html` - Cebu Province map
- `cebuprovincemapLGU.html` - Cebu Province LGU map
- `assets/interactivemap/index.html` - Interactive map support page
- `CebuProvince.svg` and `CebuProvince.txt` - Map/source data assets
- `MapTooltipinsideHTML.js` and `svgmaptooltipengine.js` - Map tooltip behavior

### Organization and Personnel Pages

- `organizationalstructure.html` - Organizational structure
- `organizationaldilgpersonnel.html` - DILG personnel
- `organizationalchartchief.html` - Key officials and management
- `organizationalchartFAS.html` - FAS organizational chart
- `organizationalchartLGCDS.html` - LGCDS organizational chart
- `organizationalchartLGMES.html` - LGMES organizational chart
- `organizationalchartPDMU.html` - PDMU organizational chart
- `organizationalchartbugsay.html` - BUGSAY cluster organizational chart
- `organizationalchartdasig.html` - DASIG cluster organizational chart
- `organizationalcharttiga.html` - TIGA cluster organizational chart
- `organizationalcharttribu.html` - TRIBU cluster organizational chart

### News and Media

- `news.html` - News index
- `dilgsugbobalita.html` - DILG Sugbo Balita
- `NEWS/` - Individual dated news article folders and article images

### Supporting and Utility Pages

- `attachedagencies.html` - Attached agencies
- `template.html` - Template for creating new pages
- `test.html` - Test/demo page
- `assets/pdfjs/web/viewer.html` - PDF.js viewer used for local PDF viewing

## Repository Structure

```text
/
├── *.html                         # Top-level static pages
├── NEWS/                          # Individual news articles and article images
├── DILGPROGRAMSRESOURCE/          # Downloadable program/resource PDFs
├── assets/
│   ├── fonts/                     # Local display fonts
│   ├── interactivemap/            # Interactive map page
│   ├── js/                        # Site JavaScript
│   └── pdfjs/                     # Local PDF.js distribution
├── css/                           # Page-specific CSS
├── images/
│   ├── LGRC/                      # LGRC/resource thumbnails
│   ├── LGU/                       # LGU images
│   ├── mainpagealbum/             # Homepage slider images
│   └── *.png, *.jpg               # Shared background and branding images
├── organizationalchart/           # Organizational chart assets
├── theprovincialdirector/         # Provincial Director media
├── wp-content/, wp-includes/      # Static WordPress-exported assets
├── styles.css                     # Main shared stylesheet
├── main-index-styles.css          # Homepage-specific stylesheet
├── menu.css                       # Navigation styles
├── security-config.js             # Client-side security/config helpers
├── CNAME                          # Custom domain configuration
├── robots.txt                     # Crawling rules
└── README.md                      # This documentation
```

## Stylesheets

- `styles.css` - Main shared stylesheet used by most site pages
- `main-index-styles.css` - Homepage-specific layout and visual styling
- `menu.css` - Navigation menu styling
- `css/attached-agencies.css` - Attached agencies page styling
- `wp-content/` and `wp-includes/` CSS files - Static assets retained from the WordPress export

## JavaScript

- `assets/js/main-background-switcher.js` - Homepage day/night Capitol background switcher
- `assets/js/main-background-switcher-GAD.js` - GAD-specific background switcher
- `assets/js/background-switcher.js` - General background switcher
- `assets/js/header-clock-weather.js` - Header clock/weather behavior
- `assets/js/nav-logo-video.js` - Navigation logo/video behavior
- `assets/js/gallery-lightbox.js` - Gallery lightbox behavior
- `assets/js/goatcounter-stats.js` - GoatCounter statistics display helpers
- `assets/js/image-manager.js` - Image management helpers
- `assets/js/service-worker.js` - Service worker/cache handling
- `assets/js/standalone-config.js` - Standalone site configuration
- `MapTooltipinsideHTML.js` and `svgmaptooltipengine.js` - SVG/map tooltip support

Some pages also include inline JavaScript for page-specific behavior. When updating shared behavior, check whether the logic is centralized in `assets/js/` or embedded in the related page.

## Images and Media

- Homepage slider images live in `images/mainpagealbum/`.
- Shared Capitol background images live in `images/`, including day, night, alternate night, and GAD variants.
- LGU photos live in `images/LGU/`.
- LGRC/resource thumbnails live in `images/LGRC/`.
- Organizational chart portraits and chart images live in `organizationalchart/` and `organizationalchart/images/`.
- Provincial Director photos live in `theprovincialdirector/`.
- News article images live beside each article under `NEWS/<article-folder>/`.

When adding images, keep filenames and path casing consistent with the HTML references. GitHub Pages is case-sensitive even if local Windows previews are more forgiving.

## Fonts

Local fonts are stored in `assets/fonts/`:

- `EuphoriaScript-Regular.ttf`
- `Whitehella.ttf`
- `Whitehella.otf`
- `moon-time-regular.ttf`

The root also contains legacy font copies (`EuphoriaScript-Regular.ttf`, `Whitehella.ttf`, and `Whitehella.otf`). Prefer `assets/fonts/` for new CSS references.

## PDF Resources

PDF resources are stored mainly in `DILGPROGRAMSRESOURCE/`. The repo also includes a local PDF.js copy under `assets/pdfjs/` so PDFs can be opened with the bundled viewer when needed.

## Local Development

Because the site is static, any simple local HTTP server will work:

```bash
python -m http.server
```

Then open:

```text
http://localhost:8000/
```

Using a local server is preferred over opening files directly because fonts, PDF viewer assets, service-worker behavior, and some relative paths behave more consistently over HTTP.

## Updating Content

1. Edit the relevant `.html` page or asset file.
2. Keep navigation links consistent across pages that share the header/menu.
3. Add new images to the matching asset folder (`images/mainpagealbum/`, `images/LGU/`, `organizationalchart/images/`, or the relevant `NEWS/` article folder).
4. Use relative paths unless a page already follows a different local pattern.
5. Preview locally and check desktop and mobile widths before publishing.

For new pages, start from `template.html` or copy the closest existing page with the same layout pattern.

## Deployment

The repository is ready for static hosting. For GitHub Pages:

1. Push changes to the deployment branch.
2. In the GitHub repository, open Settings > Pages.
3. Select the configured branch/source.
4. Confirm the custom domain remains aligned with `CNAME`.
5. After deployment, verify key pages, images, fonts, PDFs, and navigation links.

## Responsive Design

The site uses CSS media queries for desktop, tablet, and mobile layouts. When changing navigation, organizational charts, maps, tables, or slider content, test narrow mobile widths as well as desktop layouts.

