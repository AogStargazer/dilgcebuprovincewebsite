(function () {
  const STYLE_ID = "pdfjsOverlayDialogStyles";
  const GO_BACK_STYLE_ID = "sharedGoBackButtonStyles";
  const DIALOG_ID = "pdfjsOverlayDialog";
  const SCRIPT_URL = document.currentScript && document.currentScript.src ?
    new URL(document.currentScript.src, document.baseURI) :
    new URL("assets/js/pdfjs-overlay-dialog.js", document.baseURI);
  const SITE_ROOT = new URL("../../", SCRIPT_URL);
  const VIEWER_URL = new URL("../pdfjs/web/viewer.html", SCRIPT_URL);
  const VIEWER_MARKER = "assets/pdfjs/web/viewer.html";
  const SITE_HOSTS = new Set([
    "cebuprovincedilg.duckdns.org",
    "www.cebuprovincedilg.duckdns.org"
  ]);
  const GOOGLE_HOSTS = new Set([
    "docs.google.com",
    "drive.google.com"
  ]);
  const YOUTUBE_HOSTS = new Set([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be"
  ]);

  let lastTrigger = null;

  function injectGoBackStyles() {
    if (document.getElementById(GO_BACK_STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = GO_BACK_STYLE_ID;
    style.textContent = `
      .shared-go-back-button-wrap{display:flex!important;justify-content:center!important;align-items:center!important;width:100%;margin:28px auto 18px!important;text-align:center}
      .shared-go-back-button{display:inline-flex!important;align-items:center!important;justify-content:center!important;min-width:180px;min-height:48px;padding:13px 28px!important;border-radius:8px!important;background:#fff!important;color:#083f5b!important;border:1px solid rgba(8,63,91,.28)!important;box-shadow:0 10px 24px rgba(8,63,91,.12)!important;font-size:14px!important;font-weight:800!important;line-height:1.2!important;letter-spacing:0!important;text-transform:uppercase;text-decoration:none!important}
      .shared-go-back-button:hover,.shared-go-back-button:focus-visible{background:#083f5b!important;color:#fff!important;border-color:#083f5b!important;box-shadow:0 12px 28px rgba(8,63,91,.2)!important;outline:2px solid rgba(8,63,91,.28)!important;outline-offset:2px}
      .shared-go-back-button .elementor-button-content-wrapper{display:inline-flex!important;align-items:center!important;justify-content:center!important}
      .shared-go-back-button .elementor-button-text{color:inherit!important;font-weight:800!important}
      @media(max-width:520px){.shared-go-back-button{width:min(100%,280px);min-width:0}}
    `;
    document.head.appendChild(style);
  }

  function normalizeGoBackButtons() {
    injectGoBackStyles();

    document.querySelectorAll("a.elementor-button").forEach((button) => {
      if (button.textContent.trim().replace(/\s+/g, " ").toUpperCase() !== "GO BACK") {
        return;
      }

      button.classList.add("shared-go-back-button");
      const wrapper = button.closest(".learn-more-container,.news-article__actions,.gad-back-card");
      if (wrapper) {
        wrapper.classList.add("shared-go-back-button-wrap");
      }
    });
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      .pdfjs-overlay-layer{position:fixed;inset:var(--pdfjs-overlay-top,0px) 0 0;z-index:2147483200;display:flex;align-items:stretch;justify-content:center;background:rgba(15,23,42,.54);padding:18px}
      .pdfjs-overlay-layer[hidden]{display:none}
      .pdfjs-overlay-dialog{display:flex;flex-direction:column;width:min(1440px,100%);height:100%;background:#fff;border:1px solid #cbd5e1;border-radius:8px;box-shadow:0 18px 45px rgba(15,23,42,.25);overflow:hidden}
      .pdfjs-overlay-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-bottom:1px solid #cbd5e1;background:#f8fafc}
      .pdfjs-overlay-title{min-width:0;color:#0f172a;font:700 14px/1.35 Arial,system-ui,sans-serif;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .pdfjs-overlay-actions{display:flex;align-items:center;gap:8px;flex:0 0 auto}
      .pdfjs-overlay-action{display:inline-flex;align-items:center;justify-content:center;min-width:36px;height:36px;padding:0 12px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#0f172a;font:700 13px/1 Arial,system-ui,sans-serif;text-decoration:none;cursor:pointer}
      .pdfjs-overlay-action:hover,.pdfjs-overlay-action:focus-visible{border-color:#2563eb;color:#17497a;outline:0}
      .pdfjs-overlay-close{font-size:20px}
      .pdfjs-overlay-frame{width:100%;height:100%;border:0;flex:1 1 auto;background:#e5e7eb}
      @media(max-width:720px){.pdfjs-overlay-layer{padding:8px}.pdfjs-overlay-head{padding:8px}.pdfjs-overlay-action{min-width:34px;height:34px;padding:0 9px}.pdfjs-overlay-open{display:none}}
    `;
    document.head.appendChild(style);
  }

  function syncDialogOffset(dialog) {
    const header = document.querySelector(".main-header");
    const top = header ? Math.max(0, Math.round(header.getBoundingClientRect().bottom)) : 0;
    dialog.style.setProperty("--pdfjs-overlay-top", top + "px");
  }

  function getViewerBase() {
    return VIEWER_URL.href;
  }

  function isPdfUrl(url) {
    return /\.pdf(?:[?#]|$)/i.test(url.pathname + url.search + url.hash);
  }

  function isSitePdf(url) {
    return url.origin === window.location.origin || SITE_HOSTS.has(url.hostname.toLowerCase());
  }

  function getPdfFromViewer(url) {
    if (!url.href.includes(VIEWER_MARKER)) {
      return "";
    }

    try {
      return url.searchParams.get("file") || "";
    } catch (error) {
      return "";
    }
  }

  function getDialogTitle(link, resourceUrl, fallbackTitle) {
    const text = link.textContent.trim().replace(/\s+/g, " ");
    if (text && !/^(view|preview|click here)$/i.test(text)) {
      return text;
    }

    const label = link.closest("div,article,li,section") || link;
    const nearby = label.textContent.trim().replace(/\s+/g, " ");
    if (nearby) {
      return nearby.replace(/\b(VIEW|PREVIEW|DOWNLOAD|Click here)\b/gi, "").trim() || fallbackTitle;
    }

    return decodeURIComponent(resourceUrl.pathname.split("/").pop() || fallbackTitle);
  }

  function getGoogleEmbedUrl(linkUrl) {
    if (!GOOGLE_HOSTS.has(linkUrl.hostname.toLowerCase())) {
      return "";
    }

    const path = linkUrl.pathname;
    if (/^\/(spreadsheets|document|presentation)\/d\/[^/]+/.test(path)) {
      return linkUrl.href;
    }

    if (linkUrl.hostname.toLowerCase() !== "drive.google.com") {
      return "";
    }

    if (/^\/file\/d\/[^/]+/.test(path) || /^\/drive\/folders\/[^/]+/.test(path)) {
      return linkUrl.href;
    }

    return "";
  }

  function getYouTubeEmbedUrl(linkUrl) {
    const host = linkUrl.hostname.toLowerCase();
    if (!YOUTUBE_HOSTS.has(host)) {
      return "";
    }

    let videoId = "";
    if (host === "youtu.be") {
      videoId = linkUrl.pathname.split("/").filter(Boolean)[0] || "";
    } else if (linkUrl.pathname === "/watch") {
      videoId = linkUrl.searchParams.get("v") || "";
    } else {
      const embedMatch = linkUrl.pathname.match(/^\/(?:embed|shorts)\/([^/?#]+)/);
      videoId = embedMatch ? embedMatch[1] : "";
    }

    if (!/^[A-Za-z0-9_-]{6,}$/.test(videoId)) {
      return "";
    }

    const embedUrl = new URL("https://www.youtube.com/embed/" + videoId);
    embedUrl.searchParams.set("autoplay", "1");
    embedUrl.searchParams.set("rel", "0");
    embedUrl.searchParams.set("playsinline", "1");
    return embedUrl.href;
  }

  function getOverlayTarget(linkUrl) {
    const viewerUrl = buildViewerUrl(linkUrl);
    const pdfUrl = getPdfUrl(linkUrl);
    if (viewerUrl && pdfUrl) {
      return {
        viewerUrl: viewerUrl,
        resourceUrl: pdfUrl,
        fallbackTitle: "PDF Preview",
        canDownload: true
      };
    }

    const googleEmbedUrl = getGoogleEmbedUrl(linkUrl);
    if (googleEmbedUrl) {
      return {
        viewerUrl: googleEmbedUrl,
        resourceUrl: linkUrl.href,
        fallbackTitle: "Document Preview",
        canDownload: false
      };
    }

    const youtubeEmbedUrl = getYouTubeEmbedUrl(linkUrl);
    if (youtubeEmbedUrl) {
      return {
        viewerUrl: youtubeEmbedUrl,
        resourceUrl: linkUrl.href,
        fallbackTitle: "Video Preview",
        canDownload: false
      };
    }

    return null;
  }

  function buildViewerUrl(linkUrl) {
    const pdfFromViewer = getPdfFromViewer(linkUrl);
    if (pdfFromViewer) {
      const pdfUrl = new URL(pdfFromViewer, window.location.origin);
      if (!isPdfUrl(pdfUrl)) {
        return "";
      }
      return linkUrl.href;
    }

    if (!isPdfUrl(linkUrl)) {
      return "";
    }

    const viewerUrl = new URL(getViewerBase());
    const file = isSitePdf(linkUrl) ?
      new URL(linkUrl.pathname.replace(/^\/+/, "") + linkUrl.search + linkUrl.hash, SITE_ROOT).href :
      linkUrl.href;
    viewerUrl.searchParams.set("file", file);
    return viewerUrl.href;
  }

  function getPdfUrl(linkUrl) {
    const pdfFromViewer = getPdfFromViewer(linkUrl);
    if (pdfFromViewer) {
      const pdfUrl = new URL(pdfFromViewer, window.location.origin);
      return isPdfUrl(pdfUrl) ? pdfUrl.href : "";
    }

    if (isPdfUrl(linkUrl)) {
      return linkUrl.href;
    }

    return "";
  }

  function createDialog() {
    const existing = document.getElementById(DIALOG_ID);
    if (existing) {
      return existing;
    }

    injectStyles();

    const layer = document.createElement("div");
    layer.id = DIALOG_ID;
    layer.className = "pdfjs-overlay-layer";
    layer.hidden = true;
    layer.innerHTML = `
      <section class="pdfjs-overlay-dialog" role="dialog" aria-modal="true" aria-labelledby="pdfjsOverlayTitle">
        <div class="pdfjs-overlay-head">
          <div class="pdfjs-overlay-title" id="pdfjsOverlayTitle">Preview</div>
          <div class="pdfjs-overlay-actions">
            <a class="pdfjs-overlay-action pdfjs-overlay-open" href="#" target="_blank" rel="noopener">Open</a>
            <a class="pdfjs-overlay-action pdfjs-overlay-download" href="#" download>Download</a>
            <button class="pdfjs-overlay-action pdfjs-overlay-close" type="button" aria-label="Close preview">x</button>
          </div>
        </div>
        <iframe class="pdfjs-overlay-frame" title="Document preview" allow="autoplay; fullscreen; picture-in-picture; encrypted-media; clipboard-write" allowfullscreen></iframe>
      </section>
    `;

    document.body.appendChild(layer);

    const close = layer.querySelector(".pdfjs-overlay-close");
    close.addEventListener("click", () => closeDialog(layer));
    layer.addEventListener("click", (event) => {
      if (event.target === layer) {
        closeDialog(layer);
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !layer.hidden) {
        closeDialog(layer);
      }
    });

    window.addEventListener("resize", () => syncDialogOffset(layer));
    window.addEventListener("scroll", () => syncDialogOffset(layer), { passive: true });

    return layer;
  }

  function openDialog(link, target) {
    const dialog = createDialog();
    const title = dialog.querySelector(".pdfjs-overlay-title");
    const iframe = dialog.querySelector(".pdfjs-overlay-frame");
    const open = dialog.querySelector(".pdfjs-overlay-open");
    const download = dialog.querySelector(".pdfjs-overlay-download");
    const close = dialog.querySelector(".pdfjs-overlay-close");

    lastTrigger = link;
    title.textContent = getDialogTitle(link, new URL(target.resourceUrl), target.fallbackTitle);
    iframe.src = target.viewerUrl;
    open.href = target.resourceUrl;
    download.hidden = !target.canDownload;
    if (target.canDownload) {
      download.href = target.resourceUrl;
      download.setAttribute("download", "");
    } else {
      download.removeAttribute("href");
      download.removeAttribute("download");
    }
    syncDialogOffset(dialog);
    dialog.hidden = false;
    close.focus();
  }

  function closeDialog(dialog) {
    const iframe = dialog.querySelector(".pdfjs-overlay-frame");
    dialog.hidden = true;
    iframe.src = "about:blank";
    if (lastTrigger && typeof lastTrigger.focus === "function") {
      lastTrigger.focus();
    }
  }

  function shouldIgnoreClick(event, link) {
    return event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      link.hasAttribute("download") ||
      link.dataset.pdfOverlay === "false";
  }

  function handleClick(event) {
    if (!(event.target instanceof Element)) {
      return;
    }

    const link = event.target.closest("a[href]");
    if (!link || shouldIgnoreClick(event, link)) {
      return;
    }

    const linkUrl = new URL(link.getAttribute("href"), document.baseURI);
    const target = getOverlayTarget(linkUrl);
    if (!target) {
      return;
    }

    event.preventDefault();
    openDialog(link, target);
  }

  document.addEventListener("click", handleClick);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", normalizeGoBackButtons);
  } else {
    normalizeGoBackButtons();
  }
})();
