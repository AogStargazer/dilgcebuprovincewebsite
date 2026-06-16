(function () {
  function normalize(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function addRecord(recordsByUrl, url, title, text) {
    var cleanUrl = normalize(url);
    var cleanTitle = normalize(title);
    var cleanText = normalize(text);

    if (!cleanUrl || cleanUrl === "#" || cleanUrl.indexOf("javascript:") === 0 || !cleanTitle) {
      return;
    }

    var existing = recordsByUrl.get(cleanUrl);
    if (existing) {
      existing.text = normalize(existing.text + " " + cleanText);
      return;
    }

    recordsByUrl.set(cleanUrl, {
      url: cleanUrl,
      title: cleanTitle,
      text: cleanText
    });
  }

  function buildFallbackRecords() {
    var recordsByUrl = new Map();
    var main = document.querySelector("main");

    addRecord(recordsByUrl, "index.html", document.title, main ? main.innerText : document.body.innerText);

    document.querySelectorAll(".main-navigation a[href], main a[href], .footer-navigation a[href]").forEach(function (link) {
      var href = link.getAttribute("href");
      var container = link.closest("article, section, li, .elementor-widget-container, .container") || link;
      var title = link.getAttribute("aria-label") || link.textContent;
      addRecord(recordsByUrl, href, title, container.innerText);
    });

    return Array.from(recordsByUrl.values());
  }

  function makeSnippet(text, query) {
    var cleanText = normalize(text);
    var lowerText = cleanText.toLowerCase();
    var lowerQuery = query.toLowerCase();
    var index = lowerText.indexOf(lowerQuery);

    if (index === -1) {
      return cleanText.slice(0, 145);
    }

    var start = Math.max(0, index - 54);
    var end = Math.min(cleanText.length, index + lowerQuery.length + 86);
    return (start > 0 ? "... " : "") + cleanText.slice(start, end) + (end < cleanText.length ? " ..." : "");
  }

  function getScore(record, query, terms) {
    var title = (record.title || "").toLowerCase();
    var text = (record.text || "").toLowerCase();
    var score = 0;

    if (title === query) score += 100;
    if (title.indexOf(query) !== -1) score += 55;
    if (text.indexOf(query) !== -1) score += 20;

    terms.forEach(function (term) {
      if (title.indexOf(term) !== -1) score += 14;
      if (text.indexOf(term) !== -1) score += 4;
    });

    return score;
  }

  function initSiteSearch() {
    var searchMenu = document.querySelector(".site-search-menu");
    var searchToggle = document.querySelector(".site-search-toggle");
    var searchForm = document.querySelector("[data-site-search-form]");
    var searchInput = document.querySelector("[data-site-search-input]");
    var searchStatus = document.querySelector("[data-site-search-status]");
    var searchResults = document.querySelector("[data-site-search-results]");

    if (!searchMenu || !searchToggle || !searchForm || !searchInput || !searchStatus || !searchResults) {
      return;
    }

    var records = Array.isArray(window.DILG_SEARCH_INDEX) && window.DILG_SEARCH_INDEX.length
      ? window.DILG_SEARCH_INDEX
      : buildFallbackRecords();

    function renderResults(query) {
      var cleanQuery = normalize(query).toLowerCase();
      searchResults.innerHTML = "";

      if (cleanQuery.length < 2) {
        searchStatus.textContent = "";
        return;
      }

      var terms = cleanQuery.split(" ").filter(Boolean);
      var matches = records
        .map(function (record) {
          return { record: record, score: getScore(record, cleanQuery, terms) };
        })
        .filter(function (entry) {
          return entry.score > 0;
        })
        .sort(function (a, b) {
          return b.score - a.score || (a.record.title || "").localeCompare(b.record.title || "");
        })
        .slice(0, 8);

      searchStatus.textContent = matches.length ? matches.length + " result" + (matches.length === 1 ? "" : "s") : "No results found";

      matches.forEach(function (entry) {
        var record = entry.record;
        var item = document.createElement("li");
        var link = document.createElement("a");
        var title = document.createElement("span");
        var url = document.createElement("span");
        var snippet = document.createElement("span");

        item.className = "site-search-result";
        link.href = record.url;
        title.className = "site-search-result-title";
        title.textContent = record.title;
        url.className = "site-search-result-url";
        url.textContent = record.url;
        snippet.className = "site-search-result-snippet";
        snippet.textContent = makeSnippet(record.text, cleanQuery);

        link.append(title, url, snippet);
        item.appendChild(link);
        searchResults.appendChild(item);
      });
    }

    function setSearchOpen(isOpen) {
      searchMenu.classList.toggle("is-open", isOpen);
      searchToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    }

    searchToggle.addEventListener("click", function () {
      var shouldOpen = !searchMenu.classList.contains("is-open");
      setSearchOpen(shouldOpen);
      if (shouldOpen) {
        window.setTimeout(function () {
          searchInput.focus();
        }, 30);
      }
    });

    searchMenu.addEventListener("mouseenter", function () {
      setSearchOpen(true);
    });

    searchMenu.addEventListener("mouseleave", function () {
      if (!searchMenu.contains(document.activeElement)) {
        setSearchOpen(false);
      }
    });

    searchMenu.addEventListener("focusin", function () {
      setSearchOpen(true);
    });

    searchMenu.addEventListener("focusout", function () {
      window.setTimeout(function () {
        if (!searchMenu.contains(document.activeElement)) {
          setSearchOpen(false);
        }
      }, 0);
    });

    searchInput.addEventListener("input", function () {
      renderResults(searchInput.value);
    });

    searchForm.addEventListener("submit", function (event) {
      event.preventDefault();
      renderResults(searchInput.value);
      var firstResult = searchResults.querySelector("a");
      if (firstResult) {
        firstResult.focus();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && searchMenu.classList.contains("is-open")) {
        setSearchOpen(false);
        searchToggle.focus();
      }
    });

    document.addEventListener("click", function (event) {
      if (!searchMenu.contains(event.target)) {
        setSearchOpen(false);
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSiteSearch);
  } else {
    initSiteSearch();
  }
})();
