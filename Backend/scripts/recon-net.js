/**
 * @file scripts/recon-net.js
 * @description Capture XHR/fetch JSON responses + clickable card structure on
 *              the listing page, to discover the underlying API and how product
 *              navigation works.
 */
import { launchBrowser, newPage, goto, closeBrowser } from '../config/puppeteer.js';

const LISTING = process.argv[2] || 'https://101lab.co/buyer-marketplace';
const PRODUCT = process.argv[3] || 'https://101lab.co/buyer-marketplace/2473';

async function main() {
  const browser = await launchBrowser();
  const page = await newPage(browser);
  const api = [];

  page.on('response', async (res) => {
    try {
      const url = res.url();
      const ct = res.headers()['content-type'] || '';
      if (ct.includes('application/json') && !/gtm|google|analytics/.test(url)) {
        let sample = null;
        try {
          const json = await res.json();
          sample = JSON.stringify(json).slice(0, 300);
        } catch {
          sample = '(unparseable)';
        }
        api.push({ url, status: res.status(), sample });
      }
    } catch {
      /* ignore */
    }
  });

  await goto(page, LISTING);
  await new Promise((r) => setTimeout(r, 5000));

  // Card structure: find elements that look like product cards.
  const cards = await page.evaluate(() => {
    const cssPath = (el) => {
      const parts = [];
      let n = el;
      let d = 0;
      while (n && n.nodeType === 1 && d < 4) {
        let p = n.tagName.toLowerCase();
        const c = (n.getAttribute('class') || '').split(/\s+/).filter(Boolean).slice(0, 2);
        if (c.length) p += '.' + c.join('.');
        parts.unshift(p);
        n = n.parentElement;
        d += 1;
      }
      return parts.join(' > ');
    };
    // Anchors of any kind.
    const anchors = Array.from(document.querySelectorAll('a[href]'))
      .map((a) => a.getAttribute('href'))
      .filter((h) => h && /marketplace|product|\d{3,}/.test(h))
      .slice(0, 15);
    // Elements containing product images (greenbidz uploads).
    const imgCards = Array.from(document.querySelectorAll('img'))
      .filter((img) => /greenbidz\.com\/wp-content/.test(img.src))
      .slice(0, 6)
      .map((img) => {
        // climb to a likely card container
        let n = img;
        for (let i = 0; i < 4 && n.parentElement; i += 1) n = n.parentElement;
        return { imgSrc: img.src, cardSel: cssPath(n), cardTag: n.tagName };
      });
    return { anchors, imgCards, totalImgs: document.querySelectorAll('img').length };
  });

  await page.close().catch(() => {});
  await closeBrowser(browser);

  console.log(
    JSON.stringify(
      { listing: LISTING, product: PRODUCT, apiCalls: api, cards },
      null,
      2,
    ),
  );
}
main().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
