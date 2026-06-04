/**
 * @file scripts/recon.js
 * @description Developer recon tool — renders live pages with Puppeteer and
 *              dumps DOM structure to help author/verify mapping profiles for
 *              JS-rendered (SPA) sites like 101lab.co / GreenBidz.
 *
 * Usage:
 *   node scripts/recon.js                              # default 101lab listing+product
 *   node scripts/recon.js --listing=<url> --product=<url>
 */

import { launchBrowser, newPage, goto, closeBrowser } from '../config/puppeteer.js';

function parseArgs() {
  const out = {};
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const DEFAULT_LISTING = 'https://101lab.co/buyer-marketplace';
const DEFAULT_PRODUCT = 'https://101lab.co/buyer-marketplace/2473';

async function reconListing(browser, url) {
  const page = await newPage(browser);
  try {
    await goto(page, url);
    await new Promise((r) => setTimeout(r, 4000));
    const data = await page.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href]'));
      const productLinks = anchors
        .map((a) => a.href)
        .filter((h) => /\/buyer-marketplace\/\d+/.test(h));
      const paginationCandidates = Array.from(
        document.querySelectorAll(
          'a[rel="next"], [aria-label*="next" i], .pagination, [class*="paginat" i], button',
        ),
      )
        .slice(0, 20)
        .map((el) => ({
          tag: el.tagName.toLowerCase(),
          cls: el.getAttribute('class'),
          text: (el.textContent || '').trim().slice(0, 30),
          aria: el.getAttribute('aria-label'),
        }));
      return {
        title: document.title,
        productLinkCount: productLinks.length,
        sampleProductLinks: Array.from(new Set(productLinks)).slice(0, 8),
        paginationCandidates,
      };
    });
    return data;
  } finally {
    await page.close().catch(() => {});
  }
}

async function reconProduct(browser, url) {
  const page = await newPage(browser);
  try {
    await goto(page, url);
    await new Promise((r) => setTimeout(r, 4000));
    const data = await page.evaluate(() => {
      const cssPath = (el) => {
        if (!el) return null;
        if (el.id) return `#${el.id}`;
        const parts = [];
        let node = el;
        let depth = 0;
        while (node && node.nodeType === 1 && depth < 5) {
          let p = node.tagName.toLowerCase();
          const cls = (node.getAttribute('class') || '')
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2);
          if (cls.length) p += '.' + cls.join('.');
          parts.unshift(p);
          node = node.parentElement;
          depth += 1;
        }
        return parts.join(' > ');
      };

      const h1 = document.querySelector('h1');
      const headings = Array.from(document.querySelectorAll('h1,h2,h3'))
        .slice(0, 8)
        .map((el) => ({ tag: el.tagName, text: el.textContent.trim().slice(0, 80), sel: cssPath(el) }));

      const priceEls = Array.from(
        document.querySelectorAll('[class*="price" i], [data-price], [class*="amount" i]'),
      )
        .slice(0, 10)
        .map((el) => ({ sel: cssPath(el), text: el.textContent.trim().slice(0, 40) }));

      const descEls = Array.from(
        document.querySelectorAll('[class*="descrip" i], [class*="detail" i], article, [class*="content" i]'),
      )
        .map((el) => ({ sel: cssPath(el), len: el.textContent.trim().length }))
        .filter((d) => d.len > 30)
        .sort((a, b) => b.len - a.len)
        .slice(0, 6);

      const imgs = Array.from(document.querySelectorAll('img'))
        .map((img) => ({
          src: img.currentSrc || img.src,
          w: img.naturalWidth,
          cls: img.getAttribute('class'),
        }))
        .filter((i) => i.src && i.w >= 100)
        .slice(0, 12);

      return {
        title: document.title,
        h1Text: h1 ? h1.textContent.trim() : null,
        h1Sel: h1 ? cssPath(h1) : null,
        headings,
        priceEls,
        descEls,
        imgs,
        bodyTextSample: document.body.innerText.slice(0, 400),
      };
    });
    return data;
  } finally {
    await page.close().catch(() => {});
  }
}

async function main() {
  const args = parseArgs();
  const listingUrl = args.listing || DEFAULT_LISTING;
  const productUrl = args.product || DEFAULT_PRODUCT;

  const browser = await launchBrowser();
  try {
    const listing = await reconListing(browser, listingUrl);
    const product = await reconProduct(browser, productUrl);
    console.log(JSON.stringify({ listingUrl, productUrl, listing, product }, null, 2));
  } finally {
    await closeBrowser(browser);
  }
}

main().catch((err) => {
  console.error('RECON_ERROR:', err.message);
  process.exit(1);
});
