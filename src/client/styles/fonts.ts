// Bundled so the Font Family choices render the same whether or not they are
// installed. Imported from JS, not global.css: Tailwind's @import inlining
// leaves Fontsource's relative font URLs unresolved. Each font's licence ships
// from public/font-licenses; fonts.test.ts checks it holds the package's
// copyright notice and licence.
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/700.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/700.css';
import '@fontsource/ubuntu-mono/400.css';
import '@fontsource/ubuntu-mono/700.css';
