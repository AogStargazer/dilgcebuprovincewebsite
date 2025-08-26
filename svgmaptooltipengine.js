/**
 * Universal SVG Map Tooltip Engine
 * Creates a flexible grid-based tooltip system for SVG maps
 * Supports images, text, emojis, and paragraphs in a dynamic grid layout
 */

// --- BEGIN: Robustness Utilities ---
// Retry utility for async fetches (future use)
async function fetchWithRetry(url, options = {}, retries = 3, backoff = 300) {
  try {
    return await fetch(url, options);
  } catch (err) {
    if (retries > 0) {
      await new Promise(res => setTimeout(res, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 2);
    }
    throw err;
  }
}

// Simple HTML escape fallback (if DOMPurify is not available)
function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[tag]);
}

// Debounce utility
function debounce(fn, delay = 50) {
  let timer = null;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}
// --- END: Robustness Utilities ---

class UniversalSVGTooltipEngine {
  constructor(options = {}) {
    this.options = {
      panelId: 'universalMapInfoPanel',
      position: { left: '20px', top: 'calc(100px + 20px)' },
      maxWidth: '450px',
      maxColumns: 5,
      defaultMessage: 'Hover over a region to see information',
      emptyStateTitle: 'Select a Region',
      emptyStateMessage: 'Click or hover over any region on the map to<br>view detailed information about that area.',
      customRenderers: {}, // User can provide custom renderers
      ...options
    };
    
    this.tooltipData = {};
    this._tooltipContentCache = new Map();
    this._boundPaths = [];
    this._panel = null;
    this._panelClosed = false;
    this._activeRegionKey = null; // Track the last region shown
    this.init();
  }

  /**
   * Returns the CSS for the info panel as a string.
   */
  _getPanelStyles() {
    return `
      #${this.options.panelId} {
        position: fixed !important;
        z-index: 2147483647 !important;
        display: block !important;
        background: white !important;
        color: black !important;
        padding: 5px 3px !important;
        border: 1px solid #ddd !important;
        border-radius: 8px !important;
        box-shadow: 0 4px 20px rgba(0,0,0,0.15) !important;
        max-width: ${this.options.maxWidth} !important;
        font-family: Arial, sans-serif !important;
        font-size: 13px !important;
        pointer-events: auto !important;
        overflow: hidden !important;
      }
      #${this.options.panelId} h3 {
        margin: 0 0 15px 0 !important;
        color: #333 !important;
        border-bottom: 1px solid #eee;
        padding-bottom: 10px;
        word-wrap: break-word;
      }
      #${this.options.panelId} .usvg-tooltip-label {
        font-size: 10px;
        color: #888;
        margin-bottom: 2px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      #${this.options.panelId} .usvg-tooltip-cell,
      #${this.options.panelId} .usvg-tooltip-cell-span {
        background: #f9f9f9;
      }
      #${this.options.panelId} .usvg-tooltip-cell, #${this.options.panelId} .usvg-tooltip-cell-span {
        padding: 2px 1px;
        background: #f9f9f9;
        border-radius: 6px;
        min-height: 18px;
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        justify-content: center;
        text-align: left;
        overflow: hidden;
        position: relative;
      }
      #${this.options.panelId} .usvg-tooltip-cell-span {
        /* Multi-line clamp: Chrome/Edge/Safari */
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: normal;
        /* Fallback for Firefox/others: show only 3 lines, no ellipsis */
        max-height: calc(1.2em * 3);
        line-height: 1.2em;
        position: relative;
      }
      #${this.options.panelId} .usvg-tooltip-cell-span-nowrap {
        /* Disable line clamp and max-height for wrapchar cells */
        display: block;
        -webkit-line-clamp: unset;
        -webkit-box-orient: unset;
        max-height: none;
        overflow: visible;
        text-overflow: initial;
        white-space: normal;
        line-height: 1.2em;
        position: relative;
      }
      #${this.options.panelId} .usvg-tooltip-cell img {
        display: block;
        margin: 0 auto;
        max-width: 100%;
        max-height: 120px;
        object-fit: cover;
        border-radius: 6px;
        border: 1px solid #ddd;
      }
    `;
  }

  /**
   * Creates the main info panel with flexible grid layout
   * Now uses a <style> tag for CSS.
   * Reuses the panel DOM node if it exists.
   * Adds accessibility attributes.
   * Adds a close button in the upper right.
   */
  createInfoPanel() {
    // Remove existing panel if any (but reuse if possible)
    let panel = document.querySelector(`#${this.options.panelId}`);
    if (panel) {
      panel.querySelector('#panelEmptyState').style.display = 'block';
      panel.querySelector('#panelContent').style.display = 'none';
      // Always show the panel if reusing
      panel.style.display = 'block';
      this._panel = panel;
      return panel;
    }

    // Inject panel CSS if not already present
    if (!document.getElementById(`${this.options.panelId}-styles`)) {
      const styleTag = document.createElement('style');
      styleTag.id = `${this.options.panelId}-styles`;
      styleTag.textContent = this._getPanelStyles() + `\n#${this.options.panelId} .usvg-close-btn { position: absolute; top: 6px; right: 8px; background: none; border: none; color: #fff; background-color: #e53935; border-radius: 50%; width: 26px; height: 26px; font-size: 18px; font-weight: bold; cursor: pointer; z-index: 2; display: flex; align-items: center; justify-content: center; transition: background 0.2s; box-shadow: 0 2px 6px rgba(0,0,0,0.08); }\n#${this.options.panelId} .usvg-close-btn:hover, #${this.options.panelId} .usvg-close-btn:focus { background-color: #b71c1c; outline: none; }`;
      document.head.appendChild(styleTag);
    }

    const panelHTML = `
      <div id="${this.options.panelId}"
        role="region" aria-live="polite" aria-atomic="true" tabindex="-1"
        style="left: ${this.options.position.left}; top: ${this.options.position.top};">
        <button class="usvg-close-btn" aria-label="Close tooltip panel" title="Close" tabindex="0">&times;</button>
        <div style="text-align: center; color: #666; margin-bottom: 15px; font-size: 12px;">
          <small>${this.options.defaultMessage}</small>
        </div>
        <div id="panelEmptyState" style="color: #555 !important; line-height: 1.4;">
          <p style="margin: 0;">${this.options.emptyStateMessage}</p>
        </div>
        <div id="panelContent" style="display: none;">
          <!-- Dynamic content will be inserted here -->
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', panelHTML);
    this._panel = document.querySelector(`#${this.options.panelId}`);

    // Add close button logic
    const closeBtn = this._panel.querySelector('.usvg-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        this.resetPanel();
        this._panelClosed = true; // Mark the panel as closed by the user
        this._activeRegionKey = null; // Reset active region so next hover is always new
        e.stopPropagation();
      });
      // Keyboard accessibility: Enter/Space
      closeBtn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          closeBtn.click();
        }
      });
    }
    return this._panel;
  }

  /**
   * Default semantic name to grid position mappings
   * Users can override these with custom mappings
   */
  getDefaultSemanticMappings() {
    return {
      // Profile/Description mappings
      'profile': 'R1C1',
      'description': 'R1C2',
      'summary': 'R1C3',
      
      // Name mappings
      'name': 'R2C1',
      'lguname': 'R2C2',
      'title': 'R2C3',
      
      // Mayor mappings
      'mayor': 'R3C1',
      'mayorname': 'R3C1',
      'mayordesignation': 'R3C2',
      'mayortitle': 'R3C2',
      'mayorimg': 'R3C3',
      'mayorphoto': 'R3C3',
      
      // LGOO mappings
      'lgoo': 'R4C1',
      'lgooname': 'R4C1',
      'lgoodesignation': 'R4C2',
      'lgootitle': 'R4C2',
      'lgooimg': 'R4C3',
      'lgoophoto': 'R4C3',
      
      // Secondary LGOO mappings
      'lgoo2': 'R5C1',
      'lgoo2name': 'R5C1',
      'lgoodesignation2': 'R5C2',
      'lgoo2title': 'R5C2',
      'lgooimg2': 'R5C3',
      'lgoo2photo': 'R5C3',
      
      // Contact info
      'email': 'R6C1',
      'phone': 'R6C2',
      'website': 'R6C3',
      'address': 'R6C4',
      
      // Additional info
      'population': 'R7C1',
      'area': 'R7C2',
      'established': 'R7C3',
      'zipcode': 'R7C4',
      
      // Custom fields
      'logo': 'R1C4',
      'flag': 'R1C5',
      'seal': 'R2C4',
      'map': 'R2C5'
    };
  }

  /**
   * Parses grid position string (e.g., "R2C3" -> {row: 2, col: 3})
   * Also handles semantic names by converting them to grid positions
   */
  parseGridPosition(key, semanticMappings = {}) {
    // First check if it's already a grid position
    const gridMatch = key.match(/^R(\d+)C(\d+)$/i);
    if (gridMatch) {
      return {
        row: parseInt(gridMatch[1]),
        col: parseInt(gridMatch[2]),
        originalKey: key,
        semanticName: null
      };
    }

    // Check semantic mappings
    const allMappings = { ...this.getDefaultSemanticMappings(), ...semanticMappings };
    const lowerKey = key.toLowerCase();
    const gridPos = allMappings[lowerKey];
    
    if (gridPos) {
      const gridMatch = gridPos.match(/^R(\d+)C(\d+)$/i);
      if (gridMatch) {
        return {
          row: parseInt(gridMatch[1]),
          col: parseInt(gridMatch[2]),
          originalKey: key,
          semanticName: lowerKey
        };
      }
    }

    return null;
  }

  /**
   * Advanced content type detection with multiple strategies
   */
  detectContentType(value) {
    // Strategy 1: Direct type indicators (prefixes)
    if (typeof value === 'string') {
      const lowerValue = value.toLowerCase().trim();
      
      // Direct type prefixes
      if (lowerValue.startsWith('img:')) return 'image';
      if (lowerValue.startsWith('video:')) return 'video';
      if (lowerValue.startsWith('audio:')) return 'audio';
      if (lowerValue.startsWith('html:')) return 'html';
      if (lowerValue.startsWith('link:')) return 'link';
      if (lowerValue.startsWith('emoji:')) return 'emoji';
      if (lowerValue.startsWith('icon:')) return 'icon';
      if (lowerValue.startsWith('text:')) return 'text';
    }

    // Strategy 2: URL pattern detection
    const urlPatterns = {
      image: /\.(jpg|jpeg|png|gif|svg|webp|bmp|tiff|ico|avif)(\?.*)?$/i,
      video: /\.(mp4|avi|mov|wmv|flv|webm|mkv|m4v)(\?.*)?$/i,
      audio: /\.(mp3|wav|ogg|aac|flac|m4a)(\?.*)?$/i
    };

    for (const [type, pattern] of Object.entries(urlPatterns)) {
      if (pattern.test(value)) return type;
    }

    // Strategy 3: URL protocol detection
    if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('//')) {
      return 'link';
    }

    // Strategy 4: Data URL detection
    if (value.startsWith('data:')) {
      if (value.startsWith('data:image/')) return 'image';
      if (value.startsWith('data:video/')) return 'video';
      if (value.startsWith('data:audio/')) return 'audio';
      return 'data';
    }

    // Strategy 5: HTML tag detection
    if (/<[^>]+>/g.test(value)) {
      return 'html';
    }

    // Strategy 6: Enhanced emoji detection (covers more Unicode ranges)
    const emojiRegex = /[\u{1F000}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F100}-\u{1F1FF}]|[\u{1F200}-\u{1F2FF}]|[\u{1F300}-\u{1F5FF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]/u;
    if (emojiRegex.test(value) && value.trim().length <= 10) {
      return 'emoji';
    }

    // Strategy 7: Icon font detection (Font Awesome, Material Icons, etc.)
    if (/^(fa|fas|far|fab|fal|fad|mat|material|icon|mdi|ti|bi|hi|si|ri|gi|fi|di|ai|pi|ci|wi)-/.test(value)) {
      return 'icon';
    }

    // Strategy 8: JSON detection
    if ((value.startsWith('{') && value.endsWith('}')) || (value.startsWith('[') && value.endsWith(']'))) {
      try {
        JSON.parse(value);
        return 'json';
      } catch (e) {
        // Not valid JSON, continue
      }
    }

    // Strategy 9: Number detection
    if (!isNaN(value) && !isNaN(parseFloat(value)) && value.toString().trim() !== '') {
      return 'number';
    }

    // Strategy 10: Email detection
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return 'email';
    }

    // Strategy 11: Phone number detection
    if (/^[\+]?[\d\s\-\(\)]{7,}$/.test(value.trim())) {
      return 'phone';
    }

    // Strategy 12: Date detection
    if (!isNaN(Date.parse(value))) {
      return 'date';
    }

    // Strategy 13: Color detection (hex, rgb, hsl)
    if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(value) || 
        /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i.test(value) ||
        /^hsl\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*\)$/i.test(value)) {
      return 'color';
    }

    // Strategy 14: Text length analysis
    if (value.length > 200) return 'longtext';
    if (value.length > 50) return 'paragraph';

    // Default: regular text
    return 'text';
  }

  /**
   * Universal content renderer based on detected type
   * Now supports formatting from gridConfig: bold, italic, underline, strikethrough, highlight
   * Now uses DOMPurify for XSS protection if available, otherwise escapes HTML.
   * Supports user-provided custom renderers.
   * Renders content for a cell, applying formatting and custom renderers.
   * Supports wrapchar from gridConfig to insert line breaks every N characters.
   * If wrapchar is set, disables line clamp/max-height for that cell.
   */
  renderContent(value, key, cellConfig = {}) {
    if (!value || value.toString().trim() === '') {
      return { html: '<span style="color: #ccc; font-style: italic;">Empty</span>', extraClass: '' };
    }

    // Remove type prefix if present
    const cleanValue = value.toString().replace(/^(img:|video:|audio:|html:|link:|emoji:|icon:|text:)/, '');
    const contentType = this.detectContentType(value);

    // Custom renderer support
    const customRenderers = this.options.customRenderers || {};
    if (customRenderers[key]) {
      return { html: customRenderers[key](value, key, cellConfig, this), extraClass: '' };
    }
    if (customRenderers[contentType]) {
      return { html: customRenderers[contentType](value, key, cellConfig, this), extraClass: '' };
    }

    let extraClass = '';
    let safeValue;
    if (typeof value === 'string') {
      // 1. Sanitize the original value
      if (typeof window !== 'undefined' && window.DOMPurify) {
        safeValue = window.DOMPurify.sanitize(value);
      } else {
        safeValue = escapeHTML(value);
      }
      // 2. Apply improved wrapchar logic to the sanitized value
      if (cellConfig.wrapchar) {
        const wrapAt = parseInt(cellConfig.wrapchar, 10);
        if (!isNaN(wrapAt) && wrapAt > 0) {
          // Word-boundary-aware wrapping
          const wrapWords = (text, limit) => {
            const words = text.split(/(\s+)/); // keep spaces
            let lines = [];
            let currentLine = '';
            for (let i = 0; i < words.length; i++) {
              const word = words[i];
              // If adding this word would exceed the limit
              if ((currentLine + word).length > limit) {
                if (currentLine.length > 0) {
                  lines.push(currentLine);
                  currentLine = '';
                }
                // If the word itself is longer than limit, break it
                if (word.length > limit) {
                  let start = 0;
                  while (start < word.length) {
                    lines.push(word.slice(start, start + limit));
                    start += limit;
                  }
                } else {
                  currentLine = word;
                }
              } else {
                currentLine += word;
              }
            }
            if (currentLine.length > 0) lines.push(currentLine);
            return lines.join('<br>');
          };
          safeValue = wrapWords(safeValue, wrapAt);
          extraClass = ' usvg-tooltip-cell-span-nowrap';
        }
      }
    } else {
      safeValue = value;
    }

    // Compose text formatting styles
    let textStyle = '';
    if (cellConfig.bold && cellConfig.bold !== false) textStyle += 'font-weight: bold;';
    if (cellConfig.italic && cellConfig.italic !== false) textStyle += 'font-style: italic;';
    if (cellConfig.underline && cellConfig.underline !== false) textStyle += 'text-decoration: underline;';
    if (cellConfig.strikethrough && cellConfig.strikethrough !== false) textStyle += 'text-decoration: line-through;';
    if (cellConfig.underline && cellConfig.strikethrough && cellConfig.underline !== false && cellConfig.strikethrough !== false) textStyle += 'text-decoration: underline line-through;';
    if (cellConfig.highlight && cellConfig.highlight !== false) textStyle += `background: ${cellConfig.highlight};`;
    if (cellConfig.noWrap && cellConfig.noWrap !== false) textStyle += 'white-space: nowrap; overflow-x: auto;';
    if (cellConfig.fontsize && cellConfig.fontsize !== false) textStyle += `font-size: ${cellConfig.fontsize}px;`;
    if (cellConfig.fontfamily && cellConfig.fontfamily !== false) textStyle += `font-family: ${cellConfig.fontfamily};`;
    if (cellConfig.fontcolor && cellConfig.fontcolor !== false) textStyle += `color: ${cellConfig.fontcolor};`;
    if (cellConfig.horizontalalign && cellConfig.horizontalalign !== false) textStyle += `text-align: ${cellConfig.horizontalalign};`;
    if (cellConfig.verticalalign && cellConfig.verticalalign !== false) textStyle += `vertical-align: ${cellConfig.verticalalign};`;

    const wrapWithFormat = (html) => `<span style="${textStyle}">${html}</span>`;
    const sanitize = (html) => {
      if (typeof window !== 'undefined' && window.DOMPurify) {
        return window.DOMPurify.sanitize(html);
      } else {
        return escapeHTML(html);
      }
    };

    switch (contentType) {
      case 'image':
        // Support imageWidth from cellConfig (e.g., '80%')
        const imgWidth = cellConfig.imageWidth || '100%';
        return { html: `<img src="${sanitize(cleanValue)}" style="display: block; margin: auto; max-width: ${imgWidth}; max-height: 120px; object-fit: cover; border-radius: 6px; border: 1px solid #ddd;" onerror="this.outerHTML='<span style=&quot;color: #f44336; font-size: 12px;&quot;>❌ Image failed to load</span>'" onclick="window.open('${sanitize(cleanValue)}', '_blank')" alt="Image for ${sanitize(key)}" />`, extraClass };

      case 'video':
        return { html: `<video controls style="max-width: 100%; max-height: 120px; border-radius: 6px;">
          <source src="${sanitize(cleanValue)}" type="video/mp4">
          <span style="color: #f44336;">❌ Video not supported</span>
        </video>`, extraClass };

      case 'audio':
        return { html: `<audio controls style="width: 100%; max-width: 250px;">
          <source src="${sanitize(cleanValue)}" type="audio/mpeg">
          <span style="color: #f44336;">❌ Audio not supported</span>
        </audio>`, extraClass };

      case 'link':
        const displayUrl = cleanValue.length > 30 ? cleanValue.substring(0, 30) + '...' : cleanValue;
        return { html: wrapWithFormat(`<a href="${sanitize(cleanValue)}" target="_blank" style="
          color: #2196F3; 
          text-decoration: none; 
          border-bottom: 1px dashed #2196F3;
          word-break: break-all;
        " text-align: left;" onmouseover="this.style.textDecoration='underline'" 
        onmouseout="this.style.textDecoration='none'">
          🔗 ${sanitize(displayUrl)}
        </a>`), extraClass };

      case 'email':
        return { html: wrapWithFormat(`<a href="mailto:${sanitize(cleanValue)}" style="
          color: #2196F3; 
          text-decoration: none;
          border-bottom: 1px dashed #2196F3;
        " text-align: left;">📧 ${sanitize(cleanValue)}</a>`), extraClass };

      case 'phone':
        return { html: wrapWithFormat(`<a href="tel:${sanitize(cleanValue)}" style="
          color: #2196F3; 
          text-decoration: none;
          border-bottom: 1px dashed #2196F3;
        " text-align: left;">📞 ${sanitize(cleanValue)}</a>`), extraClass };

      case 'html': {
        // Special handling for video iframes
        let htmlToRender = cleanValue;
        let isVideoIframe = false;
        if (/<iframe[^>]+src=["'][^"']+["'][^>]*><\/iframe>/i.test(cleanValue)) {
          isVideoIframe = isSafeVideoIframe(cleanValue);
        }
        if (isVideoIframe) {
          // Allow the iframe through, even if DOMPurify is present
          // Optionally, strip all but the iframe
          const div = document.createElement('div');
          div.innerHTML = cleanValue;
          const iframe = div.querySelector('iframe');
          if (iframe) {
            // Remove all attributes except src, width, height, allow, allowfullscreen, frameborder
            const allowedAttrs = ['src', 'width', 'height', 'allow', 'allowfullscreen', 'frameborder'];
            [...iframe.attributes].forEach(attr => {
              if (!allowedAttrs.includes(attr.name.toLowerCase())) {
                iframe.removeAttribute(attr.name);
              }
            });
            htmlToRender = iframe.outerHTML;
          }
        } else {
          // Sanitize as usual
          if (typeof window !== 'undefined' && window.DOMPurify) {
            htmlToRender = window.DOMPurify.sanitize(cleanValue);
          } else {
            htmlToRender = escapeHTML(cleanValue);
          }
        }
        return { html: wrapWithFormat(`<div style="font-size: 13px; text-align: left;">${htmlToRender}</div>`), extraClass };
      }

      case 'emoji':
        return { html: wrapWithFormat(`<span style="font-size: 28px; display: inline-block; line-height: 1;">${sanitize(cleanValue)}</span>`), extraClass };

      case 'icon':
        return { html: wrapWithFormat(`<i class="${sanitize(cleanValue)}" style="font-size: 24px; color: #555;"></i>`), extraClass };

      case 'number':
        const num = parseFloat(cleanValue);
        return { html: wrapWithFormat(`<span style="
          font-family: monospace; 
          font-weight: bold; 
          color: #4CAF50;
          background: #E8F5E8;
          padding: 2px 6px;
          border-radius: 3px;
        " text-align: left;">${sanitize(num.toLocaleString())}</span>`), extraClass };

      case 'date':
        const date = new Date(cleanValue);
        return { html: wrapWithFormat(`<span style="
          color: #FF9800;
          background: #FFF3E0;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 13px;
        " text-align: left;">📅 ${sanitize(date.toLocaleDateString())}</span>`), extraClass };

      case 'color':
        return { html: `<div style="display: flex; align-items: center; gap: 8px;">
          <div style="
            width: 20px; 
            height: 20px; 
            background-color: ${sanitize(cleanValue)}; 
            border: 1px solid #ccc; 
            border-radius: 3px;
          "></div>
          <code style="font-size: 12px; color: #666;">${sanitize(cleanValue)}</code>
        </div>`, extraClass };

      case 'json':
        try {
          const parsed = JSON.parse(cleanValue);
          return { html: `<details style="cursor: pointer;">
            <summary style="font-size: 12px; color: #666;">📋 JSON Data</summary>
            <pre style="font-size: 11px; background: #f5f5f5; padding: 8px; border-radius: 4px; margin: 4px 0; overflow-x: auto;">
              ${sanitize(JSON.stringify(parsed, null, 2))}
            </pre>
          </details>`, extraClass };
        } catch (e) {
          return { html: wrapWithFormat(`<span style="color: #333; word-wrap: break-word;">${sanitize(cleanValue)}</span>`), extraClass };
        }

      case 'longtext':
        return { html: wrapWithFormat(`<details open style="cursor: pointer;">
          <summary style="font-size: 12px; color: #666; margin-bottom: 5px; text-align: left;">📄 Full Text</summary>
          <div style="
            margin: 0; 
            line-height: 1.5; 
            color: #555; 
            word-wrap: break-word; 
            hyphens: auto;
            max-height: 150px;
            overflow-y: auto;
            padding: 5px;
            background: #fafafa;
            border-radius: 4px;
            text-align: left;
          ">${sanitize(cleanValue)}</div>
        </details>`), extraClass };

      case 'paragraph':
        return { html: wrapWithFormat(`<p style="
          margin: 0; 
          line-height: 1.4; 
          color: #555; 
          word-wrap: break-word; 
          hyphens: auto;
          text-align: left;
        ">${safeValue}</p>`), extraClass };

      case 'text':
      default:
        return { html: wrapWithFormat(`<span style="color: #333; word-wrap: break-word; text-align: left;">${safeValue}</span>`), extraClass };
    }
  }

  /**
   * Enhanced grid builder: If gridConfig is missing/empty, auto-generate grid from data keys.
   */
  buildGrid(data) {
    let gridConfig = this.options.gridConfig || {};
    const grid = {};
    let maxRow = 0;
    let maxCol = 0;

    // If gridConfig is empty, auto-generate from data keys
    if (!gridConfig || Object.keys(gridConfig).length === 0) {
      // Get all keys from data (excluding grid keys like R1C1)
      const semanticKeys = Object.keys(data).filter(k => !/^R\d+C\d+$/i.test(k));
      // Assign to grid positions row-major, unlimited columns
      gridConfig = {};
      semanticKeys.forEach((key, i) => {
        const row = 1; // All in one row by default for unlimited columns
        const col = i + 1;
        const gridKey = `R${row}C${col}`;
        // Auto-format label: capitalize and add spaces before caps
        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
        gridConfig[gridKey] = { key, label };
      });
    }

    // Build grid from config
    Object.keys(gridConfig).forEach(gridKey => {
      const match = gridKey.match(/^R(\d+)C(\d+)$/i);
      if (!match) return;
      const row = parseInt(match[1]);
      const col = parseInt(match[2]);
        if (!grid[row]) grid[row] = {};
      // Prefer grid key in data, fallback to semantic key
      let value = data[gridKey];
      if (value === undefined && gridConfig[gridKey].key) {
        value = data[gridConfig[gridKey].key];
      }
        grid[row][col] = {
        value: value,
        key: gridKey,
        displayLabel: gridConfig[gridKey].label || gridKey
        };
        maxRow = Math.max(maxRow, row);
        maxCol = Math.max(maxCol, col);
    });
    return { grid, maxRow, maxCol };
  }

  /**
   * Updates panel with new data using grid layout
   * Uses tooltip content cache for efficiency.
   * Focuses the panel for accessibility.
   * Shows the panel if it was closed.
   */
  updatePanel(name, data) {
    const panel = document.querySelector(`#${this.options.panelId}`);
    if (!panel) return;

    // Normalize the region key
    const regionKey = this._normalizeKey(name);
    // If the panel was just closed and the same region is being hovered, do not reopen
    if (this._panelClosed && this._activeRegionKey === regionKey) {
      return;
    }
    // Otherwise, show the panel and reset closed state
    panel.style.display = 'block';
    this._panelClosed = false; // The panel is now active, so reset the flag
    this._activeRegionKey = regionKey;

    const emptyState = document.querySelector('#panelEmptyState');
    const content = document.querySelector('#panelContent');
    // const title = document.querySelector('#panelTitle'); // Removed as per edit hint

    // Declare gridConfig once at the top for use throughout the function
    const gridConfig = this.options.gridConfig || {};

    // Universal: Show R1C1 value if present, else first non-empty value, else blank. Never show region key.
    let panelTitle = '';
    let r1c1Key = null;
    if (gridConfig.R1C1 && gridConfig.R1C1.key) {
      r1c1Key = gridConfig.R1C1.key;
    }
    if (r1c1Key && data[r1c1Key]) {
      panelTitle = data[r1c1Key];
    } else {
      for (const key in data) {
        if (data[key] != null && data[key] !== '') {
          panelTitle = data[key];
          break;
        }
      }
    }
    // title.textContent = panelTitle; // Removed as per edit hint

    // Hide empty state and show content
    emptyState.style.display = 'none';
    content.style.display = 'block';

    // Use cache if available
    const cacheKey = JSON.stringify({ name, data });
    if (this._tooltipContentCache.has(cacheKey)) {
      content.innerHTML = this._tooltipContentCache.get(cacheKey);
      // Accessibility: focus the panel
      panel.setAttribute('aria-label', name);
      panel.focus();
      return;
    }

    // Build grid
    const { grid, maxRow, maxCol } = this.buildGrid(data);
    
    if (maxRow === 0) {
      // No grid data found, show raw data
      content.innerHTML = `<div style="color: #555;">
        <p>Raw data available:</p>
        <pre style="font-size: 12px; background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto;">
          ${JSON.stringify(data, null, 2)}
        </pre>
      </div>`;
      return;
    }

    // --- Merge Cell Support ---
    // Parse merged cells from gridConfig (e.g., R1R4C1 means row 1-4, col 1)
    const mergedCells = [];
    Object.keys(gridConfig).forEach(key => {
      const mergeMatch = key.match(/^R(\d+)R(\d+)C(\d+)$/i);
      if (mergeMatch) {
        mergedCells.push({
          key,
          rowStart: parseInt(mergeMatch[1]),
          rowEnd: parseInt(mergeMatch[2]),
          col: parseInt(mergeMatch[3]),
          config: gridConfig[key]
        });
      }
    });
    // Track covered cells so we can skip them
    const coveredCells = new Set();
    mergedCells.forEach(cell => {
      for (let r = cell.rowStart; r <= cell.rowEnd; r++) {
        if (r === cell.rowStart) continue; // Don't mark the anchor cell
        coveredCells.add(`R${r}C${cell.col}`);
      }
    });

    // --- Unified Grid Rendering ---
    // All cells are direct children of a single grid container
    let gridHTML = `<div style="display: grid; grid-template-columns: repeat(${maxCol}, minmax(0, 1fr)); gap: 2px; align-items: center;">`;
    // Track which cells are covered by merged cells
    const mergedCellAnchors = new Set(mergedCells.map(cell => `R${cell.rowStart}C${cell.col}`));
    // Find the last row with any data (including merged cells with data)
    let lastRowWithData = 0;
    for (let row = 1; row <= maxRow; row++) {
      for (let col = 1; col <= maxCol; col++) {
        // Check normal cell
        if (grid[row] && grid[row][col] && grid[row][col].value != null && grid[row][col].value !== "") {
          lastRowWithData = row;
          break;
        }
        // Check merged cell anchor
        const mergeCell = mergedCells.find(cell => cell.rowStart === row && cell.col === col);
        if (mergeCell && data[mergeCell.config.key]) {
          lastRowWithData = Math.max(lastRowWithData, mergeCell.rowEnd);
          break;
        }
      }
    }
    for (let row = 1; row <= lastRowWithData; row++) {
      for (let col = 1; col <= maxCol; col++) {
        // Skip cells covered by a merged cell (not the anchor)
        if (coveredCells.has(`R${row}C${col}`)) continue;
        // Render merged cell if this is the anchor
        const mergeCell = mergedCells.find(cell => cell.rowStart === row && cell.col === col);
        if (mergeCell) {
          const cellKey = mergeCell.key;
          const cellConfig = mergeCell.config || {};
          const value = (grid[row] && grid[row][col] && grid[row][col].value) || (cellConfig.key && data[cellConfig.key]);
          if (value != null && value !== "") {
            const { html, extraClass } = this.renderContent(value, cellKey, cellConfig);
            gridHTML += `<div class="usvg-tooltip-cell${extraClass}" style="grid-row: ${mergeCell.rowStart} / ${mergeCell.rowEnd + 1}; grid-column: ${col};">
              ${html}
            </div>`;
          } else {
            gridHTML += `<div class="usvg-tooltip-cell" style="grid-row: ${mergeCell.rowStart} / ${mergeCell.rowEnd + 1}; grid-column: ${col};"></div>`;
          }
          continue;
        }
        // Always render all columns for every row (except merged/covered cells)
        if (grid[row] && grid[row][col] && grid[row][col].value != null && grid[row][col].value !== "") {
          const cell = grid[row][col];
          const cellConfig = gridConfig[cell.key] || {};
          // If this is the last filled cell in the row and all columns to the right are empty, span to the end and no-wrap
          let isLastFilled = true;
          for (let checkCol = col + 1; checkCol <= maxCol; checkCol++) {
            if (grid[row] && grid[row][checkCol] && grid[row][checkCol].value != null && grid[row][checkCol].value !== "") {
              isLastFilled = false;
              break;
            }
          }
          const contentType = this.detectContentType(cell.value);
          if (isLastFilled && (contentType === 'text' || contentType === 'paragraph')) {
            const { html, extraClass } = this.renderContent(cell.value, cell.key, cellConfig);
            gridHTML += `<div class="usvg-tooltip-cell usvg-tooltip-cell-span${extraClass}" style="grid-row: ${row}; grid-column: ${col} / ${maxCol + 1};">
              ${html}
            </div>`;
            col = maxCol; // will increment to maxCol+1 and exit loop
            continue;
          }
          const { html, extraClass } = this.renderContent(cell.value, cell.key, cellConfig);
          gridHTML += `<div class="usvg-tooltip-cell${extraClass}" style="grid-row: ${row}; grid-column: ${col};">
            ${html}
          </div>`;
        } else {
          // Render empty cell to maintain column alignment
          gridHTML += `<div class="usvg-tooltip-cell" style="grid-row: ${row}; grid-column: ${col};"></div>`;
        }
      }
    }
    gridHTML += '</div>';
    
    // Handle overflow columns if any
    // No overflow column warning needed for unlimited columns

    content.innerHTML = gridHTML;
    this._tooltipContentCache.set(cacheKey, gridHTML);
    // Accessibility: focus the panel
    panel.setAttribute('aria-label', name);
    panel.focus();
  }

  /**
   * Normalizes a raw region name into a consistent key.
   */
  _normalizeKey(rawName) {
    return rawName.replace(/\s+/g, "").toUpperCase();
  }

  /**
   * Sets up hover and click events for SVG paths
   * Now supports mapSelector option for targeting a specific SVG.
   * Tracks event listeners for cleanup.
   * Debounces mouseenter for performance.
   */
  setupPathEvents() {
    const svg = document.querySelector(this.options.mapSelector || 'svg');
    if (!svg) return;
    const paths = svg.querySelectorAll('path');
    // Clean up previous listeners
    if (this._boundPaths) {
      this._boundPaths.forEach(({ path, handlers }) => {
        path.removeEventListener('mouseenter', handlers.mouseenter);
        path.removeEventListener('mouseleave', handlers.mouseleave);
        path.removeEventListener('click', handlers.click);
        // Remove hover glow if present
        path.classList.remove('usvg-search-highlight');
      });
    }
    this._boundPaths = [];
    // Track the last hovered region for glow removal
    if (!this._lastHoveredRegion) this._lastHoveredRegion = null;
    paths.forEach((path) => {
      const title = path.querySelector('title');
      if (!title) return;
  
      const rawName = title.textContent.trim();
      const regionKey = this._normalizeKey(rawName);
      const data = this.tooltipData[regionKey];
  
      if (!data) return;
  
      // Style the interactive paths
      path.style.cssText += `
        cursor: pointer !important;
        transition: all 0.2s ease !important;
      `;
  
      // Add hover events
      const mouseenter = debounce(() => {
        // Remove glow from previous region
        if (this._lastHoveredRegion && this._lastHoveredRegion !== path) {
          this._lastHoveredRegion.classList.remove('usvg-search-highlight');
        }
        // Add glow to current region
        path.classList.add('usvg-search-highlight');
        this._lastHoveredRegion = path;
  
        // Only update panel if not just closed for this region
        if (!(this._panelClosed && this._activeRegionKey === regionKey)) {
          this.updatePanel(rawName, data);
        }
        path.style.opacity = '0.8';
        path.style.filter = 'brightness(1.1)';
      }, 40);
      const mouseleave = () => {
        path.style.opacity = '';
        path.style.filter = '';
        path.classList.remove('usvg-search-highlight');
        if (this._lastHoveredRegion === path) {
          this._lastHoveredRegion = null;
        }
        // Panel data stays - no reset
      };
      const click = (e) => {
        // Only allow click to reopen the panel if not just closed for this region
        if (!(this._panelClosed && this._activeRegionKey === regionKey)) {
          this.updatePanel(rawName, data);
        }
        e.preventDefault();
        e.stopPropagation();
      };
      path.addEventListener('mouseenter', mouseenter);
      path.addEventListener('mouseleave', mouseleave);
      path.addEventListener('click', click);
      this._boundPaths.push({ path, handlers: { mouseenter, mouseleave, click } });
    });
  }

  /**
   * Destroys the tooltip engine, cleaning up all DOM nodes, listeners, and caches.
   */
  destroy() {
    // Remove panel
    const panel = document.getElementById(this.options.panelId);
    if (panel) panel.remove();
    this._panel = null;
    // Remove style tag
    const styleTag = document.getElementById(`${this.options.panelId}-styles`);
    if (styleTag) styleTag.remove();
    // Remove SVG event listeners
    if (this._boundPaths) {
      this._boundPaths.forEach(({ path, handlers }) => {
        path.removeEventListener('mouseenter', handlers.mouseenter);
        path.removeEventListener('mouseleave', handlers.mouseleave);
        path.removeEventListener('click', handlers.click);
      });
      this._boundPaths = null;
    }
    // Clear caches
    if (this._tooltipContentCache) this._tooltipContentCache.clear();
    // Null out references for GC
    this.tooltipData = null;
    this.options = null;
  }

  /**
   * Reset panel to empty state
   * If panel was closed, do not show it.
   */
  resetPanel() {
    const emptyState = document.querySelector('#panelEmptyState');
    const content = document.querySelector('#panelContent');
    if (emptyState && content) {
      emptyState.style.display = 'block';
      content.style.display = 'none';
    }
  }

  /**
   * Initialize the tooltip engine
   */
  init() {
    const doInit = () => {
      this.createInfoPanel();
      this.setupPathEvents();
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', doInit);
    } else {
      doInit();
    }
  }

  /**
   * Set tooltip data for regions
   * @param {Object} data - Data object with region keys and grid data
   */
  setTooltipData(data) {
    Object.assign(this.tooltipData, data);
    this.setupPathEvents(); // Re-setup events with new data
    return this;
  }

  /**
   * Add data for a single region
   * @param {string} regionKey - Region identifier
   * @param {Object} regionData - Grid data for the region
   */
  addRegionData(regionKey, regionData) {
    this.tooltipData[this._normalizeKey(regionKey)] = regionData;
    this.setupPathEvents(); // Re-setup events with new data
    return this;
  }

  /**
   * Remove data for a region
   * @param {string} regionKey - Region identifier
   */
  removeRegionData(regionKey) {
    delete this.tooltipData[this._normalizeKey(regionKey)];
    this.setupPathEvents(); // Re-setup events
    return this;
  }

  /**
   * Update engine options
   * @param {Object} newOptions - New options to merge
   */
  updateOptions(newOptions) {
    Object.assign(this.options, newOptions);
    this.init(); // Reinitialize with new options
    return this;
  }
}

// ======================= USER CONFIGURABLE GRID CONFIG & DATA SECTION =======================
//
// 1. Define your gridConfig below. Each grid cell (e.g., R1C1) maps to an object with:
//      - key: the semantic key for data lookup (for backwards compatibility)
//      - label: the display label for the cell
//      - bold: true/false (optional, makes value bold)
//      - italic: true/false (optional, makes value italic)
//      - underline: true/false (optional, underlines value)
//      - strikethrough: true/false (optional, strikes through value)
//      - highlight: "#color" (optional, highlights value with color)
//      - fontsize: 34 (optional, sets font size in px for this cell)
//    Example:
//      const gridConfig = {
//        R1C1: { key: "names", label: "Full Name", bold: true, italic: true, fontsize: 24 },
//        R1C2: { key: "favoriteColor", label: "Favorite Color", highlight: "#ffff00", fontsize: 18 },
//        R1C3: { key: "hobby", label: "Hobby", underline: true, strikethrough: true }
//      };
// 2. If gridConfig is omitted or empty, the engine will auto-generate a grid from your data keys.
// 3. Enter your data using grid keys (R1C1, R1C2, ...) or semantic keys (names, favoriteColor, ...).
//    The engine will resolve both, but grid keys are preferred.
// 4. You can specify which SVG to target for tooltips using the mapSelector option (default: 'svg').
// ============================================================================================
/*
==================== UNIVERSAL SVG MAP TOOLTIP ENGINE - QUICK README ====================

How to Use (for Non-Technical Users):

1. Define your grid layout and labels in gridConfig (see above for example).
   - Each cell (R1C1, R1C2, etc.) gets a label and optional formatting.

2. Enter your data for each region using grid keys (recommended for simplicity):

   Example:
   const exampleData = {
     BALAMBAN: {
       R1C1: "Richard",
       R1C2: "Blue",
       R1C3: "Chess",
       R2C1: "richard@example.com",
       R2C2: "+63-32-123-4567"
     },
     ASTURIAS: {
       R1C1: "Maria",
       R1C2: "Green",
       R1C3: "Reading",
       R2C1: "maria@example.com",
       R2C2: "+63-32-987-6543"
     }
   };

3. (Optional) You can use semantic keys (like fullName, favoriteColor) if you prefer:

   Example:
const exampleData = {
     BALAMBAN: {
       fullName: "Richard",
       favoriteColor: "Blue",
       hobby: "Chess",
       email: "richard@example.com",
       phone: "+63-32-123-4567"
     }
   };
   // The engine will auto-generate a grid or you can map these in gridConfig.

4. (Advanced) You can mix both grid keys and semantic keys:

   Example:
   const exampleData = {
     BALAMBAN: {
       R1C1: "Richard",
       favoriteColor: "Blue",
       R1C3: "Chess",
       email: "richard@example.com",
       R2C2: "+63-32-123-4567"
     }
   };

5. The engine will display your data in a grid, using the labels and formatting from gridConfig.

6. You do NOT need to know programming! Just fill in the gridConfig and exampleData sections like a spreadsheet.

-----------------------------------------------------------------------------------------

TIPS:
- R1C1 means Row 1, Column 1. R2C2 means Row 2, Column 2, etc.
- Labels and formatting (bold, color, etc.) are set in gridConfig.
- You can copy-paste and edit the exampleData for your own regions.
- For more advanced features, ask a developer to help with custom renderers or formatting.

=========================================================================================
*/

// =======================
// GRIDCONFIG FORMATTING GUIDE & TUTORIAL FOR NON-TECHNICAL USERS
// =======================
/*
GRIDCONFIG FORMATTING GUIDE
--------------------------
This guide explains how to use each formatting option in gridConfig to customize your tooltip cells. You do NOT need to know programming—just copy the examples and change the values!

Each cell in gridConfig looks like this:
  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, fontsize: 15 }

Below are all the formatting options you can use:

1. key
   - What it does: Tells the engine which data to show in this cell.
   - Example: key: "NameofLGU"

2. label
   - What it does: Sets the label or title for the cell (not always shown).
   - Example: label: "LGU Name"

3. bold
   - What it does: Makes the text bold.
   - Example: bold: true

4. italic
   - What it does: Makes the text italic.
   - Example: italic: true

5. underline
   - What it does: Underlines the text.
   - Example: underline: true

6. strikethrough
   - What it does: Draws a line through the text.
   - Example: strikethrough: true

7. highlight
   - What it does: Colors the background behind the text. Use any color code (like "#ffff00" for yellow).
   - Example: highlight: "#ffff00"

8. fontsize
   - What it does: Changes the size of the text (in pixels).
   - Example: fontsize: 18

9. fontfamily
   - What it does: Changes the font style (like Arial, Times New Roman, etc.).
   - Example: fontfamily: "Arial"
   - Note: Only works if the font is available on your computer or website.

10. fontcolor
    - What it does: Changes the color of the text. Use any color code (like "#123456" or "red").
    - Example: fontcolor: "#123456"

11. horizontalalign
    - What it does: Aligns the text left, center, or right in the cell.
    - Example: horizontalalign: "center"
    - Choices: "left", "center", "right"

12. verticalalign
    - What it does: Aligns the text to the top, middle, or bottom of the cell.
    - Example: verticalalign: "middle"
    - Choices: "top", "middle", "bottom"

13. noWrap
    - What it does: Stops the text from wrapping to the next line.
    - Example: noWrap: true

14. wrapchar
    - What it does: Automatically adds a line break after a certain number of characters.
    - Example: wrapchar: 30

15. imageWidth
    - What it does: Sets the width of images in the cell (like "80px" or "60%").
    - Example: imageWidth: "80px"

--------------------------
TUTORIAL: HOW TO USE GRIDCONFIG FORMATTING
--------------------------
1. Find the gridConfig section in the file. It looks like this:

const gridConfig = {
  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, fontsize: 15 },
  R2C1: { key: "descriptionLGU", label: "Description", italic: true, wrapchar: 60 },
  R3C1: { key: "lgooName", label: "LGOO Name", fontcolor: "#0055aa", fontfamily: "Arial" },
  R4C1: { key: "lgooDesignation", label: "Designation", highlight: "#e0f7fa", horizontalalign: "center" }
};

2. To change the style of a cell, add or change the options. For example, to make the text red and bold:

  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, fontcolor: "red" }

3. To make the text bigger and centered:

  R2C1: { key: "descriptionLGU", label: "Description", fontsize: 20, horizontalalign: "center" }

4. To use a different font:

  R3C1: { key: "lgooName", label: "LGOO Name", fontfamily: "Times New Roman" }

5. To highlight a cell with yellow:

  R4C1: { key: "lgooDesignation", label: "Designation", highlight: "#ffff00" }

6. You can combine as many options as you want:

  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, italic: true, fontcolor: "#0055aa", fontsize: 18, fontfamily: "Arial", horizontalalign: "center" }

--------------------------
TIPS:
- Always use a comma between options inside the curly braces { ... }.
- Color codes can be written as "#RRGGBB" (like "#ff0000" for red) or as color names (like "blue").
- If you make a mistake, the engine will just ignore the wrong option.
- You can copy and edit the examples above for your own needs.
- If you want to see what each option does, try changing it and reload your map!

--------------------------
For more help, ask your developer or contact your website administrator.

IMPORTANT: If you do NOT want to use a formatting option, set it to false. For example:
  fontsize: false
  fontcolor: false
  fontfamily: false
  horizontalalign: false
  verticalalign: false
This will use the default style for that property, even if a value is set elsewhere.

Example:
  R1C1: { key: "NameofLGU", label: "LGU Name", fontsize: false, fontcolor: false }
This will use the default font size and color for this cell.
*/

// --- BEGIN USER GRID CONFIG ---
const gridConfig = {
  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, fontsize: 15 },
  R2C1: { key: "descriptionLGU", label: "Description", paragraph: true, wrapchar: 74, fontsize: 12 },
  R3R4C1: { key: "lgooImage", label: "LGOO Photo" },
  R3C2: { key: "lgooName", label: "LGOO Name", bold: true, wrapchar: 20, fontsize: 14 },
  R4C2: { key: "lgooDesignation", label: "LGOO Designation", fontsize: 12, wrapchar: 30 },
  R5R6C1: { key: "lgoo2Image", label: "2nd LGOO Photo" },
  R5C2: { key: "lgoo2Name", label: "2nd LGOO Name", bold: true, wrapchar: 20, fontsize: 14 },
  R6C2: { key: "lgoo2Designation", label: "2nd LGOO Designation", fontsize: 12, wrapchar: 30 }
};
// --- END USER GRID CONFIG ---



// --- BEGIN USER DATA ---
const exampleData = {
  "ASTURIAS": {
    NameofLGU: "Asturias",
    descriptionLGU: "Asturias is one of the local government units in Cebu Province.",
    lgooName: "JOHN MICHAEL B. MONILLAS",
    lgooDesignation: "MLGOO of the Municipality of Asturias",
    lgooImage: "organizationalchart/images/mackymoe_asturias.png"
  },
  "BALAMBAN": {
    NameofLGU: "Balamban",
    descriptionLGU: "Balamban is one of the local government units in Cebu Province.",
    lgooName: "EVALYN R. QUIROS",
    lgooDesignation: "MLGOO of the Municipality of Balamban",
    lgooImage: "organizationalchart/images/evalyn_balamban.png"
  },
  "BANTAYAN": {
    NameofLGU: "Bantayan",
    descriptionLGU: "Bantayan is one of the local government units in Cebu Province.",
    lgooName: "JUPITER E. DAWA",
    lgooDesignation: "MLGOO of the Municipality of Bantayan",
    lgooImage: "organizationalchart/images/jupz_bantayan.png"
  },
  "BOGO_CITY": {
    NameofLGU: "Bogo City",
    descriptionLGU: "Bogocity is one of the local government units in Cebu Province.",
    lgooName: "MAE B. DURA",
    lgooDesignation: "CLGOO of the City of Bogo",
    lgooImage: "organizationalchart/images/maedura_bogocity.png"
  },
  "DAANBANTAYAN": {
    NameofLGU: "Daanbantayan",
    descriptionLGU: "Daanbantayan is one of the local government units in Cebu Province.",
    lgooName: "GRACE Y. CABURNAY",
    lgooDesignation: "MLGOO of the Municipality of Daanbantayan",
    lgooImage: "organizationalchart/images/gracecaburnay_daanbantayan.png"
  },
  "MADRIDEJOS": {
    NameofLGU: "Madridejos",
    descriptionLGU: "Madridejos is one of the local government units in Cebu Province.",
    lgooName: "JOHN MICHAEL M. LEGASPI",
    lgooDesignation: "MLGOO of the Municipality of Madridejos",
    lgooImage: "organizationalchart/images/JM_madridejos.png"
  },
  "MEDELLIN": {
    NameofLGU: "Medellin",
    descriptionLGU: "Medellin is one of the local government units in Cebu Province.",
    lgooName: "JANIEVA A. DANDAN",
    lgooDesignation: "MLGOO of the Municipality of Medellin",
    lgooImage: "organizationalchart/images/jan_medellin.png"
  },
  "SAN_REMIGIO": {
    NameofLGU: "San Remigio",
    descriptionLGU: "San Remigio is one of the local government units in Cebu Province.",
    lgooName: "CLAIRE V. DIAZ",
    lgooDesignation: "MLGOO of the Municipality of San Remigio",
    lgooImage: "organizationalchart/images/claire_sanremigio.png"
  },
  "SANTA_FE": {
    NameofLGU: "Santa Fe",
    descriptionLGU: "Santa Fe is one of the local government units in Cebu Province.",
    lgooName: "NIÑO VINCENT B. FIEL",
    lgooDesignation: "MLGOO of the Municipality of Santa Fe",
    lgooImage: "organizationalchart/images/ninosenpai_stafe.png"
  },
  "TABOGON": {
    NameofLGU: "Tabogon",
    descriptionLGU: "Tabogon is one of the local government units in Cebu Province.",
    lgooName: "JERRY BIB PITOGO",
    lgooDesignation: "MLGOO of the Municipality of Tabogon",
    lgooImage: "organizationalchart/images/jerry_tabogon.png"
  },
  "TABUELAN": {
    NameofLGU: "Tabuelan",
    descriptionLGU: "Tabuelan is one of the local government units in Cebu Province.",
    lgooName: "EASTER-APRIL R. QUIROL",
    lgooDesignation: "MLGOO of the Municipality of Tabuelan",
    lgooImage: "organizationalchart/images/easterapril_tabuelan.png"
  },
  "TUBURAN": {
    NameofLGU: "Tuburan",
    descriptionLGU: "Tuburan is one of the local government units in Cebu Province.",
    lgooName: "LEO NICHOLAS T. PATRIANA",
    lgooDesignation: "MLGOO of the Municipality of Tuburan",
    lgooImage: "organizationalchart/images/leopatz_tuburan.png",
    lgoo2Name: "ABEL JOHN B. PEGUIT",
    lgoo2Designation: "Assistant MLGOO of the Municipality of Tuburan",
    lgoo2Image: "organizationalchart/images/avelbrother_tuburan.png"
  },
  "BORBON": {
    NameofLGU: "Borbon",
    descriptionLGU: "Borbon is one of the local government units in Cebu Province.",
    lgooName: "CECILLE C. BELCINA",
    lgooDesignation: "MLGOO of the Municipality of Borbon",
    lgooImage: "organizationalchart/images/cecilleCbelcina_borbon.png"
  },
  "CARMEN": {
    NameofLGU: "Carmen",
    descriptionLGU: "Carmen is one of the local government units in Cebu Province.",
    lgooName: "AMMIE MARIE Z. GENERALE",
    lgooDesignation: "MLGOO of the Municipality of Carmen",
    lgooImage: "organizationalchart/images/ammieMarieZGenerale_carmen.png"
  },
  "COMPOSTELA": {
    NameofLGU: "Compostela",
    descriptionLGU: "Compostela is one of the local government units in Cebu Province.",
    lgooName: "MELBOURNE O. NAVALES",
    lgooDesignation: "MLGOO of the Municipality of Compostela",
    lgooImage: "organizationalchart/images/MelbourneONavales_Compostela.png"
  },
  "CONSOLACION": {
    NameofLGU: "Consolacion",
    descriptionLGU: "Consolacion is one of the local government units in Cebu Province.",
    lgooName: "SHERYL A. PIDOR",
    lgooDesignation: "MLGOO of the Municipality of Consolacion",
    lgooImage: "organizationalchart/images/sherylpidor_consolacion.png"
  },
  "CORDOVA": {
    NameofLGU: "Cordova",
    descriptionLGU: "Cordova is one of the local government units in Cebu Province.",
    lgooName: "SHEVAH TRIXY L. CAOCTOY",
    lgooDesignation: "MLGOO of the Municipality of Cordova",
    lgooImage: "organizationalchart/images/shevahtrixyLcaoctoy_cordova.png"
  },
  "DANAO_CITY": {
    NameofLGU: "Danao City",
    descriptionLGU: "Danao City is one of the local government units in Cebu Province.",
    lgooName: "GEMMA M. BERMOY",
    lgooDesignation: "CLGOO of the City of Danao",
    lgooImage: "organizationalchart/images/gemmabermoydanao.png",
    lgoo2Name: "ANTHONY A. NIEVES",
    lgoo2Designation: "Assistant CLGOO of the City of Danao",
    lgoo2Image: "organizationalchart/images/AnthonyANIeves_Danao.png"
  },
  "LILOAN": {
    NameofLGU: "Liloan",
    descriptionLGU: "Liloan is one of the local government units in Cebu Province.",
    lgooName: "JAMES ANDREW G. ANDAYA",
    lgooDesignation: "MLGOO of the Municipality of Liloan",
    lgooImage: "organizationalchart/images/jamesandrewgandaya_liloan.png"
  },
  "PILAR": {
    NameofLGU: "Pilar",
    descriptionLGU: "Pilar is one of the local government units in Cebu Province.",
    lgooName: "LOVIE B. DE LA CRUZ",
    lgooDesignation: "MLGOO of the Municipality of Pilar",
    lgooImage: "organizationalchart/images/lovieBdeLaCruz_pilar.png"
  },
  "PORO": {
    NameofLGU: "Poro",
    descriptionLGU: "Poro is one of the local government units in Cebu Province.",
    lgooName: "CLIFF P. OTADOY",
    lgooDesignation: "MLGOO of the Municipality of Poro",
    lgooImage: "organizationalchart/images/cliff_poro.png"
  },
  "SAN_FRANCISCO": {
    NameofLGU: "San Francisco",
    descriptionLGU: "San Francisco is one of the local government units in Cebu Province.",
    lgooName: "GREGORY A. SOSMEÑA",
    lgooDesignation: "MLGOO of the Municipality of San Francisco",
    lgooImage: "organizationalchart/images/sosmena_sanfran.png"
  },
  "SOGOD": {
    NameofLGU: "Sogod",
    descriptionLGU: "Sogod is one of the local government units in Cebu Province.",
    lgooName: "SHEILA G. DENDEN",
    lgooDesignation: "MLGOO of the Municipality of Sogod",
    lgooImage: "organizationalchart/images/sheila_sogod.png"
  },
  "TUDELA": {
    NameofLGU: "Tudela",
    descriptionLGU: "Tudela is one of the local government units in Cebu Province.",
    lgooName: "PERSIUS R. BORLASA",
    lgooDesignation: "MLGOO of the Municipality of Tudela",
    lgooImage: "organizationalchart/images/perseus_tudela.png"
  },
  "ALCANTARA": {
    NameofLGU: "Alcantara",
    descriptionLGU: "Alcantara is one of the local government units in Cebu Province.",
    lgooName: "JUDELYN C. SALINAS",
    lgooDesignation: "MLGOO of the Municipality of Alcantara",
    lgooImage: "organizationalchart/images/judesalinas_alcantara.png"
  },
  "ALEGRIA": {
    NameofLGU: "Alegria",
    descriptionLGU: "Alegria is one of the local government units in Cebu Province.",
    lgooName: "JOSE REY A. PACRES",
    lgooDesignation: "MLGOO of the Municipality of Alegria",
    lgooImage: "organizationalchart/images/pacres_alegria.png",
  },
  "ALOGUINSAN": {
    NameofLGU: "Aloguinsan",
    descriptionLGU: "Aloguinsan is one of the local government units in Cebu Province.",
    lgooName: "DENNIS C. ITOM",
    lgooDesignation: "MLGOO of the Municipality of Aloguinsan",
    lgooImage: "organizationalchart/images/dennisitom_aloguinsan.png"
  },
  "BADIAN": {
    NameofLGU: "Badian",
    descriptionLGU: "Badian is one of the local government units in Cebu Province.",
    lgooName: "IRIS V. ARIAS",
    lgooDesignation: "MLGOO of the Municipality of Badian",
    lgooImage: "organizationalchart/images/irisarias_badian.png"
  },
  "BARILI": {
    NameofLGU: "Barili",
    descriptionLGU: "Barili is one of the local government units in Cebu Province.",
    lgooName: "DANN MARR P. ANDRINO",
    lgooDesignation: "MLGOO of the Municipality of Barili",
    lgooImage: "organizationalchart/images/attydannmarr_barili.png"
  },
  "DUMANJUG": {
    NameofLGU: "Dumanjug",
    descriptionLGU: "Dumanjug is one of the local government units in Cebu Province.",
    lgooName: "GLENDA G. GABUYA",
    lgooDesignation: "MLGOO of the Municipality of Dumanjug",
    lgooImage: "organizationalchart/images/gabuya_dumanjug.png"
  },
  "GINATILAN": {
    NameofLGU: "Ginatilan",
    descriptionLGU: "Ginatilan is one of the local government units in Cebu Province.",
    lgooName: "EMMANNUEL S. PEDRALBA",
    lgooDesignation: "MLGOO of the Municipality of Ginatilan",
    lgooImage: "organizationalchart/images/pedralba_ginatilan.png"
  },
  "MALABUYOC": {
    NameofLGU: "Malabuyoc",
    descriptionLGU: "Malabuyoc is one of the local government units in Cebu Province.",
    lgooName: "ELVIE S. GAUDAN",
    lgooDesignation: "MLGOO of the Municipality of Malabuyoc",
    lgooImage: "organizationalchart/images/elviegaudan_malabuyoc.png"
  },
  "MOALBOAL": {
    NameofLGU: "Moalboal",
    descriptionLGU: "Moalboal is one of the local government units in Cebu Province.",
    lgooName: "LYN N. AGUELO",
    lgooDesignation: "MLGOO of the Municipality of Moalboal",
    lgooImage: "organizationalchart/images/lynaguelo_moalboal.png"
  },
  "PINAMUNGAJAN": {
    NameofLGU: "Pinamungajan",
    descriptionLGU: "Pinamungajan is one of the local government units in Cebu Province.",
    lgooName: "JEFFREY A. LOPEZ",
    lgooDesignation: "MLGOO of the Municipality of Pinamungajan",
    lgooImage: "organizationalchart/images/lopez_pinamungajan.png"
  },
  "RONDA": {
    NameofLGU: "Ronda",
    descriptionLGU: "Ronda is one of the local government units in Cebu Province.",
    lgooName: "JOSE MENELEO C. AQUINO",
    lgooDesignation: "MLGOO of the Municipality of Ronda",
    lgooImage: "organizationalchart/images/aquino_ronda.png"
  },
  "TOLEDO_CITY": {
    NameofLGU: "Toledo City",
    descriptionLGU: "Toledocity is one of the local government units in Cebu Province.",
    lgooName: "ABRAHAM REY C. DONALDO",
    lgooDesignation: "CLGOO of the City of Toledo",
    lgooImage: "organizationalchart/images/abbeydonaldo_toledo.png"
  },
  "ALCOY": {
    NameofLGU: "Alcoy",
    descriptionLGU: "Alcoy is one of the local government units in Cebu Province.",
    lgooName: "MARIA LOURDES D. BOONE",
    lgooDesignation: "MLGOO of the Municipality of Alcoy",
    lgooImage: "organizationalchart/images/MariaLourdesDBoone_Alcoy.png"
  },
  "ARGAO": {
    NameofLGU: "Argao",
    descriptionLGU: "Argao is one of the local government units in Cebu Province.",
    lgooName: "LEWELYN M. ARQUILLANO",
    lgooDesignation: "MLGOO of the Municipality of Argao",
    lgooImage: "organizationalchart/images/lewelyn_argao.png"
  },
  "CARCAR_CITY": {
    NameofLGU: "Carcar City",
    descriptionLGU: "Carcar City is one of the local government units in Cebu Province.",
    lgooName: "MILDRED C. LASALA",
    lgooDesignation: "CLGOO of the City of Carcar",
    lgooImage: "organizationalchart/images/mildred_carcar.png"
  },
  "DALAGUETE": {
    NameofLGU: "Dalaguete",
    descriptionLGU: "Dalaguete is one of the local government units in Cebu Province.",
    lgooName: "GINABLE M. EJOC",
    lgooDesignation: "MLGOO of the Municipality of Dalaguete",
    lgooImage: "organizationalchart/images/GinableEjoc_Dalaguete.png"
  },
  "OSLOB": {
    NameofLGU: "Oslob",
    descriptionLGU: "Oslob is one of the local government units in Cebu Province.",
    lgooName: "DEANNA A. MINGUETO",
    lgooDesignation: "MLGOO of the Municipality of Oslob",
    lgooImage: "organizationalchart/images/DeannaMingueto_Oslob_SantanderRadiate.png"
  },
  "SANTANDER": {
    NameofLGU: "Santander",
    descriptionLGU: "Santander is one of the local government units in Cebu Province.",
    lgooName: "DEANNA A. MINGUETO",
    lgooDesignation: "MLGOO of the Municipality of Santander",
    lgooImage: "organizationalchart/images/DeannaMingueto_Oslob_SantanderRadiate.png"
  },
  "SAMBOAN": {
    NameofLGU: "Samboan",
    descriptionLGU: "Samboan is one of the local government units in Cebu Province.",
    lgooName: "KYM A. ALBRANDO",
    lgooDesignation: "MLGOO of the Municipality of Samboan",
    lgooImage: "organizationalchart/images/KymAlbrando_Samboan.png"
  },
  "SAN_FERNANDO": {
    NameofLGU: "San Fernando",
    descriptionLGU: "San Fernando is one of the local government units in Cebu Province.",
    lgooName: "JOSEPH ELIZAR F. MERLAS",
    lgooDesignation: "MLGOO of the Municipality of San Fernando",
    lgooImage: "organizationalchart/images/JosephElizarMerlas_SanFernando.png"
  },
  "SIBONGA": {
    NameofLGU: "Sibonga",
    descriptionLGU: "Sibonga is one of the local government units in Cebu Province.",
    lgooName: "SUSAN E. TOLENTINO",
    lgooDesignation: "MLGOO of the Municipality of Sibonga",
    lgooImage: "organizationalchart/images/susan_sibonga.png"
  },
  "TALISAY_CITY": {
    NameofLGU: "Talisay City",
    descriptionLGU: "Talisaycity is one of the local government units in Cebu Province.",
    lgooName: "ROJHELOU PATAC",
    lgooDesignation: "CLGOO of the City of Talisay",
    lgooImage: "organizationalchart/images/rojheloupatactalisay.png"
  },
  "NAGA_CITY": {
    NameofLGU: "Naga City",
    descriptionLGU: "Naga City is one of the local government units in Cebu Province.",
    lgooName: "EMMA JOYEVLYN V. CALVO",
    lgooDesignation: "CLGOO of the City of Naga",
    lgooImage: "organizationalchart/images/emma_joyevelyn_v_calvo_city_of_naga.png",
    lgoo2Name: "AILEEN GRACE B. ARGAWANON-PECA",
    lgoo2Designation: "Assistant CLGOO of the City of Naga",
    lgoo2Image: "organizationalchart/images/AileenPeca_Naga.png"
  },
    "CATMON": {
    NameofLGU: "CATMON",
    descriptionLGU: "Catmon is one of the local government units in Cebu Province.",
    lgooName: "JONALUKE V. TUBAL II",
    lgooDesignation: "MLGOO of the Municipality of Catmon",
    lgooImage: "organizationalchart/images/tubal_lgcds.png"
  },
    "MINGLANILLA": {
    NameofLGU: "MINGLANILLA",
    descriptionLGU: "Minglanilla is one of the local government units in Cebu Province.",
    lgooName: "IRENE O. ANONAR",
    lgooDesignation: "MLGOO of the Municipality of Minglanilla",
    lgooImage: "organizationalchart/images/irene_o_anonar_minglanilla.png"
  },
    "SAN_FERNANDO": {
    NameofLGU: "SAN FERNANDO",
    descriptionLGU: "San Fernando is one of the local government units in Cebu Province.",
    lgooName: "JOSEPH ELIZAR F. MERLAS",
    lgooDesignation: "MLGOO of the Municipality of San Fernando",
    lgooImage: "organizationalchart/images/JosephElizarMerlas_SanFernando.png"
  },
    "BOLJOON": {
    NameofLGU: "BOLJOON",
    descriptionLGU: "Boljoon is one of the local government units in Cebu Province.",
    lgooName: "RANDEL CEDIE J. SAMONTE",
    lgooDesignation: "MLGOO of the Municipality of Boljoon",
    lgooImage: "organizationalchart/images/RandelCedieJSamonte_Boljoon.png"
  },
};

// --- END USER DATA ---

/*
==================== EXAMPLE: PROFILE CARD LAYOUT WITH MERGED CELLS ====================

// gridConfig for a profile card layout:
const gridConfig = {
  R1C1: { key: "NameofLGU", bold: true },
  R2C1: { key: "descriptionLGU", paragraph: true },
  R3R4C1: { key: "lgooImage", imageWidth: "80px" }, // Image spans rows 3-4, column 1
  R3C2: { key: "lgooName", bold: true },
  R4C2: { key: "lgooDesignation" }
};

// exampleData for the above config:
const exampleData = {
  NameofLGU: "Bogo City",
  descriptionLGU: "Bogocity is one of the local government units in Cebu Province.",
  lgooImage: "img:organizationalchart/images/maedura_bogocity.png",
  lgooName: "MAE B. DURA",
  lgooDesignation: "CLGOO of the City of Bogo"
};

// This will render:
// - Title (Bogo City) and description at the top
// - Image in the first column, spanning two rows
// - Name and designation in the second column, aligned with the image
// - No misalignment or extra empty cells
========================================================================================
*/
// ======================= END OF USER CONFIGURABLE SECTION =======================

// --- ENGINE INITIALIZATION ---
const universalMapEngine = new UniversalSVGTooltipEngine({
  maxWidth: '500px',
  defaultMessage: 'Hover over any region to see details',
  maxColumns: 3,
  gridConfig: gridConfig, // Pass the grid config to the engine
  mapSelector: 'svg' // Change this to a more specific selector if needed
});

universalMapEngine.setTooltipData(exampleData);
window.universalMapEngine = universalMapEngine;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = UniversalSVGTooltipEngine;
}



// =======================
// GRIDCONFIG FORMATTING GUIDE & TUTORIAL FOR NON-TECHNICAL USERS
// =======================
/*
GRIDCONFIG FORMATTING GUIDE
--------------------------
This guide explains how to use each formatting option in gridConfig to customize your tooltip cells. You do NOT need to know programming—just copy the examples and change the values!

Each cell in gridConfig looks like this:
  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, fontsize: 15 }

Below are all the formatting options you can use:

1. key
   - What it does: Tells the engine which data to show in this cell.
   - Example: key: "NameofLGU"

2. label
   - What it does: Sets the label or title for the cell (not always shown).
   - Example: label: "LGU Name"

3. bold
   - What it does: Makes the text bold.
   - Example: bold: true

4. italic
   - What it does: Makes the text italic.
   - Example: italic: true

5. underline
   - What it does: Underlines the text.
   - Example: underline: true

6. strikethrough
   - What it does: Draws a line through the text.
   - Example: strikethrough: true

7. highlight
   - What it does: Colors the background behind the text. Use any color code (like "#ffff00" for yellow).
   - Example: highlight: "#ffff00"

8. fontsize
   - What it does: Changes the size of the text (in pixels).
   - Example: fontsize: 18

9. fontfamily
   - What it does: Changes the font style (like Arial, Times New Roman, etc.).
   - Example: fontfamily: "Arial"
   - Note: Only works if the font is available on your computer or website.

10. fontcolor
    - What it does: Changes the color of the text. Use any color code (like "#123456" or "red").
    - Example: fontcolor: "#123456"

11. horizontalalign
    - What it does: Aligns the text left, center, or right in the cell.
    - Example: horizontalalign: "center"
    - Choices: "left", "center", "right"

12. verticalalign
    - What it does: Aligns the text to the top, middle, or bottom of the cell.
    - Example: verticalalign: "middle"
    - Choices: "top", "middle", "bottom"

13. noWrap
    - What it does: Stops the text from wrapping to the next line.
    - Example: noWrap: true

14. wrapchar
    - What it does: Automatically adds a line break after a certain number of characters.
    - Example: wrapchar: 30

15. imageWidth
    - What it does: Sets the width of images in the cell (like "80px" or "60%").
    - Example: imageWidth: "80px"

--------------------------
TUTORIAL: HOW TO USE GRIDCONFIG FORMATTING
--------------------------
1. Find the gridConfig section in the file. It looks like this:

const gridConfig = {
  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, fontsize: 15 },
  R2C1: { key: "descriptionLGU", label: "Description", italic: true, wrapchar: 60 },
  R3C1: { key: "lgooName", label: "LGOO Name", fontcolor: "#0055aa", fontfamily: "Arial" },
  R4C1: { key: "lgooDesignation", label: "Designation", highlight: "#e0f7fa", horizontalalign: "center" }
};

2. To change the style of a cell, add or change the options. For example, to make the text red and bold:

  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, fontcolor: "red" }

3. To make the text bigger and centered:

  R2C1: { key: "descriptionLGU", label: "Description", fontsize: 20, horizontalalign: "center" }

4. To use a different font:

  R3C1: { key: "lgooName", label: "LGOO Name", fontfamily: "Times New Roman" }

5. To highlight a cell with yellow:

  R4C1: { key: "lgooDesignation", label: "Designation", highlight: "#ffff00" }

6. You can combine as many options as you want:

  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, italic: true, fontcolor: "#0055aa", fontsize: 18, fontfamily: "Arial", horizontalalign: "center" }

--------------------------
TIPS:
- Always use a comma between options inside the curly braces { ... }.
- Color codes can be written as "#RRGGBB" (like "#ff0000" for red) or as color names (like "blue").
- If you make a mistake, the engine will just ignore the wrong option.
- You can copy and edit the examples above for your own needs.
- If you want to see what each option does, try changing it and reload your map!

--------------------------
For more help, ask your developer or contact your website administrator.

IMPORTANT: If you do NOT want to use a formatting option, set it to false. For example:
  fontsize: false
  fontcolor: false
  fontfamily: false
  horizontalalign: false
  verticalalign: false
This will use the default style for that property, even if a value is set elsewhere.

Example:
  R1C1: { key: "NameofLGU", label: "LGU Name", fontsize: false, fontcolor: false }
This will use the default font size and color for this cell.
*/



// --- END USER DATA ---

/*
==================== EXAMPLE: PROFILE CARD LAYOUT WITH MERGED CELLS ====================

// gridConfig for a profile card layout:
const gridConfig = {
  R1C1: { key: "NameofLGU", bold: true },
  R2C1: { key: "descriptionLGU", paragraph: true },
  R3R4C1: { key: "lgooImage", imageWidth: "80px" }, // Image spans rows 3-4, column 1
  R3C2: { key: "lgooName", bold: true },
  R4C2: { key: "lgooDesignation" }
};

// exampleData for the above config:
const exampleData = {
  NameofLGU: "Bogo City",
  descriptionLGU: "Bogocity is one of the local government units in Cebu Province.",
  lgooImage: "img:organizationalchart/images/maedura_bogocity.png",
  lgooName: "MAE B. DURA",
  lgooDesignation: "CLGOO of the City of Bogo"
};

// This will render:
// - Title (Bogo City) and description at the top
// - Image in the first column, spanning two rows
// - Name and designation in the second column, aligned with the image
// - No misalignment or extra empty cells
========================================================================================
*/
// ======================= END OF USER CONFIGURABLE SECTION =======================





// =======================
// GRIDCONFIG FORMATTING GUIDE & TUTORIAL FOR NON-TECHNICAL USERS
// =======================
/*
GRIDCONFIG FORMATTING GUIDE
--------------------------
This guide explains how to use each formatting option in gridConfig to customize your tooltip cells. You do NOT need to know programming—just copy the examples and change the values!

Each cell in gridConfig looks like this:
  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, fontsize: 15 }

Below are all the formatting options you can use:

1. key
   - What it does: Tells the engine which data to show in this cell.
   - Example: key: "NameofLGU"

2. label
   - What it does: Sets the label or title for the cell (not always shown).
   - Example: label: "LGU Name"

3. bold
   - What it does: Makes the text bold.
   - Example: bold: true

4. italic
   - What it does: Makes the text italic.
   - Example: italic: true

5. underline
   - What it does: Underlines the text.
   - Example: underline: true

6. strikethrough
   - What it does: Draws a line through the text.
   - Example: strikethrough: true

7. highlight
   - What it does: Colors the background behind the text. Use any color code (like "#ffff00" for yellow).
   - Example: highlight: "#ffff00"

8. fontsize
   - What it does: Changes the size of the text (in pixels).
   - Example: fontsize: 18

9. fontfamily
   - What it does: Changes the font style (like Arial, Times New Roman, etc.).
   - Example: fontfamily: "Arial"
   - Note: Only works if the font is available on your computer or website.

10. fontcolor
    - What it does: Changes the color of the text. Use any color code (like "#123456" or "red").
    - Example: fontcolor: "#123456"

11. horizontalalign
    - What it does: Aligns the text left, center, or right in the cell.
    - Example: horizontalalign: "center"
    - Choices: "left", "center", "right"

12. verticalalign
    - What it does: Aligns the text to the top, middle, or bottom of the cell.
    - Example: verticalalign: "middle"
    - Choices: "top", "middle", "bottom"

13. noWrap
    - What it does: Stops the text from wrapping to the next line.
    - Example: noWrap: true

14. wrapchar
    - What it does: Automatically adds a line break after a certain number of characters.
    - Example: wrapchar: 30

15. imageWidth
    - What it does: Sets the width of images in the cell (like "80px" or "60%").
    - Example: imageWidth: "80px"

--------------------------
TUTORIAL: HOW TO USE GRIDCONFIG FORMATTING
--------------------------
1. Find the gridConfig section in the file. It looks like this:

const gridConfig = {
  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, fontsize: 15 },
  R2C1: { key: "descriptionLGU", label: "Description", italic: true, wrapchar: 60 },
  R3C1: { key: "lgooName", label: "LGOO Name", fontcolor: "#0055aa", fontfamily: "Arial" },
  R4C1: { key: "lgooDesignation", label: "Designation", highlight: "#e0f7fa", horizontalalign: "center" }
};

2. To change the style of a cell, add or change the options. For example, to make the text red and bold:

  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, fontcolor: "red" }

3. To make the text bigger and centered:

  R2C1: { key: "descriptionLGU", label: "Description", fontsize: 20, horizontalalign: "center" }

4. To use a different font:

  R3C1: { key: "lgooName", label: "LGOO Name", fontfamily: "Times New Roman" }

5. To highlight a cell with yellow:

  R4C1: { key: "lgooDesignation", label: "Designation", highlight: "#ffff00" }

6. You can combine as many options as you want:

  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, italic: true, fontcolor: "#0055aa", fontsize: 18, fontfamily: "Arial", horizontalalign: "center" }

--------------------------
TIPS:
- Always use a comma between options inside the curly braces { ... }.
- Color codes can be written as "#RRGGBB" (like "#ff0000" for red) or as color names (like "blue").
- If you make a mistake, the engine will just ignore the wrong option.
- You can copy and edit the examples above for your own needs.
- If you want to see what each option does, try changing it and reload your map!

--------------------------
For more help, ask your developer or contact your website administrator.

IMPORTANT: If you do NOT want to use a formatting option, set it to false. For example:
  fontsize: false
  fontcolor: false
  fontfamily: false
  horizontalalign: false
  verticalalign: false
This will use the default style for that property, even if a value is set elsewhere.

Example:
  R1C1: { key: "NameofLGU", label: "LGU Name", fontsize: false, fontcolor: false }
This will use the default font size and color for this cell.
*/



// --- END USER DATA ---

/*
==================== EXAMPLE: PROFILE CARD LAYOUT WITH MERGED CELLS ====================

// gridConfig for a profile card layout:
const gridConfig = {
  R1C1: { key: "NameofLGU", bold: true },
  R2C1: { key: "descriptionLGU", paragraph: true },
  R3R4C1: { key: "lgooImage", imageWidth: "80px" }, // Image spans rows 3-4, column 1
  R3C2: { key: "lgooName", bold: true },
  R4C2: { key: "lgooDesignation" }
};

// exampleData for the above config:
const exampleData = {
  NameofLGU: "Bogo City",
  descriptionLGU: "Bogocity is one of the local government units in Cebu Province.",
  lgooImage: "img:organizationalchart/images/maedura_bogocity.png",
  lgooName: "MAE B. DURA",
  lgooDesignation: "CLGOO of the City of Bogo"
};

// This will render:
// - Title (Bogo City) and description at the top
// - Image in the first column, spanning two rows
// - Name and designation in the second column, aligned with the image
// - No misalignment or extra empty cells
========================================================================================
*/
// ======================= END OF USER CONFIGURABLE SECTION =======================





// =======================
// GRIDCONFIG FORMATTING GUIDE & TUTORIAL FOR NON-TECHNICAL USERS
// =======================
/*
GRIDCONFIG FORMATTING GUIDE
--------------------------
This guide explains how to use each formatting option in gridConfig to customize your tooltip cells. You do NOT need to know programming—just copy the examples and change the values!

Each cell in gridConfig looks like this:
  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, fontsize: 15 }

Below are all the formatting options you can use:

1. key
   - What it does: Tells the engine which data to show in this cell.
   - Example: key: "NameofLGU"

2. label
   - What it does: Sets the label or title for the cell (not always shown).
   - Example: label: "LGU Name"

3. bold
   - What it does: Makes the text bold.
   - Example: bold: true

4. italic
   - What it does: Makes the text italic.
   - Example: italic: true

5. underline
   - What it does: Underlines the text.
   - Example: underline: true

6. strikethrough
   - What it does: Draws a line through the text.
   - Example: strikethrough: true

7. highlight
   - What it does: Colors the background behind the text. Use any color code (like "#ffff00" for yellow).
   - Example: highlight: "#ffff00"

8. fontsize
   - What it does: Changes the size of the text (in pixels).
   - Example: fontsize: 18

9. fontfamily
   - What it does: Changes the font style (like Arial, Times New Roman, etc.).
   - Example: fontfamily: "Arial"
   - Note: Only works if the font is available on your computer or website.

10. fontcolor
    - What it does: Changes the color of the text. Use any color code (like "#123456" or "red").
    - Example: fontcolor: "#123456"

11. horizontalalign
    - What it does: Aligns the text left, center, or right in the cell.
    - Example: horizontalalign: "center"
    - Choices: "left", "center", "right"

12. verticalalign
    - What it does: Aligns the text to the top, middle, or bottom of the cell.
    - Example: verticalalign: "middle"
    - Choices: "top", "middle", "bottom"

13. noWrap
    - What it does: Stops the text from wrapping to the next line.
    - Example: noWrap: true

14. wrapchar
    - What it does: Automatically adds a line break after a certain number of characters.
    - Example: wrapchar: 30

15. imageWidth
    - What it does: Sets the width of images in the cell (like "80px" or "60%").
    - Example: imageWidth: "80px"

--------------------------
TUTORIAL: HOW TO USE GRIDCONFIG FORMATTING
--------------------------
1. Find the gridConfig section in the file. It looks like this:

const gridConfig = {
  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, fontsize: 15 },
  R2C1: { key: "descriptionLGU", label: "Description", italic: true, wrapchar: 60 },
  R3C1: { key: "lgooName", label: "LGOO Name", fontcolor: "#0055aa", fontfamily: "Arial" },
  R4C1: { key: "lgooDesignation", label: "Designation", highlight: "#e0f7fa", horizontalalign: "center" }
};

2. To change the style of a cell, add or change the options. For example, to make the text red and bold:

  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, fontcolor: "red" }

3. To make the text bigger and centered:

  R2C1: { key: "descriptionLGU", label: "Description", fontsize: 20, horizontalalign: "center" }

4. To use a different font:

  R3C1: { key: "lgooName", label: "LGOO Name", fontfamily: "Times New Roman" }

5. To highlight a cell with yellow:

  R4C1: { key: "lgooDesignation", label: "Designation", highlight: "#ffff00" }

6. You can combine as many options as you want:

  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, italic: true, fontcolor: "#0055aa", fontsize: 18, fontfamily: "Arial", horizontalalign: "center" }

--------------------------
TIPS:
- Always use a comma between options inside the curly braces { ... }.
- Color codes can be written as "#RRGGBB" (like "#ff0000" for red) or as color names (like "blue").
- If you make a mistake, the engine will just ignore the wrong option.
- You can copy and edit the examples above for your own needs.
- If you want to see what each option does, try changing it and reload your map!

--------------------------
For more help, ask your developer or contact your website administrator.

IMPORTANT: If you do NOT want to use a formatting option, set it to false. For example:
  fontsize: false
  fontcolor: false
  fontfamily: false
  horizontalalign: false
  verticalalign: false
This will use the default style for that property, even if a value is set elsewhere.

Example:
  R1C1: { key: "NameofLGU", label: "LGU Name", fontsize: false, fontcolor: false }
This will use the default font size and color for this cell.
*/


// --- END USER DATA ---

/*
==================== EXAMPLE: PROFILE CARD LAYOUT WITH MERGED CELLS ====================

// gridConfig for a profile card layout:
const gridConfig = {
  R1C1: { key: "NameofLGU", bold: true },
  R2C1: { key: "descriptionLGU", paragraph: true },
  R3R4C1: { key: "lgooImage", imageWidth: "80px" }, // Image spans rows 3-4, column 1
  R3C2: { key: "lgooName", bold: true },
  R4C2: { key: "lgooDesignation" }
};

// exampleData for the above config:
const exampleData = {
  NameofLGU: "Bogo City",
  descriptionLGU: "Bogocity is one of the local government units in Cebu Province.",
  lgooImage: "img:organizationalchart/images/maedura_bogocity.png",
  lgooName: "MAE B. DURA",
  lgooDesignation: "CLGOO of the City of Bogo"
};

// This will render:
// - Title (Bogo City) and description at the top
// - Image in the first column, spanning two rows
// - Name and designation in the second column, aligned with the image
// - No misalignment or extra empty cells
========================================================================================
*/
// ======================= END OF USER CONFIGURABLE SECTION =======================





// =======================
// GRIDCONFIG FORMATTING GUIDE & TUTORIAL FOR NON-TECHNICAL USERS
// =======================
/*
GRIDCONFIG FORMATTING GUIDE
--------------------------
This guide explains how to use each formatting option in gridConfig to customize your tooltip cells. You do NOT need to know programming—just copy the examples and change the values!

Each cell in gridConfig looks like this:
  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, fontsize: 15 }

Below are all the formatting options you can use:

1. key
   - What it does: Tells the engine which data to show in this cell.
   - Example: key: "NameofLGU"

2. label
   - What it does: Sets the label or title for the cell (not always shown).
   - Example: label: "LGU Name"

3. bold
   - What it does: Makes the text bold.
   - Example: bold: true

4. italic
   - What it does: Makes the text italic.
   - Example: italic: true

5. underline
   - What it does: Underlines the text.
   - Example: underline: true

6. strikethrough
   - What it does: Draws a line through the text.
   - Example: strikethrough: true

7. highlight
   - What it does: Colors the background behind the text. Use any color code (like "#ffff00" for yellow).
   - Example: highlight: "#ffff00"

8. fontsize
   - What it does: Changes the size of the text (in pixels).
   - Example: fontsize: 18

9. fontfamily
   - What it does: Changes the font style (like Arial, Times New Roman, etc.).
   - Example: fontfamily: "Arial"
   - Note: Only works if the font is available on your computer or website.

10. fontcolor
    - What it does: Changes the color of the text. Use any color code (like "#123456" or "red").
    - Example: fontcolor: "#123456"

11. horizontalalign
    - What it does: Aligns the text left, center, or right in the cell.
    - Example: horizontalalign: "center"
    - Choices: "left", "center", "right"

12. verticalalign
    - What it does: Aligns the text to the top, middle, or bottom of the cell.
    - Example: verticalalign: "middle"
    - Choices: "top", "middle", "bottom"

13. noWrap
    - What it does: Stops the text from wrapping to the next line.
    - Example: noWrap: true

14. wrapchar
    - What it does: Automatically adds a line break after a certain number of characters.
    - Example: wrapchar: 30

15. imageWidth
    - What it does: Sets the width of images in the cell (like "80px" or "60%").
    - Example: imageWidth: "80px"

--------------------------
TUTORIAL: HOW TO USE GRIDCONFIG FORMATTING
--------------------------
1. Find the gridConfig section in the file. It looks like this:

const gridConfig = {
  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, fontsize: 15 },
  R2C1: { key: "descriptionLGU", label: "Description", italic: true, wrapchar: 60 },
  R3C1: { key: "lgooName", label: "LGOO Name", fontcolor: "#0055aa", fontfamily: "Arial" },
  R4C1: { key: "lgooDesignation", label: "Designation", highlight: "#e0f7fa", horizontalalign: "center" }
};

2. To change the style of a cell, add or change the options. For example, to make the text red and bold:

  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, fontcolor: "red" }

3. To make the text bigger and centered:

  R2C1: { key: "descriptionLGU", label: "Description", fontsize: 20, horizontalalign: "center" }

4. To use a different font:

  R3C1: { key: "lgooName", label: "LGOO Name", fontfamily: "Times New Roman" }

5. To highlight a cell with yellow:

  R4C1: { key: "lgooDesignation", label: "Designation", highlight: "#ffff00" }

6. You can combine as many options as you want:

  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, italic: true, fontcolor: "#0055aa", fontsize: 18, fontfamily: "Arial", horizontalalign: "center" }

--------------------------
TIPS:
- Always use a comma between options inside the curly braces { ... }.
- Color codes can be written as "#RRGGBB" (like "#ff0000" for red) or as color names (like "blue").
- If you make a mistake, the engine will just ignore the wrong option.
- You can copy and edit the examples above for your own needs.
- If you want to see what each option does, try changing it and reload your map!

--------------------------
For more help, ask your developer or contact your website administrator.

IMPORTANT: If you do NOT want to use a formatting option, set it to false. For example:
  fontsize: false
  fontcolor: false
  fontfamily: false
  horizontalalign: false
  verticalalign: false
This will use the default style for that property, even if a value is set elsewhere.

Example:
  R1C1: { key: "NameofLGU", label: "LGU Name", fontsize: false, fontcolor: false }
This will use the default font size and color for this cell.
*/


// --- END USER DATA ---

/*
==================== EXAMPLE: PROFILE CARD LAYOUT WITH MERGED CELLS ====================

// gridConfig for a profile card layout:
const gridConfig = {
  R1C1: { key: "NameofLGU", bold: true },
  R2C1: { key: "descriptionLGU", paragraph: true },
  R3R4C1: { key: "lgooImage", imageWidth: "80px" }, // Image spans rows 3-4, column 1
  R3C2: { key: "lgooName", bold: true },
  R4C2: { key: "lgooDesignation" }
};

// exampleData for the above config:
const exampleData = {
  NameofLGU: "Bogo City",
  descriptionLGU: "Bogocity is one of the local government units in Cebu Province.",
  lgooImage: "img:organizationalchart/images/maedura_bogocity.png",
  lgooName: "MAE B. DURA",
  lgooDesignation: "CLGOO of the City of Bogo"
};

// This will render:
// - Title (Bogo City) and description at the top
// - Image in the first column, spanning two rows
// - Name and designation in the second column, aligned with the image
// - No misalignment or extra empty cells
========================================================================================
*/
// ======================= END OF USER CONFIGURABLE SECTION =======================





// =======================
// GRIDCONFIG FORMATTING GUIDE & TUTORIAL FOR NON-TECHNICAL USERS
// =======================
/*
GRIDCONFIG FORMATTING GUIDE
--------------------------
This guide explains how to use each formatting option in gridConfig to customize your tooltip cells. You do NOT need to know programming—just copy the examples and change the values!

Each cell in gridConfig looks like this:
  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, fontsize: 15 }

Below are all the formatting options you can use:

1. key
   - What it does: Tells the engine which data to show in this cell.
   - Example: key: "NameofLGU"

2. label
   - What it does: Sets the label or title for the cell (not always shown).
   - Example: label: "LGU Name"

3. bold
   - What it does: Makes the text bold.
   - Example: bold: true

4. italic
   - What it does: Makes the text italic.
   - Example: italic: true

5. underline
   - What it does: Underlines the text.
   - Example: underline: true

6. strikethrough
   - What it does: Draws a line through the text.
   - Example: strikethrough: true

7. highlight
   - What it does: Colors the background behind the text. Use any color code (like "#ffff00" for yellow).
   - Example: highlight: "#ffff00"

8. fontsize
   - What it does: Changes the size of the text (in pixels).
   - Example: fontsize: 18

9. fontfamily
   - What it does: Changes the font style (like Arial, Times New Roman, etc.).
   - Example: fontfamily: "Arial"
   - Note: Only works if the font is available on your computer or website.

10. fontcolor
    - What it does: Changes the color of the text. Use any color code (like "#123456" or "red").
    - Example: fontcolor: "#123456"

11. horizontalalign
    - What it does: Aligns the text left, center, or right in the cell.
    - Example: horizontalalign: "center"
    - Choices: "left", "center", "right"

12. verticalalign
    - What it does: Aligns the text to the top, middle, or bottom of the cell.
    - Example: verticalalign: "middle"
    - Choices: "top", "middle", "bottom"

13. noWrap
    - What it does: Stops the text from wrapping to the next line.
    - Example: noWrap: true

14. wrapchar
    - What it does: Automatically adds a line break after a certain number of characters.
    - Example: wrapchar: 30

15. imageWidth
    - What it does: Sets the width of images in the cell (like "80px" or "60%").
    - Example: imageWidth: "80px"

--------------------------
TUTORIAL: HOW TO USE GRIDCONFIG FORMATTING
--------------------------
1. Find the gridConfig section in the file. It looks like this:

const gridConfig = {
  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, fontsize: 15 },
  R2C1: { key: "descriptionLGU", label: "Description", italic: true, wrapchar: 60 },
  R3C1: { key: "lgooName", label: "LGOO Name", fontcolor: "#0055aa", fontfamily: "Arial" },
  R4C1: { key: "lgooDesignation", label: "Designation", highlight: "#e0f7fa", horizontalalign: "center" }
};

2. To change the style of a cell, add or change the options. For example, to make the text red and bold:

  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, fontcolor: "red" }

3. To make the text bigger and centered:

  R2C1: { key: "descriptionLGU", label: "Description", fontsize: 20, horizontalalign: "center" }

4. To use a different font:

  R3C1: { key: "lgooName", label: "LGOO Name", fontfamily: "Times New Roman" }

5. To highlight a cell with yellow:

  R4C1: { key: "lgooDesignation", label: "Designation", highlight: "#ffff00" }

6. You can combine as many options as you want:

  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, italic: true, fontcolor: "#0055aa", fontsize: 18, fontfamily: "Arial", horizontalalign: "center" }

--------------------------
TIPS:
- Always use a comma between options inside the curly braces { ... }.
- Color codes can be written as "#RRGGBB" (like "#ff0000" for red) or as color names (like "blue").
- If you make a mistake, the engine will just ignore the wrong option.
- You can copy and edit the examples above for your own needs.
- If you want to see what each option does, try changing it and reload your map!

--------------------------
For more help, ask your developer or contact your website administrator.

IMPORTANT: If you do NOT want to use a formatting option, set it to false. For example:
  fontsize: false
  fontcolor: false
  fontfamily: false
  horizontalalign: false
  verticalalign: false
This will use the default style for that property, even if a value is set elsewhere.

Example:
  R1C1: { key: "NameofLGU", label: "LGU Name", fontsize: false, fontcolor: false }
This will use the default font size and color for this cell.
*/


// --- END USER DATA ---

/*
==================== EXAMPLE: PROFILE CARD LAYOUT WITH MERGED CELLS ====================

// gridConfig for a profile card layout:
const gridConfig = {
  R1C1: { key: "NameofLGU", bold: true },
  R2C1: { key: "descriptionLGU", paragraph: true },
  R3R4C1: { key: "lgooImage", imageWidth: "80px" }, // Image spans rows 3-4, column 1
  R3C2: { key: "lgooName", bold: true },
  R4C2: { key: "lgooDesignation" }
};

// exampleData for the above config:
const exampleData = {
  NameofLGU: "Bogo City",
  descriptionLGU: "Bogocity is one of the local government units in Cebu Province.",
  lgooImage: "img:organizationalchart/images/maedura_bogocity.png",
  lgooName: "MAE B. DURA",
  lgooDesignation: "CLGOO of the City of Bogo"
};

// This will render:
// - Title (Bogo City) and description at the top
// - Image in the first column, spanning two rows
// - Name and designation in the second column, aligned with the image
// - No misalignment or extra empty cells
========================================================================================
*/
// ======================= END OF USER CONFIGURABLE SECTION =======================





// =======================
// GRIDCONFIG FORMATTING GUIDE & TUTORIAL FOR NON-TECHNICAL USERS
// =======================
/*
GRIDCONFIG FORMATTING GUIDE
--------------------------
This guide explains how to use each formatting option in gridConfig to customize your tooltip cells. You do NOT need to know programming—just copy the examples and change the values!

Each cell in gridConfig looks like this:
  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, fontsize: 15 }

Below are all the formatting options you can use:

1. key
   - What it does: Tells the engine which data to show in this cell.
   - Example: key: "NameofLGU"

2. label
   - What it does: Sets the label or title for the cell (not always shown).
   - Example: label: "LGU Name"

3. bold
   - What it does: Makes the text bold.
   - Example: bold: true

4. italic
   - What it does: Makes the text italic.
   - Example: italic: true

5. underline
   - What it does: Underlines the text.
   - Example: underline: true

6. strikethrough
   - What it does: Draws a line through the text.
   - Example: strikethrough: true

7. highlight
   - What it does: Colors the background behind the text. Use any color code (like "#ffff00" for yellow).
   - Example: highlight: "#ffff00"

8. fontsize
   - What it does: Changes the size of the text (in pixels).
   - Example: fontsize: 18

9. fontfamily
   - What it does: Changes the font style (like Arial, Times New Roman, etc.).
   - Example: fontfamily: "Arial"
   - Note: Only works if the font is available on your computer or website.

10. fontcolor
    - What it does: Changes the color of the text. Use any color code (like "#123456" or "red").
    - Example: fontcolor: "#123456"

11. horizontalalign
    - What it does: Aligns the text left, center, or right in the cell.
    - Example: horizontalalign: "center"
    - Choices: "left", "center", "right"

12. verticalalign
    - What it does: Aligns the text to the top, middle, or bottom of the cell.
    - Example: verticalalign: "middle"
    - Choices: "top", "middle", "bottom"

13. noWrap
    - What it does: Stops the text from wrapping to the next line.
    - Example: noWrap: true

14. wrapchar
    - What it does: Automatically adds a line break after a certain number of characters.
    - Example: wrapchar: 30

15. imageWidth
    - What it does: Sets the width of images in the cell (like "80px" or "60%").
    - Example: imageWidth: "80px"

--------------------------
TUTORIAL: HOW TO USE GRIDCONFIG FORMATTING
--------------------------
1. Find the gridConfig section in the file. It looks like this:

const gridConfig = {
  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, fontsize: 15 },
  R2C1: { key: "descriptionLGU", label: "Description", italic: true, wrapchar: 60 },
  R3C1: { key: "lgooName", label: "LGOO Name", fontcolor: "#0055aa", fontfamily: "Arial" },
  R4C1: { key: "lgooDesignation", label: "Designation", highlight: "#e0f7fa", horizontalalign: "center" }
};

2. To change the style of a cell, add or change the options. For example, to make the text red and bold:

  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, fontcolor: "red" }

3. To make the text bigger and centered:

  R2C1: { key: "descriptionLGU", label: "Description", fontsize: 20, horizontalalign: "center" }

4. To use a different font:

  R3C1: { key: "lgooName", label: "LGOO Name", fontfamily: "Times New Roman" }

5. To highlight a cell with yellow:

  R4C1: { key: "lgooDesignation", label: "Designation", highlight: "#ffff00" }

6. You can combine as many options as you want:

  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, italic: true, fontcolor: "#0055aa", fontsize: 18, fontfamily: "Arial", horizontalalign: "center" }

--------------------------
TIPS:
- Always use a comma between options inside the curly braces { ... }.
- Color codes can be written as "#RRGGBB" (like "#ff0000" for red) or as color names (like "blue").
- If you make a mistake, the engine will just ignore the wrong option.
- You can copy and edit the examples above for your own needs.
- If you want to see what each option does, try changing it and reload your map!

--------------------------
For more help, ask your developer or contact your website administrator.

IMPORTANT: If you do NOT want to use a formatting option, set it to false. For example:
  fontsize: false
  fontcolor: false
  fontfamily: false
  horizontalalign: false
  verticalalign: false
This will use the default style for that property, even if a value is set elsewhere.

Example:
  R1C1: { key: "NameofLGU", label: "LGU Name", fontsize: false, fontcolor: false }
This will use the default font size and color for this cell.
*/





// =======================
// GRIDCONFIG FORMATTING GUIDE & TUTORIAL FOR NON-TECHNICAL USERS
// =======================
/*
GRIDCONFIG FORMATTING GUIDE
--------------------------
This guide explains how to use each formatting option in gridConfig to customize your tooltip cells. You do NOT need to know programming—just copy the examples and change the values!

Each cell in gridConfig looks like this:
  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, fontsize: 15 }

Below are all the formatting options you can use:

1. key
   - What it does: Tells the engine which data to show in this cell.
   - Example: key: "NameofLGU"

2. label
   - What it does: Sets the label or title for the cell (not always shown).
   - Example: label: "LGU Name"

3. bold
   - What it does: Makes the text bold.
   - Example: bold: true

4. italic
   - What it does: Makes the text italic.
   - Example: italic: true

5. underline
   - What it does: Underlines the text.
   - Example: underline: true

6. strikethrough
   - What it does: Draws a line through the text.
   - Example: strikethrough: true

7. highlight
   - What it does: Colors the background behind the text. Use any color code (like "#ffff00" for yellow).
   - Example: highlight: "#ffff00"

8. fontsize
   - What it does: Changes the size of the text (in pixels).
   - Example: fontsize: 18

9. fontfamily
   - What it does: Changes the font style (like Arial, Times New Roman, etc.).
   - Example: fontfamily: "Arial"
   - Note: Only works if the font is available on your computer or website.

10. fontcolor
    - What it does: Changes the color of the text. Use any color code (like "#123456" or "red").
    - Example: fontcolor: "#123456"

11. horizontalalign
    - What it does: Aligns the text left, center, or right in the cell.
    - Example: horizontalalign: "center"
    - Choices: "left", "center", "right"

12. verticalalign
    - What it does: Aligns the text to the top, middle, or bottom of the cell.
    - Example: verticalalign: "middle"
    - Choices: "top", "middle", "bottom"

13. noWrap
    - What it does: Stops the text from wrapping to the next line.
    - Example: noWrap: true

14. wrapchar
    - What it does: Automatically adds a line break after a certain number of characters.
    - Example: wrapchar: 30

15. imageWidth
    - What it does: Sets the width of images in the cell (like "80px" or "60%").
    - Example: imageWidth: "80px"

--------------------------
TUTORIAL: HOW TO USE GRIDCONFIG FORMATTING
--------------------------
1. Find the gridConfig section in the file. It looks like this:

const gridConfig = {
  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, fontsize: 15 },
  R2C1: { key: "descriptionLGU", label: "Description", italic: true, wrapchar: 60 },
  R3C1: { key: "lgooName", label: "LGOO Name", fontcolor: "#0055aa", fontfamily: "Arial" },
  R4C1: { key: "lgooDesignation", label: "Designation", highlight: "#e0f7fa", horizontalalign: "center" }
};

2. To change the style of a cell, add or change the options. For example, to make the text red and bold:

  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, fontcolor: "red" }

3. To make the text bigger and centered:

  R2C1: { key: "descriptionLGU", label: "Description", fontsize: 20, horizontalalign: "center" }

4. To use a different font:

  R3C1: { key: "lgooName", label: "LGOO Name", fontfamily: "Times New Roman" }

5. To highlight a cell with yellow:

  R4C1: { key: "lgooDesignation", label: "Designation", highlight: "#ffff00" }

6. You can combine as many options as you want:

  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true, italic: true, fontcolor: "#0055aa", fontsize: 18, fontfamily: "Arial", horizontalalign: "center" }

--------------------------
TIPS:
- Always use a comma between options inside the curly braces { ... }.
- Color codes can be written as "#RRGGBB" (like "#ff0000" for red) or as color names (like "blue").
- If you make a mistake, the engine will just ignore the wrong option.
- You can copy and edit the examples above for your own needs.
- If you want to see what each option does, try changing it and reload your map!

--------------------------
For more help, ask your developer or contact your website administrator.

IMPORTANT: If you do NOT want to use a formatting option, set it to false. For example:
  fontsize: false
  fontcolor: false
  fontfamily: false
  horizontalalign: false
  verticalalign: false
This will use the default style for that property, even if a value is set elsewhere.

Example:
  R1C1: { key: "NameofLGU", label: "LGU Name", fontsize: false, fontcolor: false }
This will use the default font size and color for this cell.
*/

// Add a helper to detect safe video iframes
function isSafeVideoIframe(html) {
  // Allow only iframes from trusted video platforms
  const allowedHosts = [
    'youtube.com', 'www.youtube.com', 'youtu.be',
    'player.vimeo.com', 'vimeo.com',
    'www.dailymotion.com', 'dailymotion.com',
    'www.facebook.com', 'facebook.com',
    'player.twitch.tv', 'twitch.tv'
  ];
  try {
    const div = document.createElement('div');
    div.innerHTML = html;
    const iframe = div.querySelector('iframe');
    if (!iframe) return false;
    const src = iframe.src;
    if (!src) return false;
    const url = new URL(src, window.location.origin);
    return allowedHosts.some(host => url.hostname.endsWith(host));
  } catch (e) {
    return false;
  }
}

/*
... (existing docs) ...

--------------------------
TUTORIAL: HOW TO EMBED VIDEOS IN TOOLTIP CELLS
--------------------------
You can show videos (like YouTube, Vimeo, Facebook, etc.) inside your tooltip by following these easy steps. No programming needed!

1. Go to the video you want to embed (YouTube, Vimeo, etc.).
2. Find the "Share" or "Embed" button below the video.
3. Click "Embed" and copy the code that looks like <iframe ...></iframe>.
4. In your data, paste the code after html: like this:

   myVideo: 'html:<iframe width="300" height="169" src="https://www.youtube.com/embed/VIDEO_ID" frameborder="0" allowfullscreen></iframe>'

5. In your gridConfig, make sure the cell uses the key you chose (like myVideo):

   R2C1: { key: "myVideo", label: "Watch Video" }

6. Save and reload your map. The video should appear in the tooltip!

--------------------------
EXAMPLES FOR POPULAR VIDEO PLATFORMS
--------------------------

YOUTUBE:
- Click "Share" under the video, then "Embed". Copy the <iframe> code.
- Example:
  myVideo: 'html:<iframe width="300" height="169" src="https://www.youtube.com/embed/VIDEO_ID" frameborder="0" allowfullscreen></iframe>'

VIMEO:
- Click the "Share" button (paper plane icon), then copy the <iframe> code under "Embed".
- Example:
  myVideo: 'html:<iframe src="https://player.vimeo.com/video/123456789" width="300" height="169" frameborder="0" allowfullscreen></iframe>'

FACEBOOK:
- Click the three dots on the video, choose "Embed", and copy the <iframe> code.
- Example:
  myVideo: 'html:<iframe src="https://www.facebook.com/plugins/video.php?href=VIDEO_URL" width="300" height="169" frameborder="0" allowfullscreen></iframe>'

DAILYMOTION:
- Click "Share", then "Embed", and copy the <iframe> code.
- Example:  myVideo: 'html:<iframe frameborder="0" width="300" height="169" src="https://www.dailymotion.com/embed/video/x7xyzab" allowfullscreen></iframe>'

TWITCH:
- Click the "Share" button, then "Embed" and copy the <iframe> code.
- Example:  myVideo: 'html:<iframe src="https://player.twitch.tv/?video=123456789&parent=yourdomain.com" width="300" height="169" frameborder="0" allowfullscreen></iframe>'

--------------------------
IMPORTANT NOTES
--------------------------
- Only videos from trusted sites (YouTube, Vimeo, Facebook, Dailymotion, Twitch) will work. Others may not show up.
- Always use the code that starts with <iframe ...> and paste it after html: in your data.
- You can change the width and height numbers to make the video bigger or smaller.
- If the video does not show up, double-check that you copied the full <iframe> code and that the link is from a supported site.
- If you see a message about "video not supported" or nothing appears, ask your website administrator for help.

--------------------------
TIPS
--------------------------
- You can add more than one video by using different keys (like myVideo1, myVideo2).
- You can add a label in gridConfig to describe the video (like "Watch Video").
- If you want to embed a video from another site, ask your developer to add it to the trusted list.

--------------------------
For more help, ask your developer or contact your website administrator.
*/

// ======================= SEARCH ENGINE TOOLTIP (ADDED BY AI) =======================
(function addSearchEngineTooltip() {
  // --- CONFIG ---
  const SEARCH_BOX_ID = 'dilgcebu-search-tooltip-box';
  const SEARCH_BOX_CLASS = 'dilgcebu-search-tooltip-box';
  const SEARCH_DROPDOWN_ID = 'dilgcebu-search-tooltip-dropdown';
  const HIGHLIGHT_CLASS = 'usvg-search-highlight';
  const SEARCH_BTN_ID = 'usvg-search-tooltip-btn';
  const SEARCH_RESET_BTN_ID = 'usvg-search-tooltip-reset-btn';
  const SEARCH_TOOLTIP_STYLE_ID = 'usvg-search-tooltip-style';
  const SEARCH_TOOLTIP_ZINDEX = 2147483648;
  // --- END CONFIG ---

  // --- STYLE ---
  if (!document.getElementById(SEARCH_TOOLTIP_STYLE_ID)) {
    // Remove any legacy or duplicate style tags for the search box
    document.querySelectorAll('style#usvg-search-tooltip-style').forEach(s => { if (s !== null) s.remove(); });
    // Inject style as the last style in <head> for maximum specificity
    const style = document.createElement('style');
    style.id = SEARCH_TOOLTIP_STYLE_ID;
    style.textContent = `
      /*
        The following rules allow the dropdown to expand beyond the search box. Overflow is now visible and the dropdown can be up to 300px tall.
      */
      @media (max-width: 600px) {
        .dilgcebu-search-tooltip-box {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          height: 0 !important;
          min-height: 0 !important;
          max-height: 0 !important;
          width: 0 !important;
          min-width: 0 !important;
          max-width: 0 !important;
          padding: 0 !important;
          margin: 0 !important;
          border: none !important;
          box-shadow: none !important;
        }
      }
      .dilgcebu-search-tooltip-box {
        position: fixed !important;
        top: calc(100px + 20px) !important;
        right: 32px !important;
        z-index: ${SEARCH_TOOLTIP_ZINDEX} !important;
        background: #fff !important;
        border: 1px solid #ddd !important;
        border-radius: 8px !important;
        box-shadow: 0 4px 20px rgba(0,0,0,0.13) !important;
        padding: 5px 3px !important;
        width: 400px !important;
        height: 100px !important;
        min-width: 400px !important;
        max-width: 400px !important;
        min-height: 100px !important;
        max-height: 100px !important;
        font-family: Arial, sans-serif !important;
        font-size: 14px !important;
        display: flex !important;
        flex-direction: column !important;
        gap: 6px !important;
        align-items: stretch !important;
        box-sizing: border-box !important;
        overflow: visible !important; /* Allow dropdown to escape the box */
      }
      .dilgcebu-search-tooltip-box input[type="text"] {
        width: 100% !important;
        padding: 6px 8px !important;
        border: 1px solid #bbb !important;
        border-radius: 5px !important;
        font-size: 14px !important;
        outline: none !important;
        margin-bottom: 2px !important;
      }
      .dilgcebu-search-tooltip-box button {
        margin-top: 2px !important;
        padding: 5px 10px !important;
        border: none !important;
        border-radius: 5px !important;
        background: #2196F3 !important;
        color: #fff !important;
        font-size: 13px !important;
        cursor: pointer !important;
        transition: background 0.2s !important;
      }
      .dilgcebu-search-tooltip-box button:hover {
        background: #1769aa !important;
      }
      .dilgcebu-search-tooltip-box #dilgcebu-search-tooltip-dropdown {
        position: absolute !important;
        top: 54px !important;
        left: 0 !important;
        right: 0 !important;
        max-height: 300px !important; /* Allow dropdown to be up to 300px tall */
        overflow-y: auto !important;
        z-index: 99999 !important;
        background: #fff !important;
        border: 1px solid #ccc !important;
        border-radius: 0 0 8px 8px !important;
        box-shadow: 0 2px 8px rgba(0,0,0,0.08) !important;
        display: none;
      }
      .dilgcebu-search-tooltip-box #dilgcebu-search-tooltip-dropdown .usvg-search-result {
        padding: 7px 12px !important;
        cursor: pointer !important;
        font-size: 14px !important;
        border-bottom: 1px solid #f0f0f0 !important;
        transition: background 0.15s !important;
      }
      .dilgcebu-search-tooltip-box #dilgcebu-search-tooltip-dropdown .usvg-search-result:last-child {
        border-bottom: none !important;
      }
      .dilgcebu-search-tooltip-box #dilgcebu-search-tooltip-dropdown .usvg-search-result:hover,
      .dilgcebu-search-tooltip-box #dilgcebu-search-tooltip-dropdown .usvg-search-result.active {
        background: #e3f2fd !important;
      }
      .${HIGHLIGHT_CLASS} {
        stroke: #ff9800 !important;
        stroke-width: 8 !important;
        filter: drop-shadow(0 0 12px #ff9800cc) drop-shadow(0 0 24px #ff9800aa) !important;
        opacity: 1 !important;
        fill: rgba(255, 200, 40, 0.18) !important;
        transition: stroke-width 0.2s, filter 0.2s, fill 0.2s !important;
      }
    `;
    document.head.appendChild(style);
  }

  // --- UI ---
  if (document.getElementById(SEARCH_BOX_ID)) return; // Prevent double init
  const searchBox = document.createElement('div');
  searchBox.id = SEARCH_BOX_ID;
  searchBox.className = SEARCH_BOX_CLASS;
  // Set inline styles for bulletproof enforcement
  searchBox.style.width = '400px';
  searchBox.style.height = '125px';
  searchBox.style.minWidth = '400px';
  searchBox.style.maxWidth = '400px';
  searchBox.style.minHeight = '125px';
  searchBox.style.maxHeight = '125px';
  searchBox.style.overflow = 'hidden';
  searchBox.style.position = 'fixed';
  searchBox.style.top = 'calc(100px + 20px)';
  searchBox.style.right = '32px';
  searchBox.style.zIndex = String(SEARCH_TOOLTIP_ZINDEX);
  searchBox.innerHTML = `
    <label for="usvg-search-tooltip-input" style="font-weight: bold; font-size: 13px; margin-bottom: 2px;">Search LGU or LGOO:</label>
    <div style="position: relative;">
      <input id="usvg-search-tooltip-input" type="text" placeholder="Type LGU, LGOO, or keyword..." autocomplete="off" />
      <div id="${SEARCH_DROPDOWN_ID}"></div>
    </div>
    <div style="display: flex; gap: 6px;">
      <button id="${SEARCH_BTN_ID}" type="button">Reset Tooltip</button>
      <button id="${SEARCH_RESET_BTN_ID}" type="button" style="background: #e53935;">Clear Search</button>
    </div>
  `;
  document.body.appendChild(searchBox);

  // --- LOGIC ---
  const input = searchBox.querySelector('input');
  const dropdown = document.getElementById(SEARCH_DROPDOWN_ID);
  const searchBtn = document.getElementById(SEARCH_BTN_ID);
  const clearBtn = document.getElementById(SEARCH_RESET_BTN_ID);

  let lastHighlightedRegion = null;
  let lastSelectedRegionKey = null;
  let ignoreNextHover = false;

  // Helper: Get all searchable values and their region keys
  function getSearchableEntries() {
    const entries = [];
    for (const [regionKey, data] of Object.entries(exampleData)) {
      for (const [field, value] of Object.entries(data)) {
        if (typeof value === 'string' && value.trim() !== '') {
          entries.push({
            regionKey,
            field,
            value: value.trim(),
            display: `${data.NameofLGU || regionKey} — ${field}: ${value.trim()}`
          });
        }
      }
    }
    return entries;
  }

  // Helper: Highlight SVG region
  function highlightRegion(regionKey) {
    removeHighlight();
    const svg = document.querySelector(universalMapEngine.options.mapSelector || 'svg');
    if (!svg) return;
    // Try to match by <title> text (case-insensitive, ignore spaces/underscores)
    const normKey = regionKey.replace(/\s+/g, '').replace(/_/g, '').toUpperCase();
    let found = false;
    svg.querySelectorAll('path').forEach(path => {
      const title = path.querySelector('title');
      if (!title) return;
      const tNorm = title.textContent.replace(/\s+/g, '').replace(/_/g, '').toUpperCase();
      if (tNorm === normKey) {
        path.classList.add(HIGHLIGHT_CLASS);
        lastHighlightedRegion = path;
        found = true;
        // --- Auto-scroll into view ---
        setTimeout(() => {
          try {
            path.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
            // --- Ensure region is visible in viewport (page scroll) ---
            const rect = path.getBoundingClientRect();
            const isVisible = (
              rect.top >= 0 &&
              rect.left >= 0 &&
              rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
              rect.right <= (window.innerWidth || document.documentElement.clientWidth)
            );
            if (!isVisible) {
              // Scroll window so the region is centered in the viewport
              const scrollY = window.scrollY + rect.top + rect.height / 2 - window.innerHeight / 2;
              const scrollX = window.scrollX + rect.left + rect.width / 2 - window.innerWidth / 2;
              window.scrollTo({ top: scrollY, left: scrollX, behavior: 'smooth' });
            }
          } catch (e) {}
        }, 100);
      }
    });
    return found;
  }
  function removeHighlight() {
    if (lastHighlightedRegion) {
      lastHighlightedRegion.classList.remove(HIGHLIGHT_CLASS);
      lastHighlightedRegion = null;
    }
  }

  // Helper: Show dropdown
  function showDropdown(results) {
    if (!results.length) {
      dropdown.style.display = 'none';
      dropdown.innerHTML = '';
      return;
    }
    dropdown.innerHTML = results.map((r, i) => `<div class="usvg-search-result" data-index="${i}">${escapeHTML(r.display)}</div>`).join('');
    dropdown.style.display = 'block';
  }
  function hideDropdown() {
    dropdown.style.display = 'none';
    dropdown.innerHTML = '';
  }

  // Helper: Reset search UI and highlight
  function resetSearchUI() {
    input.value = '';
    hideDropdown();
    removeHighlight();
    lastSelectedRegionKey = null;
  }

  // --- SEARCH EVENTS ---
  let searchResults = [];
  let activeDropdownIdx = -1;

  input.addEventListener('input', function(e) {
    const q = input.value.trim().toLowerCase();
    if (!q) {
      hideDropdown();
      removeHighlight();
      lastSelectedRegionKey = null;
      return;
    }
    const entries = getSearchableEntries();
    searchResults = entries.filter(entry => entry.value.toLowerCase().includes(q) || entry.regionKey.toLowerCase().includes(q));
    showDropdown(searchResults);
    activeDropdownIdx = -1;
  });

  // Keyboard navigation for dropdown
  input.addEventListener('keydown', function(e) {
    if (!searchResults.length) return;
    if (e.key === 'ArrowDown') {
      activeDropdownIdx = (activeDropdownIdx + 1) % searchResults.length;
      updateDropdownActive();
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      activeDropdownIdx = (activeDropdownIdx - 1 + searchResults.length) % searchResults.length;
      updateDropdownActive();
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (activeDropdownIdx >= 0 && activeDropdownIdx < searchResults.length) {
        selectResult(searchResults[activeDropdownIdx]);
        e.preventDefault();
      }
    }
  });
  function updateDropdownActive() {
    const items = dropdown.querySelectorAll('.usvg-search-result');
    items.forEach((el, idx) => {
      el.classList.toggle('active', idx === activeDropdownIdx);
    });
    if (activeDropdownIdx >= 0 && items[activeDropdownIdx]) {
      items[activeDropdownIdx].scrollIntoView({ block: 'nearest' });
    }
  }

  // Click on dropdown result
  dropdown.addEventListener('mousedown', function(e) {
    const target = e.target.closest('.usvg-search-result');
    if (!target) return;
    const idx = parseInt(target.getAttribute('data-index'), 10);
    if (!isNaN(idx) && searchResults[idx]) {
      selectResult(searchResults[idx]);
    }
  });

  // Select a result: highlight region and show tooltip
  function selectResult(result) {
    input.value = result.value;
    hideDropdown();
    highlightRegion(result.regionKey);
    lastSelectedRegionKey = result.regionKey;
    // Show tooltip for region
    const regionData = exampleData[result.regionKey];
    if (regionData) {
      ignoreNextHover = true;
      universalMapEngine.updatePanel(result.regionKey, regionData);
      setTimeout(() => { ignoreNextHover = false; }, 500);
    }
  }

  // --- BUTTON EVENTS ---
  searchBtn.addEventListener('click', function() {
    // Reset left tooltip and highlight
    universalMapEngine.resetPanel();
    resetSearchUI();
  });
  clearBtn.addEventListener('click', function() {
    resetSearchUI();
  });

  // --- HOVER INTERCEPT: Reset search on SVG hover ---
  // Patch setupPathEvents to reset search on hover
  const origSetupPathEvents = universalMapEngine.setupPathEvents.bind(universalMapEngine);
  universalMapEngine.setupPathEvents = function() {
    const svg = document.querySelector(this.options.mapSelector || 'svg');
    if (!svg) return;
    const paths = svg.querySelectorAll('path');
    paths.forEach((path) => {
      const title = path.querySelector('title');
      if (!title) return;
      const rawName = title.textContent.trim();
      const regionKey = this._normalizeKey(rawName);
      const data = this.tooltipData[regionKey];
      if (!data) return;
      // Remove previous listeners if any
      path.removeEventListener('mouseenter', path._usvgSearchHoverListener);
      // Add new listener
      path._usvgSearchHoverListener = function() {
        if (ignoreNextHover) return;
        resetSearchUI();
        removeHighlight();
      };
      path.addEventListener('mouseenter', path._usvgSearchHoverListener);
    });
    origSetupPathEvents();
  };
  // Re-setup events to apply new hover logic
  universalMapEngine.setupPathEvents();

  // --- UTILITY: Escape HTML ---
  function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, tag => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    })[tag]);
  }
})();
// ======================= END SEARCH ENGINE TOOLTIP =======================

