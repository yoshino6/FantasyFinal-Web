import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const transpile = path => ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
function registry(assets = []) {
  const gameAssets = {};
  runInNewContext(transpile('../src/game-assets.ts'), { exports: gameAssets, __FF_BOOT_ASSETS__: assets });
  const exports = {};
  runInNewContext(transpile('../src/character-assets.ts'), { exports, require: id => {
    assert.equal(id, './game-assets'); return gameAssets;
  } });
  return exports;
}
const plain = value => JSON.parse(JSON.stringify(value));

test('default portraits preserve every existing key and fallback order', () => {
  const original = registry();
  const paths = { ...original.CHARACTER_BASE_ASSETS, ...original.CHARACTER_ADVANCED_ASSETS };
  const loaded = registry(Object.values(paths).map(path => ({ path, hash: 'unchanged' })));
  assert.equal(Object.keys(paths).length, 62);
  for (const [key, path] of Object.entries(paths)) {
    const portrait = { baseKey: key, poseKey: 'unused_dynamic_pose', fallbackKey: 'profession_mage_female' };
    const expected = original.CHARACTER_BASE_ASSETS[key] ? [path] : [path, paths.profession_mage_female];
    assert.deepEqual(plain(loaded.portraitAssetCandidates(portrait)), expected.map(path => `${path}?ffv=unchanged`));
    assert.equal(loaded.portraitBaseAsset(portrait), `${path}?ffv=unchanged`);
  }
  assert.deepEqual(plain(loaded.portraitAssetCandidates({ baseKey: 'unknown', poseKey: '', fallbackKey: 'profession_mage_female' })), [`${paths.profession_mage_female}?ffv=unchanged`]);
  assert.equal(loaded.portraitBaseAsset(), `${paths.player_male_initial}?ffv=unchanged`);
});

test('both 62-key variants use released hashes and retain the existing image chain', () => {
  const original = registry();
  const variants = original.CHARACTER_VARIANT_ASSETS;
  const all = Object.values(variants).flatMap(Object.values);
  assert.equal(all.length, 124); assert.equal(new Set(all).size, 124);
  const loaded = registry(all.map(path => ({ path, hash: 'new-art' })));
  for (const variant of ['profile', 'equipment']) {
    assert.equal(Object.keys(variants[variant]).length, 62);
    for (const [key, path] of Object.entries(variants[variant])) {
      const portrait = { baseKey: key, poseKey: 'standing', fallbackKey: 'profession_archer_female' };
      const expected = [`${path}?ffv=new-art`, ...plain(original.portraitAssetCandidates(portrait))];
      assert.deepEqual(plain(loaded.portraitAssetCandidates(portrait, variant)), expected);
      assert.deepEqual(plain(loaded.portraitAssetCandidates(portrait)), plain(original.portraitAssetCandidates(portrait)));
    }
  }
});

test('unreleased variants fall back immediately without requesting missing files', () => {
  const loaded = registry();
  for (const variant of ['profile', 'equipment']) {
    for (const key of Object.keys(loaded.CHARACTER_VARIANT_ASSETS[variant])) {
      const portrait = { baseKey: key, poseKey: '', fallbackKey: 'profession_priest_female' };
      assert.deepEqual(plain(loaded.portraitAssetCandidates(portrait, variant)), plain(loaded.portraitAssetCandidates(portrait)));
    }
  }
});

test('the three-beast revision changes only the four ranger variants', () => {
  const current = registry();
  const defaults = { ...current.CHARACTER_BASE_ASSETS, ...current.CHARACTER_ADVANCED_ASSETS };
  let revised = 0;
  for (const variant of ['profile', 'equipment']) for (const [key, path] of Object.entries(current.CHARACTER_VARIANT_ASSETS[variant])) {
    const stem = defaults[key].split('/').pop().replace(/\.png$/, '');
    const ranger = key === 'advanced_ranger_warden_male' || key === 'advanced_ranger_warden_female';
    const directory = ranger ? 'ranger-three-beasts-v2' : 'light-anime-v1';
    assert.equal(path, `/assets/character/${directory}/${stem}-${variant}.webp`);
    if (ranger) revised++;
  }
  assert.equal(revised, 4);
  for (const gender of ['male', 'female']) {
    assert.equal(defaults[`advanced_ranger_warden_${gender}`], `/assets/character/v4/advanced-ranger_warden-${gender}.png`);
  }
});
