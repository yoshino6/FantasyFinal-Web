import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('character attributes keep mastery and resistance in the same two-column grid on narrow screens', () => {
  const app = readFileSync(new URL('../src/App.vue', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.match(app, /元素精通[\s\S]*class="character-battle-grid"[\s\S]*elementMasteryEntries/);
  assert.match(app, /元素抗性[\s\S]*class="character-battle-grid"[\s\S]*elementResistanceEntries/);
  assert.equal((app.match(/class="character-battle-grid"/g) ?? []).length >= 5, true);
  assert.match(styles, /\.character-tabs\s*\{[^}]*grid-template-columns:\s*repeat\(5,/);
  const narrow = styles.match(/@media \(max-width: 480px\) \{[\s\S]*?\.character-battle-grid\s*\{([^}]*)\}/)?.[1] ?? '';
  assert.match(narrow, /grid-template-columns:\s*repeat\(2,/);
});
