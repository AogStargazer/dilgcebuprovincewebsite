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
      emptyStateMessage: 'Click or hover over any region on the map to view detailed information about that area.',
      customRenderers: {}, // User can provide custom renderers
      ...options
    };
    
    this.tooltipData = {};
    this._tooltipContentCache = new Map();
    this._boundPaths = [];
    this._panel = null;
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
   */
  createInfoPanel() {
    // Remove existing panel if any (but reuse if possible)
    let panel = document.querySelector(`#${this.options.panelId}`);
    if (panel) {
      // Just clear content, don't remove the node
      panel.querySelector('#panelTitle').textContent = this.options.emptyStateTitle;
      panel.querySelector('#panelEmptyState').style.display = 'block';
      panel.querySelector('#panelContent').style.display = 'none';
      this._panel = panel;
      return panel;
    }

    // Inject panel CSS if not already present
    if (!document.getElementById(`${this.options.panelId}-styles`)) {
      const styleTag = document.createElement('style');
      styleTag.id = `${this.options.panelId}-styles`;
      styleTag.textContent = this._getPanelStyles();
      document.head.appendChild(styleTag);
    }

    const panelHTML = `
      <div id="${this.options.panelId}"
        role="region" aria-live="polite" aria-atomic="true" tabindex="-1"
        style="left: ${this.options.position.left}; top: ${this.options.position.top};">
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
    if (cellConfig.bold) textStyle += 'font-weight: bold;';
    if (cellConfig.italic) textStyle += 'font-style: italic;';
    if (cellConfig.underline) textStyle += 'text-decoration: underline;';
    if (cellConfig.strikethrough) textStyle += 'text-decoration: line-through;';
    if (cellConfig.underline && cellConfig.strikethrough) textStyle += 'text-decoration: underline line-through;';
    if (cellConfig.highlight) textStyle += `background: ${cellConfig.highlight};`;
    if (cellConfig.noWrap) textStyle += 'white-space: nowrap; overflow-x: auto;';

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

      case 'html':
        return { html: wrapWithFormat(`<div style="font-size: 13px; text-align: left;">${sanitize(cleanValue)}</div>`), extraClass };

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
   */
  updatePanel(name, data) {
    const panel = document.querySelector(`#${this.options.panelId}`);
    if (!panel) return;

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
      });
    }
    this._boundPaths = [];
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
        this.updatePanel(rawName, data);
        path.style.opacity = '0.8';
        path.style.filter = 'brightness(1.1)';
      }, 40);
      const mouseleave = () => {
        path.style.opacity = '';
        path.style.filter = '';
        // Panel data stays - no reset
      };
      const click = (e) => {
        this.updatePanel(rawName, data);
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
   */
  resetPanel() {
    const emptyState = document.querySelector('#panelEmptyState');
    const content = document.querySelector('#panelContent');
    // const title = document.querySelector('#panelTitle'); // Removed as per edit hint

    if (emptyState && content) {
      // title.textContent = this.options.emptyStateTitle; // Removed as per edit hint
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
//    Example:
//      const gridConfig = {
//        R1C1: { key: "names", label: "Full Name", bold: true, italic: true },
//        R1C2: { key: "favoriteColor", label: "Favorite Color", highlight: "#ffff00" },
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
/* sample gridConfig to use when you want to use only grid keys
const gridConfig = {
  R1C1: { key: "names", label: "Full Name", bold: true, italic: true },
  R1C2: { key: "favoriteColor", label: "Favorite Color", highlight: "#ffff00" },
  R1C3: { key: "hobby", label: "Hobby", underline: true, strikethrough: true },
  R2C1: { key: "email", label: "Email Address" },
  R2C2: { key: "phone", label: "Phone Number", bold: true }
};
*/

// --- BEGIN USER GRID CONFIG ---
const gridConfig = {
  R1C1: { key: "NameofLGU", label: "LGU Name", bold: true },
  R2C1: { key: "descriptionLGU", label: "Description", paragraph: true, wrapchar: 74 },
  R3R4C1: { key: "lgooImage", label: "LGOO Photo" },
  R3C2: { key: "lgooName", label: "LGOO Name", bold: true, wrapchar: 20 },
  R4C2: { key: "lgooDesignation", label: "LGOO Designation" },
  R5R6C1: { key: "lgoo2Image", label: "2nd LGOO Photo" },
  R5C2: { key: "lgoo2Name", label: "2nd LGOO Name", bold: true, wrapchar: 20 },
  R6C2: { key: "lgoo2Designation", label: "2nd LGOO Designation" }
};
// --- END USER GRID CONFIG ---



// --- BEGIN USER DATA ---
const exampleData = {
  "ASTURIAS": {
    NameofLGU: "Asturias",
    descriptionLGU: "Asturias is one of the local government units in Cebu Province.",
    lgooName: "JOHN MICHAEL B. MONILLAS",
    lgooDesignation: "LGOO of Asturias",
    lgooImage: "organizationalchart/images/mackymoe_asturias.png"
  },
  "BALAMBAN": {
    NameofLGU: "Balamban",
    descriptionLGU: "Balamban is one of the local government units in Cebu Province.",
    lgooName: "EVALYN R. QUIROS",
    lgooDesignation: "LGOO of Balamban",
    lgooImage: "organizationalchart/images/evalyn_balamban.png"
  },
  "BANTAYAN": {
    NameofLGU: "Bantayan",
    descriptionLGU: "Bantayan is one of the local government units in Cebu Province.",
    lgooName: "JUPITER E. DAWA",
    lgooDesignation: "LGOO of Bantayan",
    lgooImage: "organizationalchart/images/jupz_bantayan.png"
  },
  "BOGO_CITY": {
    NameofLGU: "Bogo City",
    descriptionLGU: "Bogocity is one of the local government units in Cebu Province.",
    lgooName: "MAE B. DURA",
    lgooDesignation: "LGOO of Bogo City",
    lgooImage: "organizationalchart/images/maedura_bogocity.png"
  },
  "DAANBANTAYAN": {
    NameofLGU: "Daanbantayan",
    descriptionLGU: "Daanbantayan is one of the local government units in Cebu Province.",
    lgooName: "GRACE Y. CABURNAY",
    lgooDesignation: "LGOO of Daanbantayan",
    lgooImage: "organizationalchart/images/gracecaburnay_daanbantayan.png"
  },
  "MADRIDEJOS": {
    NameofLGU: "Madridejos",
    descriptionLGU: "Madridejos is one of the local government units in Cebu Province.",
    lgooName: "JOHN MICHAEL M. LEGASPI",
    lgooDesignation: "LGOO of Madridejos",
    lgooImage: "organizationalchart/images/JM_madridejos.png"
  },
  "MEDELLIN": {
    NameofLGU: "Medellin",
    descriptionLGU: "Medellin is one of the local government units in Cebu Province.",
    lgooName: "JANIEVA A. DANDAN",
    lgooDesignation: "LGOO of Medellin",
    lgooImage: "organizationalchart/images/jan_medellin.png"
  },
  "SAN_REMIGIO": {
    NameofLGU: "San Remigio",
    descriptionLGU: "Sanremigio is one of the local government units in Cebu Province.",
    lgooName: "CLAIRE V. DIAZ",
    lgooDesignation: "LGOO of Sanremigio",
    lgooImage: "organizationalchart/images/claire_sanremigio.png"
  },
  "SANTA_FE": {
    NameofLGU: "Santa Fe",
    descriptionLGU: "Santafe is one of the local government units in Cebu Province.",
    lgooName: "NIÑO VINCENT B. FIEL",
    lgooDesignation: "LGOO of Santafe",
    lgooImage: "organizationalchart/images/ninosenpai_stafe.png"
  },
  "TABOGON": {
    NameofLGU: "Tabogon",
    descriptionLGU: "Tabogon is one of the local government units in Cebu Province.",
    lgooName: "JERRY BIB PITOGO",
    lgooDesignation: "LGOO of Tabogon",
    lgooImage: "organizationalchart/images/jerry_tabogon.png"
  },
  "TABUELAN": {
    NameofLGU: "Tabuelan",
    descriptionLGU: "Tabuelan is one of the local government units in Cebu Province.",
    lgooName: "EASTER-APRIL R. QUIROL",
    lgooDesignation: "LGOO of Tabuelan",
    lgooImage: "organizationalchart/images/easterapril_tabuelan.png"
  },
  "TUBURAN": {
    NameofLGU: "Tuburan",
    descriptionLGU: "Tuburan is one of the local government units in Cebu Province.",
    lgooName: "LEO NICHOLAS T. PATRIANA",
    lgooDesignation: "LGOO of Tuburan",
    lgooImage: "organizationalchart/images/leopatz_tuburan.png",
    lgoo2Name: "ABEL JOHN C. PEGUIT",
    lgoo2Designation: "Assistant LGOO of Tuburan",
    lgoo2Image: "organizationalchart/images/avelbrother_tuburan.png"
  },
  "BORBON": {
    NameofLGU: "Borbon",
    descriptionLGU: "Borbon is one of the local government units in Cebu Province.",
    lgooName: "CECILLE C. BELCINA",
    lgooDesignation: "LGOO of Borbon",
    lgooImage: "organizationalchart/images/cecilleCbelcina_borbon.png"
  },
  "CARMEN": {
    NameofLGU: "Carmen",
    descriptionLGU: "Carmen is one of the local government units in Cebu Province.",
    lgooName: "AMMIE MARIE Z. GENERALE",
    lgooDesignation: "LGOO of Carmen",
    lgooImage: "organizationalchart/images/ammieMarieZGenerale_carmen.png"
  },
  "COMPOSTELA": {
    NameofLGU: "Compostela",
    descriptionLGU: "Compostela is one of the local government units in Cebu Province.",
    lgooName: "MELBOURNE O. NAVALES",
    lgooDesignation: "LGOO of Compostela",
    lgooImage: "organizationalchart/images/MelbourneONavales_Compostela.png"
  },
  "CONSOLACION": {
    NameofLGU: "Consolacion",
    descriptionLGU: "Consolacion is one of the local government units in Cebu Province.",
    lgooName: "SHERYL A. PIDOR",
    lgooDesignation: "LGOO of Consolacion",
    lgooImage: "organizationalchart/images/sherylpidor_consolacion.png"
  },
  "CORDOVA": {
    NameofLGU: "Cordova",
    descriptionLGU: "Cordova is one of the local government units in Cebu Province.",
    lgooName: "SHEVAH TRIXY L. CAOCTOY",
    lgooDesignation: "LGOO of Cordova",
    lgooImage: "organizationalchart/images/shevahtrixyLcaoctoy_cordova.png"
  },
  "DANAO_CITY": {
    NameofLGU: "Danao City",
    descriptionLGU: "Danao City is one of the local government units in Cebu Province.",
    lgooName: "GEMMA M. BERMOY",
    lgooDesignation: "LGOO of Danaocity",
    lgooImage: "images/lgoo_danaocity.jpg"
  },
  "LILOAN": {
    NameofLGU: "Liloan",
    descriptionLGU: "Liloan is one of the local government units in Cebu Province.",
    lgooName: "JAMES ANDREW G. ANDAYA",
    lgooDesignation: "LGOO of Liloan",
    lgooImage: "organizationalchart/images/jamesandrewgandaya_liloan.png"
  },
  "PILAR": {
    NameofLGU: "Pilar",
    descriptionLGU: "Pilar is one of the local government units in Cebu Province.",
    lgooName: "LOVIE B. DE LA CRUZ",
    lgooDesignation: "LGOO of Pilar",
    lgooImage: "organizationalchart/images/lovieBdeLaCruz_pilar.png"
  },
  "PORO": {
    NameofLGU: "Poro",
    descriptionLGU: "Poro is one of the local government units in Cebu Province.",
    lgooName: "CLIFF P. OTADOY",
    lgooDesignation: "LGOO of Poro",
    lgooImage: "organizationalchart/images/cliff_poro.png"
  },
  "SAN_FRANCISCO": {
    NameofLGU: "San Francisco",
    descriptionLGU: "San Francisco is one of the local government units in Cebu Province.",
    lgooName: "GREGORY A. SOSMEÑA",
    lgooDesignation: "LGOO of Sanfrancisco",
    lgooImage: "organizationalchart/images/sosmena_sanfran.png"
  },
  "SOGOD": {
    NameofLGU: "Sogod",
    descriptionLGU: "Sogod is one of the local government units in Cebu Province.",
    lgooName: "SHEILA G. DENDEN",
    lgooDesignation: "LGOO of Sogod",
    lgooImage: "organizationalchart/images/sheila_sogod.png"
  },
  "TUDELA": {
    NameofLGU: "Tudela",
    descriptionLGU: "Tudela is one of the local government units in Cebu Province.",
    lgooName: "PERSIUS R. BORLASA",
    lgooDesignation: "LGOO of Tudela",
    lgooImage: "organizationalchart/images/perseus_tudela.png"
  },
  "ALCANTARA": {
    NameofLGU: "Alcantara",
    descriptionLGU: "Alcantara is one of the local government units in Cebu Province.",
    lgooName: "JUDELYN C. SALINAS",
    lgooDesignation: "LGOO of Alcantara",
    lgooImage: "organizationalchart/images/judesalinas_alcantara.png"
  },
  "ALEGRIA": {
    NameofLGU: "Alegria",
    descriptionLGU: "Alegria is one of the local government units in Cebu Province.",
    lgooName: "JOSE REY A. PACRES",
    lgooDesignation: "LGOO of Alegria",
    lgooImage: "organizationalchart/images/pacres_alegria.png",
  },
  "ALOGUINSAN": {
    NameofLGU: "Aloguinsan",
    descriptionLGU: "Aloguinsan is one of the local government units in Cebu Province.",
    lgooName: "DENNIS C. ITOM",
    lgooDesignation: "LGOO of Aloguinsan",
    lgooImage: "organizationalchart/images/dennisitom_aloguinsan.png"
  },
  "BADIAN": {
    NameofLGU: "Badian",
    descriptionLGU: "Badian is one of the local government units in Cebu Province.",
    lgooName: "IRIS V. ARIAS",
    lgooDesignation: "LGOO of Badian",
    lgooImage: "organizationalchart/images/irisarias_badian.png"
  },
  "BARILI": {
    NameofLGU: "Barili",
    descriptionLGU: "Barili is one of the local government units in Cebu Province.",
    lgooName: "DANN MARR P. ANDRINO",
    lgooDesignation: "LGOO of Barili",
    lgooImage: "organizationalchart/images/attydannmarr_barili.png"
  },
  "DUMANJUG": {
    NameofLGU: "Dumanjug",
    descriptionLGU: "Dumanjug is one of the local government units in Cebu Province.",
    lgooName: "GLENDA G. GABUYA",
    lgooDesignation: "LGOO of Dumanjug",
    lgooImage: "organizationalchart/images/gabuya_dumanjug.png"
  },
  "GINATILAN": {
    NameofLGU: "Ginatilan",
    descriptionLGU: "Ginatilan is one of the local government units in Cebu Province.",
    lgooName: "EMMANNUEL S. PEDRALBA",
    lgooDesignation: "LGOO of Ginatilan",
    lgooImage: "organizationalchart/images/pedralba_ginatilan.png"
  },
  "MALABUYOC": {
    NameofLGU: "Malabuyoc",
    descriptionLGU: "Malabuyoc is one of the local government units in Cebu Province.",
    lgooName: "ELVIE S. GAUDAN",
    lgooDesignation: "LGOO of Malabuyoc",
    lgooImage: "organizationalchart/images/elviegaudan_malabuyoc.png"
  },
  "MOALBOAL": {
    NameofLGU: "Moalboal",
    descriptionLGU: "Moalboal is one of the local government units in Cebu Province.",
    lgooName: "LYN N. AGUELO",
    lgooDesignation: "LGOO of Moalboal",
    lgooImage: "organizationalchart/images/lynaguelo_moalboal.png"
  },
  "PINAMUNGAJAN": {
    NameofLGU: "Pinamungajan",
    descriptionLGU: "Pinamungajan is one of the local government units in Cebu Province.",
    lgooName: "JEFFREY A. LOPEZ",
    lgooDesignation: "LGOO of Pinamungajan",
    lgooImage: "organizationalchart/images/lopez_pinamungajan.png"
  },
  "RONDA": {
    NameofLGU: "Ronda",
    descriptionLGU: "Ronda is one of the local government units in Cebu Province.",
    lgooName: "JOSE MENELEO C. AQUINO",
    lgooDesignation: "LGOO of Ronda",
    lgooImage: "organizationalchart/images/aquino_ronda.png"
  },
  "TOLEDO_CITY": {
    NameofLGU: "Toledo City",
    descriptionLGU: "Toledocity is one of the local government units in Cebu Province.",
    lgooName: "ABRAHAM REY C. DONALDO",
    lgooDesignation: "LGOO of Toledocity",
    lgooImage: "organizationalchart/images/abbeydonaldo_toledo.png"
  },
  "ALCOY": {
    NameofLGU: "Alcoy",
    descriptionLGU: "Alcoy is one of the local government units in Cebu Province.",
    lgooName: "MARIA LOURDES D. BOONE",
    lgooDesignation: "LGOO of Alcoy",
    lgooImage: "organizationalchart/images/MariaLourdesDBoone_Alcoy.png"
  },
  "ARGAO": {
    NameofLGU: "Argao",
    descriptionLGU: "Argao is one of the local government units in Cebu Province.",
    lgooName: "LEWELYN M. ARQUILLANO",
    lgooDesignation: "LGOO of Argao",
    lgooImage: "organizationalchart/images/lewelyn_argao.png"
  },
  "CARCAR_CITY": {
    NameofLGU: "Carcar City",
    descriptionLGU: "Carcarcity is one of the local government units in Cebu Province.",
    lgooName: "MILDRED C. LASALA",
    lgooDesignation: "LGOO of Carcarcity",
    lgooImage: "organizationalchart/images/mildred_carcar.png"
  },
  "DALAGUETE": {
    NameofLGU: "Dalaguete",
    descriptionLGU: "Dalaguete is one of the local government units in Cebu Province.",
    lgooName: "GINABLE M. EJOC",
    lgooDesignation: "LGOO of Dalaguete",
    lgooImage: "organizationalchart/images/GinableEjoc_Dalaguete.png"
  },
  "OSLOB": {
    NameofLGU: "Oslob",
    descriptionLGU: "Oslob is one of the local government units in Cebu Province.",
    lgooName: "DEANNA A. MINGUETO",
    lgooDesignation: "LGOO of Oslob",
    lgooImage: "organizationalchart/images/DeannaMingueto_Oslob_SantanderRadiate.png"
  },
  "SANTANDER": {
    NameofLGU: "Santander",
    descriptionLGU: "Santander is one of the local government units in Cebu Province.",
    lgooName: "DEANNA A. MINGUETO",
    lgooDesignation: "LGOO of Santander",
    lgooImage: "organizationalchart/images/DeannaMingueto_Oslob_SantanderRadiate.png"
  },
  "SAMBOAN": {
    NameofLGU: "Samboan",
    descriptionLGU: "Samboan is one of the local government units in Cebu Province.",
    lgooName: "KYM A. ALBRANDO",
    lgooDesignation: "LGOO of Samboan",
    lgooImage: "organizationalchart/images/KymAlbrando_Samboan.png"
  },
  "SAN_FERNANDO": {
    NameofLGU: "San Fernando",
    descriptionLGU: "Sanfernando is one of the local government units in Cebu Province.",
    lgooName: "JOSEPH ELIZAR F. MERLAS",
    lgooDesignation: "LGOO of Sanfernando",
    lgooImage: "organizationalchart/images/JosephElizarMerlas_SanFernando.png"
  },
  "SIBONGA": {
    NameofLGU: "Sibonga",
    descriptionLGU: "Sibonga is one of the local government units in Cebu Province.",
    lgooName: "SUSAN E. TOLENTINO",
    lgooDesignation: "LGOO of Sibonga",
    lgooImage: "organizationalchart/images/susan_sibonga.png"
  },
  "TALISAY_CITY": {
    NameofLGU: "Talisay City",
    descriptionLGU: "Talisaycity is one of the local government units in Cebu Province.",
    lgooName: "JONALUKE V. TUBAL II",
    lgooDesignation: "LGOO of Talisaycity",
    lgooImage: "organizationalchart/images/tubal_lgcds.png"
  },
  "NAGA_CITY": {
    NameofLGU: "Naga City",
    descriptionLGU: "Nagacity is one of the local government units in Cebu Province.",
    lgooName: "EMMA JOYEVLYN V. CALVO",
    lgooDesignation: "LGOO of Nagacity",
    lgooImage: "organizationalchart/images/emma_joyevelyn_v_calvo_city_of_naga.png",
    lgoo2Name: "AILEEN GRACE B. ARGAWANON-PECA",
    lgoo2Designation: "Assistant LGOO of Nagacity",
    lgoo2Image: "organizationalchart/images/AileenPeca_Naga.png"
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