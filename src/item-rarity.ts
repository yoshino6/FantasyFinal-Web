export type ItemRarity = 'common' | 'excellent' | 'fine' | 'rare' | 'legendary' | 'epic' | 'artifact';

const rarityAliases: Readonly<Record<string, ItemRarity>> = {
  普通: 'common', common: 'common',
  优秀: 'excellent', excellent: 'excellent',
  精良: 'fine', fine: 'fine',
  稀有: 'rare', rare: 'rare',
  传说: 'legendary', legendary: 'legendary',
  史诗: 'epic', epic: 'epic',
  神器: 'artifact', artifact: 'artifact'
};

/** Unknown metadata stays ordinary; refinement quality never determines rarity. */
export const normalizeItemRarity = (value: unknown): ItemRarity => {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return Object.prototype.hasOwnProperty.call(rarityAliases, key) ? rarityAliases[key]! : 'common';
};
