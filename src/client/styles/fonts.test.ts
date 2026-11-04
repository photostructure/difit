import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, '../../..');
const fontPackages = [
  ...new Set(
    // slice(1) keeps the package-name capture group.
    [
      ...readFileSync(resolve(here, 'fonts.ts'), 'utf8').matchAll(/'@fontsource\/([^/]+)\//g),
    ].flatMap((match) => match.slice(1)),
  ),
];

describe('bundled fonts', () => {
  it('finds each bundled Fontsource package', () => {
    expect(fontPackages).toEqual(['ibm-plex-mono', 'jetbrains-mono', 'ubuntu-mono']);
  });

  // The OFL and the Ubuntu Font Licence require every copy of the fonts to
  // include the copyright notice and the licence, and Vite copies public/ into
  // each build. Fontsource's ubuntu-mono LICENSE lacks the copyright notice,
  // so the notice comes from the package's metadata.json.
  it.each(fontPackages)('ships the %s copyright and licence in public/font-licenses', (name) => {
    const fontPackage = resolve(repository, 'node_modules/@fontsource', name);
    const metadata = JSON.parse(readFileSync(resolve(fontPackage, 'metadata.json'), 'utf8')) as {
      license: { attribution: string };
    };
    const shipped = readFileSync(
      resolve(repository, 'public/font-licenses', `${name}.txt`),
      'utf8',
    );

    expect(shipped).toContain(metadata.license.attribution);
    expect(shipped).toContain(readFileSync(resolve(fontPackage, 'LICENSE'), 'utf8'));
  });
});
