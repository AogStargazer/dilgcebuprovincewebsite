(function () {
  const gallerySelector = '[data-gallery-lightbox], .pd-photo-grid, .news-article__gallery';
  const imageLinkSelector = 'a[href]';
  const imagePattern = /\.(avif|gif|jpe?g|png|svg|webp)(\?.*)?(#.*)?$/i;
  let lightbox;
  let image;
  let closeButton;
  let previousFocus;

  function injectStyles() {
    if (document.getElementById('gallery-lightbox-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'gallery-lightbox-styles';
    style.textContent = `
      .site-gallery-lightbox {
        position: fixed;
        inset: 0;
        z-index: 999999;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 30px;
        background: rgba(0, 0, 0, 0.86);
      }

      .site-gallery-lightbox.is-open {
        display: flex;
      }

      .site-gallery-lightbox-frame {
        position: relative;
        max-width: min(96vw, 1320px);
        max-height: 92vh;
        padding: 12px;
        border-radius: 8px;
        background: #ffffff;
        box-shadow: 0 24px 70px rgba(0, 0, 0, 0.48);
      }

      .site-gallery-lightbox-image {
        display: block;
        width: auto !important;
        height: auto !important;
        max-width: calc(96vw - 24px) !important;
        max-height: calc(92vh - 24px) !important;
        object-fit: contain !important;
      }

      .site-gallery-lightbox-close {
        position: absolute;
        top: -17px;
        right: -17px;
        z-index: 1;
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        border: 3px solid #ffffff;
        border-radius: 50%;
        background: #e31b23;
        color: #ffffff;
        font: 900 30px/1 Arial, Helvetica, sans-serif;
        cursor: pointer;
        box-shadow: 0 8px 18px rgba(0, 0, 0, 0.34);
      }

      .site-gallery-lightbox-close:hover,
      .site-gallery-lightbox-close:focus-visible {
        background: #b80000;
        outline: none;
      }

      body.site-gallery-lightbox-open {
        overflow: hidden;
      }

      @media (max-width: 560px) {
        .site-gallery-lightbox {
          padding: 14px;
        }

        .site-gallery-lightbox-frame {
          padding: 8px;
        }

        .site-gallery-lightbox-image {
          max-width: calc(96vw - 16px) !important;
          max-height: calc(92vh - 16px) !important;
        }

        .site-gallery-lightbox-close {
          top: -12px;
          right: -12px;
          width: 38px;
          height: 38px;
          font-size: 24px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureLightbox() {
    if (lightbox) {
      return;
    }

    injectStyles();

    lightbox = document.createElement('div');
    lightbox.className = 'site-gallery-lightbox';
    lightbox.setAttribute('role', 'dialog');
    lightbox.setAttribute('aria-modal', 'true');
    lightbox.setAttribute('aria-label', 'Gallery image preview');
    lightbox.innerHTML = `
      <div class="site-gallery-lightbox-frame">
        <button class="site-gallery-lightbox-close" type="button" aria-label="Close image preview">&times;</button>
        <img class="site-gallery-lightbox-image" alt="">
      </div>
    `;

    image = lightbox.querySelector('.site-gallery-lightbox-image');
    closeButton = lightbox.querySelector('.site-gallery-lightbox-close');

    closeButton.addEventListener('click', close);
    lightbox.addEventListener('click', function (event) {
      if (event.target === lightbox) {
        close();
      }
    });

    document.body.appendChild(lightbox);
  }

  function isImageLink(link) {
    const href = link.getAttribute('href') || '';
    return imagePattern.test(href);
  }

  function getAlt(source) {
    const thumbnail = source.matches && source.matches('img') ? source : source.querySelector('img');
    return (thumbnail && thumbnail.alt) || source.getAttribute('aria-label') || 'Gallery image';
  }

  function open(sourceUrl, altSource) {
    ensureLightbox();
    previousFocus = document.activeElement;
    image.src = sourceUrl;
    image.alt = getAlt(altSource);
    lightbox.classList.add('is-open');
    document.body.classList.add('site-gallery-lightbox-open');
    closeButton.focus({ preventScroll: true });
  }

  function close() {
    if (!lightbox || !lightbox.classList.contains('is-open')) {
      return;
    }

    lightbox.classList.remove('is-open');
    document.body.classList.remove('site-gallery-lightbox-open');
    image.removeAttribute('src');

    if (previousFocus && typeof previousFocus.focus === 'function') {
      previousFocus.focus({ preventScroll: true });
    }
  }

  document.addEventListener('click', function (event) {
    const gallery = event.target.closest(gallerySelector);
    if (!gallery) {
      return;
    }

    const link = event.target.closest(imageLinkSelector);
    if (link && gallery.contains(link) && isImageLink(link)) {
      event.preventDefault();
      open(link.href, link);
      return;
    }

    const directImage = event.target.closest('img');
    if (!directImage || !gallery.contains(directImage)) {
      return;
    }

    event.preventDefault();
    open(directImage.currentSrc || directImage.src, directImage);
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') {
      close();
    }
  });
})();
