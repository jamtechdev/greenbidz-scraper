/**
 * @file web/proxy/selector-inject.js
 * @description The client-side script + styles injected into proxied pages so
 *              the Mapping Studio iframe becomes an interactive element picker.
 *
 *              Runs INSIDE the proxied (same-origin) iframe. It cannot import
 *              anything — it is serialised verbatim into the page. It talks to
 *              the React parent purely via window.postMessage:
 *
 *   iframe → parent : { source:'scraper-iframe', type:'ready' }
 *                     { source:'scraper-iframe', type:'picked', field, multi, payload }
 *                     { source:'scraper-iframe', type:'hover', text }
 *                     { source:'scraper-iframe', type:'navigate', url }   // link click
 *   parent → iframe : { source:'scraper-parent', type:'arm', field, color, multi }
 *                     { source:'scraper-parent', type:'disarm' }
 *                     { source:'scraper-parent', type:'clear', field }
 *                     { source:'scraper-parent', type:'clearAll' }
 *
 *  The selector-generation strategy mirrors detectors/field-auto-detector.js so
 *  selectors produced here resolve the same way under the real scraper.
 */

export const SELECTOR_STYLE = `
  .__sx-picked { outline: 2px solid #22c55e !important; outline-offset: -2px !important;
    background: rgba(34,197,94,0.10) !important; }
  /* Declared AFTER picked so the blue hover outline wins even on a re-picked element. */
  .__sx-hover { outline: 2px solid #38bdf8 !important; outline-offset: -2px !important;
    cursor: crosshair !important; background: rgba(56,189,248,0.08) !important; }
  .__sx-badge { position: absolute; z-index: 2147483647; font: 600 11px/1.4 system-ui, sans-serif;
    color: #04210f; background: #22c55e; padding: 1px 6px; border-radius: 4px;
    pointer-events: none; transform: translateY(-100%); white-space: nowrap; }
  html.__sx-armed, html.__sx-armed * { cursor: crosshair !important; }
`;

export const SELECTOR_SCRIPT = `
(function () {
  if (window.__sxInstalled) return;
  window.__sxInstalled = true;

  var armed = null;        // { field, color, multi }
  var picks = {};          // field -> [elements]
  var badges = [];

  function send(msg) {
    msg.source = 'scraper-iframe';
    parent.postMessage(msg, '*');
  }

  // ── selector generation (mirrors field-auto-detector cssPath) ───────────────
  function cssPath(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.id) return '#' + CSS.escape(el.id);
    var parts = [];
    var node = el;
    var depth = 0;
    while (node && node.nodeType === 1 && depth < 4) {
      var part = node.tagName.toLowerCase();
      var cls = (node.getAttribute('class') || '')
        .split(/\\s+/).filter(Boolean)
        .filter(function (c) { return !/\\d{3,}/.test(c) && !/^__sx/.test(c); })
        .slice(0, 2);
      if (cls.length) part += '.' + cls.map(function (c) { return CSS.escape(c); }).join('.');
      // Add :nth-of-type when needed to stay unique among siblings of same tag.
      if (node.parentElement) {
        var sameTag = Array.prototype.filter.call(
          node.parentElement.children,
          function (c) { return c.tagName === node.tagName; }
        );
        if (sameTag.length > 1 && !node.id) {
          part += ':nth-of-type(' + (sameTag.indexOf(node) + 1) + ')';
        }
      }
      parts.unshift(part);
      node = node.parentElement;
      depth += 1;
    }
    return parts.join(' > ');
  }

  // Try to find the simplest selector that still uniquely matches el.
  function bestSelector(el) {
    var full = cssPath(el);
    // Prefer a short class-based selector if it is unique enough.
    var cls = (el.getAttribute('class') || '')
      .split(/\\s+/).filter(Boolean)
      .filter(function (c) { return !/\\d{3,}/.test(c) && !/^__sx/.test(c); });
    for (var i = 0; i < cls.length; i++) {
      var sel = el.tagName.toLowerCase() + '.' + CSS.escape(cls[i]);
      try { if (document.querySelectorAll(sel).length === 1) return sel; } catch (e) {}
    }
    return full;
  }

  function xPath(el) {
    if (!el || el.nodeType !== 1) return null;
    if (el.id) return '//*[@id=\"' + el.id + '\"]';
    var parts = [];
    var node = el;
    while (node && node.nodeType === 1) {
      var ix = 1;
      var sib = node.previousElementSibling;
      while (sib) { if (sib.tagName === node.tagName) ix++; sib = sib.previousElementSibling; }
      parts.unshift(node.tagName.toLowerCase() + '[' + ix + ']');
      node = node.parentElement;
    }
    return '/' + parts.join('/');
  }

  function attrsOf(el) {
    var out = {};
    for (var i = 0; i < el.attributes.length; i++) {
      var a = el.attributes[i];
      if (a.name === 'class' || a.name.indexOf('__sx') === 0) continue;
      out[a.name] = a.value;
    }
    return out;
  }

  function imgSrcOf(el) {
    if (el.tagName === 'IMG') return el.currentSrc || el.src || el.getAttribute('data-src') || null;
    var img = el.querySelector ? el.querySelector('img') : null;
    if (img) return img.currentSrc || img.src || img.getAttribute('data-src') || null;
    var bg = getComputedStyle(el).backgroundImage;
    var m = bg && bg.match(/url\\([\"']?(.*?)[\"']?\\)/);
    return m ? m[1] : null;
  }

  function nearestAnchorHref(el) {
    var a = el.closest ? el.closest('a[href]') : null;
    return a ? a.href : null;
  }

  // Classes of the <img> for/under this element — used to build a shared-class
  // image selector that matches the whole gallery, not just one thumbnail.
  function imgClassesOf(el) {
    var img = el.tagName === 'IMG' ? el : (el.querySelector ? el.querySelector('img') : null);
    if (!img) return [];
    return (img.getAttribute('class') || '')
      .split(/\\s+/)
      .filter(Boolean)
      .filter(function (c) { return !/\\d{3,}/.test(c) && !/^__sx/.test(c); });
  }

  function payloadFor(el) {
    return {
      selector: bestSelector(el),
      xpath: xPath(el),
      text: (el.textContent || '').trim().slice(0, 500),
      html: (el.innerHTML || '').trim().slice(0, 5000),
      attrs: attrsOf(el),
      imgSrc: imgSrcOf(el),
      href: nearestAnchorHref(el),
      tag: el.tagName.toLowerCase(),
    };
  }

  // ── highlight management ────────────────────────────────────────────────────
  function clearBadges() {
    badges.forEach(function (b) { b.remove(); });
    badges = [];
  }
  function repaintBadges() {
    clearBadges();
    Object.keys(picks).forEach(function (field) {
      picks[field].forEach(function (el, idx) {
        var r = el.getBoundingClientRect();
        var b = document.createElement('div');
        b.className = '__sx-badge';
        b.textContent = picks[field].length > 1 ? field + ' ' + (idx + 1) : field;
        b.style.left = (r.left + window.scrollX) + 'px';
        b.style.top = (r.top + window.scrollY) + 'px';
        document.body.appendChild(b);
        badges.push(b);
      });
    });
  }
  function addPick(field, el) {
    if (!picks[field]) picks[field] = [];
    if (picks[field].indexOf(el) === -1) {
      picks[field].push(el);
      el.classList.add('__sx-picked');
    }
  }
  function clearField(field) {
    (picks[field] || []).forEach(function (el) { el.classList.remove('__sx-picked'); });
    delete picks[field];
    repaintBadges();
  }
  function clearAll() {
    Object.keys(picks).forEach(clearField);
    picks = {};
    repaintBadges();
  }

  // ── un-clip flex layouts broken by script-stripping ────────────────────────
  // Some sites lay out a product's detail column as a flex ROW whose columns
  // stretch to equal height (align-items:stretch). With the page's own scripts
  // removed, one column can end up shorter than its content, which then spills
  // out of the capped flex box (overflow:visible) and is painted OVER by later
  // DOM (e.g. the page footer) — hiding sections like a "Specifications" table.
  // Switch only those broken rows to align-items:flex-start so each column sizes
  // to its own content and nothing is covered. Runs in the iframe where images
  // have loaded and the layout matches what the user sees. Idempotent + safe.
  function unclipFlexRows() {
    try {
      var changed = false;
      var els = document.querySelectorAll('*');
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.__sxUnclipped) continue;
        var cs = getComputedStyle(el);
        if (cs.display !== 'flex' && cs.display !== 'inline-flex') continue;
        if (cs.flexDirection.indexOf('column') === 0) continue; // row cross-axis only
        if (cs.alignItems !== 'stretch' && cs.alignItems !== 'normal') continue;
        var cBottom = el.getBoundingClientRect().bottom;
        var clipped = false;
        for (var j = 0; j < el.children.length; j++) {
          var child = el.children[j];
          if (getComputedStyle(child).overflowY !== 'visible') continue; // not a scroller
          // Child content taller than its (stretched) box → it spills below the line.
          if (child.scrollHeight > child.clientHeight + 4 ||
              child.getBoundingClientRect().bottom > cBottom + 4) { clipped = true; break; }
        }
        if (clipped) { el.style.alignItems = 'flex-start'; el.__sxUnclipped = true; changed = true; }
      }
      if (changed) repaintBadges();
    } catch (e) {}
  }

  // ── interaction ─────────────────────────────────────────────────────────────
  var lastHover = null;
  document.addEventListener('mouseover', function (e) {
    if (!armed) return;
    var el = e.target;
    if (!el || el.nodeType !== 1) return;
    if (lastHover) lastHover.classList.remove('__sx-hover');
    lastHover = el;
    el.classList.add('__sx-hover');
    send({ type: 'hover', text: (el.textContent || '').trim().slice(0, 120), tag: el.tagName.toLowerCase() });
  }, true);

  document.addEventListener('mouseout', function (e) {
    if (e.target && e.target.classList) e.target.classList.remove('__sx-hover');
  }, true);

  // Capture-phase click: block the page's own navigation. When NOT mapping,
  // act like a browser — follow an <a href> through the proxy (parent reloads
  // the preview at that URL). When mapping (armed), pick the element instead.
  document.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopPropagation();
    if (!armed) {
      var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (a && a.href && /^https?:/i.test(a.href)) {
        send({ type: 'navigate', url: a.href });
      }
      return;
    }
    var el = e.target;
    if (!el || el.nodeType !== 1) return;
    el.classList.remove('__sx-hover');

    if (armed.multi) {
      // toggle membership
      if (picks[armed.field] && picks[armed.field].indexOf(el) !== -1) {
        picks[armed.field] = picks[armed.field].filter(function (x) { return x !== el; });
        el.classList.remove('__sx-picked');
      } else {
        addPick(armed.field, el);
      }
    } else {
      clearField(armed.field);
      addPick(armed.field, el);
    }
    repaintBadges();
    var items = (picks[armed.field] || []).map(function (x) {
      return { selector: bestSelector(x), imgSrc: imgSrcOf(x), classes: imgClassesOf(x) };
    });
    send({
      type: 'picked',
      field: armed.field,
      multi: !!armed.multi,
      payload: payloadFor(el),
      items: items,
      count: items.length,
    });

    // Single-pick fields are one-and-done: disarm so the highlight/cursor reset
    // and the next "Pick"/"Re-pick" arms cleanly. Multi (images) stays armed.
    if (!armed.multi) {
      armed = null;
      document.documentElement.classList.remove('__sx-armed');
      if (lastHover) { lastHover.classList.remove('__sx-hover'); lastHover = null; }
    }
  }, true);

  window.addEventListener('scroll', repaintBadges, true);
  window.addEventListener('resize', repaintBadges);

  // ── parent → iframe commands ────────────────────────────────────────────────
  window.addEventListener('message', function (e) {
    var d = e.data;
    if (!d || d.source !== 'scraper-parent') return;
    if (d.type === 'arm') {
      armed = { field: d.field, color: d.color, multi: !!d.multi };
      document.documentElement.classList.add('__sx-armed');
      // Start hover fresh so the blue outline tracks the cursor immediately.
      if (lastHover) { lastHover.classList.remove('__sx-hover'); lastHover = null; }
    } else if (d.type === 'disarm') {
      armed = null;
      document.documentElement.classList.remove('__sx-armed');
      if (lastHover) lastHover.classList.remove('__sx-hover');
    } else if (d.type === 'clear') {
      clearField(d.field);
    } else if (d.type === 'clearAll') {
      clearAll();
    }
  });

  // Fix clipped flex layouts now and again as late images/fonts load and reflow
  // the page (so a "Specifications" block hidden behind the footer reappears).
  unclipFlexRows();
  window.addEventListener('load', unclipFlexRows);
  window.addEventListener('resize', unclipFlexRows);
  setTimeout(unclipFlexRows, 600);
  setTimeout(unclipFlexRows, 1500);
  setTimeout(unclipFlexRows, 3000);

  send({ type: 'ready', url: location.href, title: document.title });
})();
`;

export default { SELECTOR_SCRIPT, SELECTOR_STYLE };
