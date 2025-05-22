# FUNCTIONS_REFERENCE.md

## CSS Classes Reference

### styles.css
- `.root-page`, `.main-page`  
  Full-screen background containers for root and main pages.  
- `.main-header`  
  Fixed header wrapper above content.  
- `.main-navigation`  
  Flex container holding logo, menu, and toggle.  
- `.nav-menu`, `.main-menu > li > a`  
  Primary navigation list & link styling.  
- `.has-dropdown:hover .dropdown-menu`  
  Shows nested dropdown on hover.  
- `.dropdown-menu`, `.drop-right-menu`  
  Hidden by default; absolute-positioned submenus.  
- `.mobile-menu-toggle`  
  Hamburger icon; toggles `.nav-menu.active`.  
- `.main-slider-container`, `.main-slider`, `.main-slide`  
  Slider wrapper, track, and individual slides.  
- `.slider-nav.prev-slide`, `.slider-nav.next-slide`, `.slider-pagination`  
  Slider controls (prev/next buttons & pagination dots).  
- `.orgchart-item`  
  Circular organizational chart item with hover effects.  
- `.image-row`  
  Responsive flex container for image blocks.  
- `.lgu-grid`  
  Grid layout for LGU menu (5 columns).  
- `.attached-image-row`  
  Horizontal scroll list for attached agencies.

### menu.css
- `.dropdown-menu`  
  Base dropdown styles: hidden, absolute, box-shadow.  
- `.has-dropright`, `.has-drop-right`  
  Containers for “drop-right” submenus.  
- `.drop-right-menu`  
  Right-expanding submenu container.  
- `.has-dropright.viewport-edge > .dropdown-menu`  
  Flips submenu to left if near viewport edge.  
- `.has-dropright > .dropdown-menu`, `.has-drop-right:hover .drop-right-menu`  
  Show/hide logic with opacity/transform transitions.  
- Media queries adapt dropdowns to static/mobile accordion behavior.

### main-index-styles.css
- `html body.home .container.grid-layout`  
  Two-column flex layout on index home page.  
- `.logo`  
  Responsive logo sizing with `clamp()`.  
- `.text-content`, `.heading`, `.paragraph`  
  Text block sizing & typography for home.  
- `.button-container`, `.learn-more-container`, `.elementor-button`  
  Styled CTA buttons.  
- `.attached-agencies .image-row`  
  Overrides image-row to nowrap/horizontal scroll for agencies.  
- Utility responsive tweaks for `.image-row.no-wrap`.

---

## Inline JavaScript Functions

### index.html

#### Slider Functions
- `goToSlide(index)`  
  // Shifts `.main-slider` translateX to show slide at `index`.  
- `nextSlide()` / `prevSlide()`  
  // Advances or rewinds `currentSlide` modulo slide count, then calls `goToSlide()`.  
- `updatePagination()`  
  // Toggles `.active` on `.pagination-dot` elements matching `currentSlide`.  
- `handleSwipe()`  
  // On touch events, compares `touchEndX`/`touchStartX` → calls `nextSlide()` or `prevSlide()`.  
- `updateSliderHeight()`  
  // Stub logging that height is managed by CSS aspect-ratio. Called on orientation change.  

#### Mobile Menu & Dropdown Logic
- Mobile toggle  
  ```js
  mobileMenuToggle.addEventListener('click',()=>{
    navMenu.classList.toggle('active');
    mobileMenuToggle.classList.toggle('active');
  });
  ```
- `.has-dropdown` click handler  
  // On mobile (≤768px), prevents link default and toggles `.open`.  
- Touch-friendly submenu  
  // On `touchend`, adds `.active` to submenu to open without JS errors.

### template.html
- Reuses same inline slider & menu functions as **index.html**.  
- All function names, parameters, and behaviors are identical to **index.html**.

### organizationalstructure.html
- Also includes the same inline JS block at bottom.  
- Functions for slider, mobile menu toggle, dropdowns are identical.  
- Primary difference: no `<div class="main-slider">` content, but logic is present.

---

## External JavaScript Modules

### assets/js/main-background-switcher.js
- `isDaytime()` → `boolean`  
  Returns `true` if local hour ∈ [dayStart, nightStart).  
- `getBackgroundImageUrl()` → `string`  
  Picks day/night filename + `?t=${timestamp}` for cache busting.  
- `updateBackground()`  
  Queries `.main-page` elements, sets `style.backgroundImage`.  
- `init()`  
  Calls `updateBackground()`, binds to `DOMContentLoaded`, `visibilitychange`, and `setInterval`.

### assets/js/background-switcher.js
- `getCurrentPhilippinesHour()` → `number`  
  Reads local time converted to `"Asia/Manila"` timezone, fallback to local.  
- `isDaytime()` → `boolean`  
  Uses `getCurrentPhilippinesHour()` to test 6≤hour<18.  
- `updateBackgroundBasedOnTime()`  
  Selects `.root-page, .main-page`, chooses DAY or random NIGHT image, appends `?v=${Date.now()}`, applies `style.backgroundImage`.

---

## Missing or Stub Scripts

- `assets/js/scroll-restoration.js` is referenced at end of HTML but **not present** in the repository.  
  Recommendation: add the missing file or remove the `<script src="assets/js/scroll-restoration.js">` reference.