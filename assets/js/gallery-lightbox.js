(function () {
  const gallerySelector = '[data-gallery-lightbox], .pd-photo-grid, .news-article__gallery, .news-article';
  const imageLinkSelector = 'a[href]';
  const imagePattern = /\.(avif|gif|jpe?g|png|svg|webp)(\?.*)?(#.*)?$/i;
  let lightbox;
  let image;
  let caption;
  let counter;
  let previousButton;
  let nextButton;
  let closeButton;
  let previousFocus;
  let activeItems = [];
  let activeIndex = 0;

  function injectStyles() {
    if (document.getElementById('gallery-lightbox-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'gallery-lightbox-styles';
    style.textContent = `
      .news-article__hero,
      .news-article__gallery img,
      [data-gallery-lightbox] img,
      .pd-photo-grid img {
        cursor: zoom-in;
      }

      .site-gallery-lightbox {
        position: fixed;
        inset: 0;
        z-index: 999999;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 24px;
        background: rgba(0, 0, 0, 0.88);
      }

      .site-gallery-lightbox.is-open {
        display: flex;
      }

      .site-gallery-lightbox-frame {
        position: relative;
        display: grid;
        gap: 10px;
        max-width: 100%;
        max-height: 100%;
      }

      .site-gallery-lightbox-image {
        display: block;
        width: auto !important;
        height: auto !important;
        max-width: calc(100vw - 48px) !important;
        max-height: calc(100vh - 48px) !important;
        object-fit: contain !important;
      }

      .site-gallery-lightbox-caption {
        position: fixed;
        right: 24px;
        bottom: 18px;
        left: 24px;
        margin: 0 auto;
        color: #ffffff;
        font: 700 14px/1.45 Arial, Helvetica, sans-serif;
        text-align: center;
        text-shadow: 0 2px 8px rgba(0, 0, 0, 0.85);
      }

      .site-gallery-lightbox-counter {
        color: #ffffff;
        font-weight: 800;
      }

      .site-gallery-lightbox-close,
      .site-gallery-lightbox-nav {
        position: absolute;
        z-index: 1;
        display: grid;
        place-items: center;
        border: 3px solid #ffffff;
        border-radius: 50%;
        background: #e31b23;
        color: #ffffff;
        font: 900 30px/1 Arial, Helvetica, sans-serif;
        cursor: pointer;
        box-shadow: 0 8px 18px rgba(0, 0, 0, 0.34);
      }

      .site-gallery-lightbox-close {
        position: fixed;
        top: 16px;
        right: 16px;
        width: 44px;
        height: 44px;
      }

      .site-gallery-lightbox-nav {
        top: 50%;
        width: 46px;
        height: 46px;
        transform: translateY(-50%);
      }

      .site-gallery-lightbox-prev {
        left: -23px;
      }

      .site-gallery-lightbox-next {
        right: -23px;
      }

      .site-gallery-lightbox-close:hover,
      .site-gallery-lightbox-close:focus-visible,
      .site-gallery-lightbox-nav:hover,
      .site-gallery-lightbox-nav:focus-visible {
        background: #b80000;
        outline: none;
      }

      .site-gallery-lightbox-nav[hidden] {
        display: none;
      }

      body.site-gallery-lightbox-open {
        overflow: hidden;
      }

      @media (max-width: 560px) {
        .site-gallery-lightbox {
          padding: 14px;
        }

        .site-gallery-lightbox-image {
          max-width: calc(100vw - 28px) !important;
          max-height: calc(100vh - 28px) !important;
        }

        .site-gallery-lightbox-caption {
          right: 14px;
          bottom: 12px;
          left: 14px;
          font-size: 13px;
        }

        .site-gallery-lightbox-close {
          top: -12px;
          right: -12px;
          width: 38px;
          height: 38px;
          font-size: 24px;
        }

        .site-gallery-lightbox-nav {
          width: 40px;
          height: 40px;
          font-size: 24px;
        }

        .site-gallery-lightbox-prev {
          left: 6px;
        }

        .site-gallery-lightbox-next {
          right: 6px;
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
        <button class="site-gallery-lightbox-nav site-gallery-lightbox-prev" type="button" aria-label="Previous image">&lt;</button>
        <img class="site-gallery-lightbox-image" alt="">
        <p class="site-gallery-lightbox-caption">
          <span class="site-gallery-lightbox-text"></span>
          <span class="site-gallery-lightbox-counter"></span>
        </p>
        <button class="site-gallery-lightbox-nav site-gallery-lightbox-next" type="button" aria-label="Next image">&gt;</button>
      </div>
    `;

    image = lightbox.querySelector('.site-gallery-lightbox-image');
    caption = lightbox.querySelector('.site-gallery-lightbox-text');
    counter = lightbox.querySelector('.site-gallery-lightbox-counter');
    previousButton = lightbox.querySelector('.site-gallery-lightbox-prev');
    nextButton = lightbox.querySelector('.site-gallery-lightbox-next');
    closeButton = lightbox.querySelector('.site-gallery-lightbox-close');

    closeButton.addEventListener('click', close);
    previousButton.addEventListener('click', function () {
      showImage(activeIndex - 1);
    });
    nextButton.addEventListener('click', function () {
      showImage(activeIndex + 1);
    });
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

  function getImageUrl(source) {
    if (source.matches && source.matches('img')) {
      return source.currentSrc || source.src;
    }

    return source.href;
  }

  function getGalleryItems(gallery) {
    const seen = new Set();
    const items = [];

    gallery.querySelectorAll('a[href], img').forEach(function (source) {
      if (source.matches('a[href]') && !isImageLink(source)) {
        return;
      }

      if (source.matches('img') && source.closest('a[href]')) {
        return;
      }

      const url = getImageUrl(source);
      if (!url || seen.has(url)) {
        return;
      }

      seen.add(url);
      items.push({
        source,
        url,
        alt: getAlt(source)
      });
    });

    return items;
  }

  function showImage(index) {
    if (!activeItems.length) {
      return;
    }

    activeIndex = (index + activeItems.length) % activeItems.length;
    const item = activeItems[activeIndex];
    image.src = item.url;
    image.alt = item.alt;
    caption.textContent = item.alt;

    const hasMultipleItems = activeItems.length > 1;
    previousButton.hidden = !hasMultipleItems;
    nextButton.hidden = !hasMultipleItems;
    counter.textContent = hasMultipleItems ? ` ${activeIndex + 1} / ${activeItems.length}` : '';
  }

  function open(gallery, source) {
    ensureLightbox();
    activeItems = getGalleryItems(gallery);
    activeIndex = activeItems.findIndex(function (item) {
      return item.source === source || item.source.contains(source) || source.contains(item.source);
    });

    if (activeIndex < 0) {
      activeItems.unshift({
        source,
        url: getImageUrl(source),
        alt: getAlt(source)
      });
      activeIndex = 0;
    }

    previousFocus = document.activeElement;
    showImage(activeIndex);
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
    activeItems = [];
    activeIndex = 0;

    if (previousFocus && typeof previousFocus.focus === 'function') {
      previousFocus.focus({ preventScroll: true });
    }
  }

  document.addEventListener('click', function (event) {
    const galleryContainer = event.target.closest(gallerySelector);
    const gallery = event.target.closest('.news-article') || galleryContainer;
    if (!gallery) {
      return;
    }

    const link = event.target.closest(imageLinkSelector);
    if (link && gallery.contains(link) && isImageLink(link)) {
      event.preventDefault();
      open(gallery, link);
      return;
    }

    const directImage = event.target.closest('img');
    if (!directImage || !gallery.contains(directImage)) {
      return;
    }

    event.preventDefault();
    open(gallery, directImage);
  });

  document.addEventListener('keydown', function (event) {
    if (!lightbox || !lightbox.classList.contains('is-open')) {
      return;
    }

    if (event.key === 'Escape') {
      close();
    } else if (event.key === 'ArrowLeft') {
      showImage(activeIndex - 1);
    } else if (event.key === 'ArrowRight') {
      showImage(activeIndex + 1);
    }
  });

  injectStyles();
})();
