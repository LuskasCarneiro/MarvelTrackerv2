import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { runInNewContext } from 'vm';

const htmlPath = resolve('/home/luskas_carneiro/Desktop/marvel-vault/index.html');
const outputPath = resolve('/home/luskas_carneiro/Desktop/marvel-tracker-v2/data/v1-source.json');

const html = readFileSync(htmlPath, 'utf-8');
const lines = html.split('\n');

// Extract JavaScript constant by searching for "const NAME = " and finding the closing bracket
function extractConstant(name: string): unknown {
  // Find the const in the raw HTML as a single string
  const htmlText = html;
  const marker = `const ${name} = `;
  const idx = htmlText.indexOf(marker);
  if (idx === -1) {
    throw new Error(`Could not find const ${name}`);
  }

  // Find the opening bracket/brace
  let pos = idx + marker.length;
  while (pos < htmlText.length && (htmlText[pos] === ' ' || htmlText[pos] === '\n' || htmlText[pos] === '\t' || htmlText[pos] === '\r')) {
    pos++;
  }

  const openChar = htmlText[pos];
  if (openChar !== '{' && openChar !== '[') {
    throw new Error(`Expected { or [ after const ${name} =`);
  }

  // Now find the matching closing bracket using a proper bracket counter
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let i = pos;

  while (i < htmlText.length) {
    const char = htmlText[i];
    const prevChar = i > 0 ? htmlText[i - 1] : '';

    if (inString) {
      // Handle escape sequences
      if (char === stringChar && prevChar !== '\\') {
        inString = false;
      } else if (char === '\\') {
        // Skip the next character
        i++;
      }
    } else {
      if (char === '"' || char === "'" || char === '`') {
        inString = true;
        stringChar = char;
      } else if (char === '{' || char === '[') {
        depth++;
      } else if (char === '}' || char === ']') {
        depth--;
        if (depth === 0) {
          // Found the end
          const literal = htmlText.substring(pos, i + 1);
          const context: Record<string, unknown> = { result: null };
          try {
            runInNewContext(`result = ${literal}`, context);
            return context.result;
          } catch (e) {
            throw new Error(`Failed to evaluate ${name}: ${e}`);
          }
        }
      }
    }
    i++;
  }

  throw new Error(`Could not find matching bracket for const ${name}`);
}

// Extract all four constants
console.log('Extracting constants from v1 source...');
const U_movies = extractConstant('U_movies') as Record<string, { name: string; color?: string; cx?: number; cy?: number }>;
const films = extractConstant('films') as Array<{ u: string; t: string; r: number; s: string; d: string }>;
const U_series = extractConstant('U_series') as Record<string, { name: string; color?: string; cx?: number; cy?: number }>;
const seriesItems = extractConstant('seriesItems') as Array<{ u: string; t: string; r: number; s: string; d: string }>;

console.log(`✓ Found ${Object.keys(U_movies).length} film universes`);
console.log(`✓ Found ${films.length} films`);
console.log(`✓ Found ${Object.keys(U_series).length} series universes`);
console.log(`✓ Found ${seriesItems.length} series items`);

// Transform: drop color, cx, cy from universe maps
const filmUniverses: Record<string, { name: string }> = {};
for (const [key, value] of Object.entries(U_movies)) {
  filmUniverses[key] = { name: value.name };
}

const seriesUniverses: Record<string, { name: string }> = {};
for (const [key, value] of Object.entries(U_series)) {
  seriesUniverses[key] = { name: value.name };
}

// Build output
const output = {
  filmUniverses,
  seriesUniverses,
  films,
  series: seriesItems,
};

// Write with 2-space indent and trailing newline
writeFileSync(outputPath, JSON.stringify(output, null, 2) + '\n', 'utf-8');
console.log(`\nOutput written to ${outputPath}`);
