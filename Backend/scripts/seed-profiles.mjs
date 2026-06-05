// One-off: import existing profiles/*.json into the profiles table.
import fs from 'node:fs/promises';
import path from 'node:path';
import { CONSTANTS } from '../config/constants.js';
import { writeProfile } from '../utils/file-manager.js';
import { sequelize } from '../models/index.js';

const dir = CONSTANTS.PROFILES_DIR;
const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.json') && f !== 'template.json');

let n = 0;
for (const f of files) {
  const profile = JSON.parse(await fs.readFile(path.join(dir, f), 'utf8'));
  await writeProfile(f, profile);
  console.log('seeded:', f, `(source=${profile.source || 'dom'}, mode=${profile.scrapeMode || 'unset'})`);
  n += 1;
}
console.log(`Done — ${n} profiles seeded into ${process.env.DB_DATABASE}.`);
await sequelize.close();
