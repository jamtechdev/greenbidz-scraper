// Repair a labassets profile whose title selector is too specific (it required
// a `span.notranslate` inside the <h1>, which most products don't have). Point
// `title` and `waitForSelector` at the stable `h1.show-info__title` instead.
//
// Usage:  node scripts/fix-title-selector.mjs [profile_file_name.json]
import { readProfile, writeProfile } from '../utils/file-manager.js';
import { sequelize } from '../models/index.js';

const fileName = process.argv[2] || 'profile_wwwlabassetscom.json';
const STABLE = 'h1.show-info__title';

try {
  const profile = await readProfile(fileName);
  const before = profile?.fields?.title?.selector;
  console.log(`Profile: ${fileName}`);
  console.log('title selector BEFORE:', before);

  profile.fields = profile.fields || {};
  profile.fields.title = {
    ...(profile.fields.title || {}),
    selector: STABLE,
    type: 'text',
    required: true,
  };
  delete profile.fields.title.xpath; // brittle absolute xpath — not used for scraping anyway

  profile.selectors = profile.selectors || {};
  profile.selectors.waitForSelector = STABLE;

  await writeProfile(fileName, profile);
  console.log('title selector AFTER: ', profile.fields.title.selector);
  console.log('waitForSelector AFTER:', profile.selectors.waitForSelector);
  console.log('\n✅ Updated. Re-run the crawl — titles should now extract.');
} catch (e) {
  console.error('❌ Failed:', e.message);
} finally {
  await sequelize.close();
  process.exit(0);
}
