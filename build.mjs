import { promises as fs } from 'fs';
import path from 'path';

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  for (const entry of await fs.readdir(src)) {
    const s = path.join(src, entry);
    const d = path.join(dest, entry);
    const stat = await fs.stat(s);
    if (stat.isDirectory()) await copyDir(s, d);
    else await fs.copyFile(s, d);
  }
}

await copyDir('src/lib', 'lib');
await copyDir('src/components', 'components');
await copyDir('src/apps', 'apps');
