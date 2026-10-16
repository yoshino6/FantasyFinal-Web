import manifest from './achievement-art-manifest.json';
import bossManifest from './achievement-boss-art-manifest.json';
import { MONSTER_ART_BY_NAME } from './exploration-target-mapping';
import { EXPLORATION_TARGET_KEYS } from './exploration-art-manifest';
import { gameAssetUrl } from './game-assets';

type AchievementArtEntry = { id: string; name: string; category: string; description?: string };
const entries = manifest.entries as Record<string, { file: string }>;
const bossEntries = bossManifest.entries as Record<string, { targetKey: string; difficulty: string }>;
const bossNames = Object.keys(MONSTER_ART_BY_NAME).sort((a, b) => b.length - a.length);
export const ACHIEVEMENT_ART_FALLBACK = '/assets/ui/manual/footprints.png';

/** Permanent IDs own their painted icon; runtime boss records reuse their species art. */
export function achievementArtFor(entry: AchievementArtEntry): string {
  const art = entries[entry.id];
  if (art) return gameAssetUrl(`/assets/light-anime/achievements-imagegen-v1/${art.file}`);
  if (entry.category === '首领' || entry.id.startsWith('ACH_BOSS_')) {
    const boss = bossEntries[entry.id];
    if (boss && EXPLORATION_TARGET_KEYS.includes(boss.targetKey)) {
      return gameAssetUrl(`/assets/light-anime/exploration-v1/targets/${boss.targetKey}.webp`);
    }
    const text = `${entry.name} ${entry.description ?? ''}`;
    const name = bossNames.find(name => text.includes(name));
    const key = name ? MONSTER_ART_BY_NAME[name] : '';
    if (key && EXPLORATION_TARGET_KEYS.includes(key)) {
      return gameAssetUrl(`/assets/light-anime/exploration-v1/targets/${key}.webp`);
    }
    return gameAssetUrl('/assets/light-anime/achievements-imagegen-v1/boss.png');
  }
  return gameAssetUrl(ACHIEVEMENT_ART_FALLBACK);
}
