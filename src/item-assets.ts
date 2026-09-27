/**
 * 背包贴图注册表。
 *
 * 怪物专属怪材数量很大，网页只按最终提纯后的五类锻材归并贴图；
 * `_t2`～`_t5` 保留阶级信息，但复用同一类贴图，避免为每只怪物维护资源。
 */
export type ItemAssetInput = {
  code?: string;
  codexId?: string;
  name?: string;
  itemType?: string;
  itemCategory?: string;
};

const asset = (name: string) => `/assets/items/${name}.png`;

const refinedByCode: Record<string, string> = {
  spellcloth_bolt: 'material-spellcloth',
  tanned_spirit_leather: 'material-leather',
  bone_steel_plate: 'material-bone-steel',
  cast_shell_plate: 'material-shell',
  laminated_scale_plate: 'material-scale',
};

const rawMonsterSuffix: Record<string, string> = {
  hair: 'material-spellcloth',
  gel_skin: 'material-leather',
  bone: 'material-bone-steel',
  shell: 'material-shell',
  scale: 'material-scale',
};

/**
 * Equipment art is selected by stable item code first.  Each high-rarity item
 * has its own raster icon; the normal crafted families share one deliberately
 * simple slot illustration.  The family illustrations keep the same facing
 * for a slot (weapons go lower-left to upper-right, armor is front-facing,
 * and accessories use one fixed three-quarter angle).
 */
const equipmentByCode: Record<string, string> = {
  holy_sword_shirulu: 'equipment-artifact-holy-sword',
  demon_sword_aphia: 'equipment-artifact-demon-sword',
  saint_staff_istaria: 'equipment-artifact-saint-staff',
  death_dagger_azra: 'equipment-artifact-death-dagger',
  godfist_chronos: 'equipment-artifact-godfist',
  oracle_grimoire_sophia: 'equipment-artifact-grimoire',
  prayer_orb_lumia: 'equipment-artifact-prayer-orb-v2',
  immortal_shield_auges: 'equipment-artifact-shield',
  star_crown_selene: 'equipment-artifact-star-crown',
  sky_robe_asteia: 'equipment-artifact-sky-robe',
  wind_girdle_hermes: 'equipment-artifact-wind-girdle',
  time_greaves_chronos: 'equipment-artifact-time-greaves',
  gale_boots_sif: 'equipment-artifact-gale-boots',
  oath_necklace_norn: 'equipment-artifact-oath-necklace',
  fate_bracelet_clotho: 'equipment-artifact-fate-bracelet',
  eternal_ring_aurora: 'equipment-artifact-eternal-ring',
  dawn_sword: 'equipment-epic-dawn-sword',
  dawn_dagger: 'equipment-epic-dawn-dagger',
  dawn_knuckle: 'equipment-epic-dawn-knuckle',
  dawn_staff: 'equipment-epic-dawn-staff',
  dawn_book: 'equipment-epic-dawn-book',
  dawn_orb: 'equipment-epic-dawn-orb-v2',
  crimson_shoulder: 'equipment-epic-crimson-shoulder',
  crimson_upper: 'equipment-epic-crimson-upper',
  crimson_waist: 'equipment-epic-crimson-waist',
  crimson_lower: 'equipment-epic-crimson-lower',
  crimson_feet: 'equipment-epic-crimson-feet',
  opening_rare_sword: 'equipment-rare-opening-sword',
  opening_rare_dagger: 'equipment-rare-opening-dagger',
  opening_rare_knuckle: 'equipment-rare-opening-knuckle',
  opening_rare_staff: 'equipment-rare-opening-staff',
  opening_rare_book: 'equipment-rare-opening-book',
  opening_rare_orb: 'equipment-rare-opening-orb-v2',
  opening_rare_upper: 'equipment-rare-opening-upper',
  opening_rare_shoulder: 'equipment-rare-opening-shoulder',
  opening_rare_feet: 'equipment-rare-opening-feet',
  opening_rare_waist: 'equipment-rare-opening-waist',
  opening_rare_lower: 'equipment-rare-opening-lower',
};

const equipmentByName: Record<string, string> = {
  '圣剑·希尔露': 'equipment-artifact-holy-sword',
  '魔剑·阿菲娅': 'equipment-artifact-demon-sword',
  '圣杖·伊斯塔利亚': 'equipment-artifact-saint-staff',
  '死刺·阿兹拉': 'equipment-artifact-death-dagger',
  '天刃·克罗诺斯': 'equipment-artifact-godfist',
  '神谕·索芙拉': 'equipment-artifact-grimoire',
  '祈祷法球·露弥娅': 'equipment-artifact-prayer-orb-v2',
  '不灭圣盾·奥格斯': 'equipment-artifact-shield',
  '星冠·塞勒涅': 'equipment-artifact-star-crown',
  '天穹法衣·阿斯忒雅': 'equipment-artifact-sky-robe',
  '风行腰封·赫尔墨斯': 'equipment-artifact-wind-girdle',
  '时隙护腿·克洛诺斯': 'equipment-artifact-time-greaves',
  '逐风战靴·西芙': 'equipment-artifact-gale-boots',
  '守誓项链·诺恩': 'equipment-artifact-oath-necklace',
  '命运手镯·克洛托': 'equipment-artifact-fate-bracelet',
  '永恒戒指·奥罗拉': 'equipment-artifact-eternal-ring',
  '初晓·拾光长剑': 'equipment-epic-dawn-sword',
  '初晓·露痕短刃': 'equipment-epic-dawn-dagger',
  '初晓·轻跃拳刃': 'equipment-epic-dawn-knuckle',
  '初晓·晨枝法杖': 'equipment-epic-dawn-staff',
  '初晓·未写之页': 'equipment-epic-dawn-book',
  '初晓·掌心微日': 'equipment-epic-dawn-orb-v2',
  '猩红王冠·断角肩饰': 'equipment-epic-crimson-shoulder',
  '猩红王冠·余烬礼衣': 'equipment-epic-crimson-upper',
  '猩红王冠·王印束带': 'equipment-epic-crimson-waist',
  '猩红王冠·夜宴裙甲': 'equipment-epic-crimson-lower',
  '猩红王冠·归火短靴': 'equipment-epic-crimson-feet',
  '初行·长剑': 'equipment-rare-opening-sword',
  '初行·匕首': 'equipment-rare-opening-dagger',
  '初行·拳刃': 'equipment-rare-opening-knuckle',
  '初行·法杖': 'equipment-rare-opening-staff',
  '初行·法书': 'equipment-rare-opening-book',
  '初行·法球': 'equipment-rare-opening-orb-v2',
  '初行·上装': 'equipment-rare-opening-upper',
  '初行·头肩': 'equipment-rare-opening-shoulder',
  '初行·脚部': 'equipment-rare-opening-feet',
  '初行·腰部': 'equipment-rare-opening-waist',
  '初行·下装': 'equipment-rare-opening-lower',
};

const equipmentFamilyAsset = (code: string, text: string): string | undefined => {
  if (equipmentByCode[code]) return equipmentByCode[code];
  const named = Object.entries(equipmentByName).find(([name]) => text.includes(name));
  if (named) return named[1];

  if (/防具/.test(text)) return 'equipment-crafted-upper';
  if (/首饰/.test(text)) return 'equipment-crafted-ring';
  if (/武器/.test(text)) return 'equipment-crafted-longsword';

  // Stable code families cover the shop, opening and new-world equipment.
  if (/(?:^|_)(?:longsword|sword)(?:_|$)|长剑/.test(code) || /长剑/.test(text)) return 'equipment-crafted-longsword';
  if (/(?:^|_)(?:dagger)(?:_|$)|匕首|短刃/.test(code) || /匕首|短刃/.test(text)) return 'equipment-crafted-dagger';
  if (/(?:^|_)(?:fistblade|knuckle)(?:_|$)|拳刃/.test(code) || /拳刃/.test(text)) return 'equipment-crafted-fistblade';
  if (/(?:^|_)(?:staff)(?:_|$)|法杖|短杖/.test(code) || /法杖|短杖/.test(text)) return 'equipment-crafted-staff';
  if (/(?:^|_)(?:spellbook|book)(?:_|$)|法书/.test(code) || /法书/.test(text)) return 'equipment-crafted-spellbook';
  if (/(?:^|_)(?:orb)(?:_|$)|法球/.test(code) || /法球/.test(text)) return 'equipment-crafted-orb-v2';
  if (/(?:^|_)(?:shield)(?:_|$)|盾牌/.test(code) || /盾牌/.test(text)) return 'equipment-crafted-shield';
  if (/(?:^|_)(?:bow|crossbow|bow_crossbow)(?:_|$)|弓弩|弓|弩/.test(code) || /弓弩|弓|弩/.test(text)) return 'equipment-crafted-bow';
  if (/(?:^|_)(?:gun)(?:_|$)|枪炮/.test(code) || /枪炮/.test(text)) return 'equipment-crafted-dagger';
  if (/(?:^|_)(?:shoulder)(?:_|$)|头肩|头盔|头冠|帽|盔|护肩|兜帽/.test(code) || /头肩|头盔|头冠|帽|盔|护肩|兜帽/.test(text)) return 'equipment-crafted-shoulder';
  if (/(?:^|_)upper(?:_|$)|上装|胸甲|胸衣|长衣|衣|袍/.test(code) || /上装|胸甲|胸衣|长衣|衣|袍/.test(text)) return 'equipment-crafted-upper';
  if (/(?:^|_)waist(?:_|$)|腰部|腰封|束腰|束带|腰甲/.test(code) || /腰部|腰封|束腰|束带|腰甲/.test(text)) return 'equipment-crafted-waist';
  if (/(?:^|_)lower(?:_|$)|下装|腿铠|护腿|护裤|裙甲|长裤/.test(code) || /下装|腿铠|护腿|护裤|裙甲|长裤/.test(text)) return 'equipment-crafted-lower';
  if (/(?:^|_)feet(?:_|$)|脚部|战靴|皮靴|短靴|轻履|护胫/.test(code) || /脚部|战靴|皮靴|短靴|轻履|护胫/.test(text)) return 'equipment-crafted-feet';
  if (/项链|护符|耳环|吊坠/.test(text)) return 'equipment-crafted-necklace';
  if (/手镯|护腕|护臂/.test(text)) return 'equipment-crafted-bracelet';
  if (/戒指|戒|环/.test(text)) return 'equipment-crafted-ring';
  if (code === 'opening_clothes' || /普通旅衣/.test(text)) return 'equipment-crafted-upper';
  return undefined;
};

/**
 * Potion artwork is grouped by effect, while achievement-box rewards keep a
 * one-to-one illustration.  Keep this table separate from the generic item
 * catalogue so a map, card, or quest item can never fall through to a bottle.
 */
const achievementPotionByCode: Record<string, string> = {
  rare_charm: 'potion-achievement-rare-charm',
  rare_glass: 'potion-achievement-rare-glass',
  rare_thunder: 'potion-achievement-rare-thunder',
  astral_dew: 'potion-achievement-astral-dew',
  rebirth_ember: 'potion-achievement-rebirth-ember',
  skybreak_seal: 'potion-achievement-skybreak-seal',
  worldtree_aegis: 'potion-achievement-worldtree-aegis',
  allspirit_elixir: 'potion-achievement-allspirit-elixir',
  eternal_aegis: 'potion-achievement-eternal-aegis',
  heavenly_decree: 'potion-achievement-heavenly-decree',
  immortal_plume: 'potion-achievement-immortal-plume',
};

const potionAssetFor = (code: string, text: string, type: string): string | undefined => {
  const achievementAsset = achievementPotionByCode[code];
  if (achievementAsset) return asset(achievementAsset);

  // Only potion-like records use the four common glass-bottle illustrations.
  // Plain water, food, maps, and unrelated consumables keep their own catalog
  // art (the intentionally narrow matcher avoids turning mineral water into a
  // health potion).
  // A skill-reset elixir is a utility item with its own catalogue art; it is
  // deliberately excluded from the common potion families below.
  if (code === 'alchemy_skill_reset_elixir') return undefined;
  const potionLike = type === 'consumable' && /药剂|药水|秘药|药膏|药|药露|圣露|液|剂|瓶|滴剂|酊|符咒|投掷物/.test(text);
  if (!potionLike) return undefined;

  if (/(?:^|_)(?:life|regrowth|emergency|last_life|rescue|rebirth|hp|healing)(?:_|$)/.test(code)
    || /回血|复苏|回春|生命|救急|续生|回复|治愈|愈|生机/.test(text)) {
    return asset('potion-common-life');
  }

  if (/(?:^|_)(?:mana|manaflow|mana_spring|blood_mana|mp)(?:_|$)/.test(code)
    || /回魔|魔力|法力|魔露|魔泉|蓝|灵能/.test(text)) {
    return asset('potion-common-mana');
  }

  // Enemy-targeted throws and negative statuses use the toxic green bottle.
  if (/(?:antiheal|lure|oil|frost|frost_crack|chain|steal_light|echo_damage|chaos|defer|daze|confusion|fire|acid|shock|thunder|bind|burn|exposed|imbalance|stun)/.test(code)
    || /减益|敌|毒|腐蚀|冰缚|霜裂|雷|震荡|混乱|迷乱|苦胆|剥离|引敌|燃烧|爆炎|天罚|束缚|眩晕|灼烧|投掷物/.test(text)) {
    return asset('potion-common-debuff');
  }

  if (/(?:ward|fury|swift|clarity|focus|evasion|crit|sharpening|guard|wind_charge|quick_chant|berserk|thorns|shed|reflect|resistance|overflow|clean_shield|harmony|regeneration|mana_flow|study|gather|experience|drop)/.test(code)
    || /增益|护体|守护|战意|风行|锐化|明眸|轻灵|静心|狂战|反刺|护心|抗性|调和|蓄势|速咏|护佑|清浊|再生|坚壳|迅行|阅历|寻获|经验|掉率/.test(text)) {
    return asset('potion-common-buff');
  }

  // A remaining item explicitly classified as a potion is still represented
  // by the common glass style instead of the legacy generic bottle.
  return asset('potion-common-life');
};

const catalogAssetFor = (code: string, type: string): string | undefined => {
  if (!code || type === 'equipment' || code === 'all' || code.startsWith('map_') || code.startsWith('monster_') || code.startsWith('raw_')) return undefined;
  if (code.startsWith('beast_core') || code.startsWith('meat_chunk')) return undefined;
  if (['magic_thread', 'magic_leather', 'magic_carbon_plate', 'magic_hard_shell', 'magic_scale_armor', 'spellcloth_bolt', 'tanned_spirit_leather', 'bone_steel_plate', 'cast_shell_plate', 'laminated_scale_plate'].includes(code)) return undefined;
  return asset(`catalog/${code}`);
};

/** Returns a stable PNG path for every item the inventory can display. */
export const itemAssetFor = (input: ItemAssetInput): string => {
  const code = String(input.code ?? '').trim().toLowerCase();
  const codex = String(input.codexId ?? '').trim().toLowerCase();
  const text = `${input.name ?? ''} ${input.itemCategory ?? ''}`.toLowerCase();
  const type = String(input.itemType ?? '').toLowerCase();

  // Resolve non-equipment identities before equipment-name heuristics.  Map
  // names such as “世界树草原环带” contain the character “环”, which would
  // otherwise be mistaken for a ring by the generic equipment matcher.
  if (/地图|卷轴|地图册/.test(text) || code.startsWith('map_')) return asset('map-scroll');
  if (/怪物卡片|卡片/.test(text) || code.includes('monster_card')) return asset('monster-card');
  if (/任务|徽章|令牌|勋章/.test(text)) return asset('quest-token');

  const equipmentAsset = equipmentFamilyAsset(code, text);
  if (equipmentAsset && (type === 'equipment' || /装备|武器|剑|刀|匕首|弓|杖|枪|斧|锤|刃|甲|铠|胸|衣|袍|护腕|护臂|护肩|披风|头盔|头冠|帽|盔|鞋|靴|足具|戒|环|项链|护符|耳环|饰品|吊坠/.test(text))) {
    return asset(equipmentAsset);
  }

  const potionAsset = potionAssetFor(code, text, type);
  if (potionAsset) return potionAsset;

  const catalogAsset = catalogAssetFor(code, type);
  if (catalogAsset) return catalogAsset;

  if (code === 'all' || /全部|所有物品/.test(text)) return asset('material-magic-shard');
  if (code === 'beast_core' || /兽核|野性魔力/.test(text)) return asset('material-beast-core');
  if (/^beast_core_lv\d+$/.test(code)) return asset('material-beast-core');
  if (code === 'meat_chunk' || /新鲜肉块|肉块|肉类/.test(text)) return asset('material-meat');
  if (/^meat_chunk_lv\d+$/.test(code)) return asset('material-meat');

  const legacyPurified: Record<string, string> = {
    magic_thread: 'material-spellcloth',
    magic_leather: 'material-leather',
    magic_carbon_plate: 'material-bone-steel',
    magic_hard_shell: 'material-shell',
    magic_scale_armor: 'material-scale',
  };
  for (const [legacy, path] of Object.entries(legacyPurified)) {
    if (code === legacy || code.startsWith(`${legacy}_lv`)) return asset(path);
  }

  for (const [base, path] of Object.entries(refinedByCode)) {
    if (code === base || code.startsWith(`${base}_t`) || codex === base) return asset(path);
  }
  const raw = code.match(/^monster_.+_(hair|gel_skin|bone|shell|scale)(?:_l\d+)?$/);
  if (raw) return asset(rawMonsterSuffix[raw[1]]);
  if (/灵麻布|灵纺|灵纹|秘帛|天绫|布料|毛|绒|羽/.test(text)) return asset('material-spellcloth');
  if (/鞣皮|灵革|魔革|战革|龙革|皮革|皮|革/.test(text)) return asset('material-leather');
  if (/骨钢|骨头|骨片|骨|轻质骨|精锻骨/.test(text)) return asset('material-bone-steel');
  if (/甲壳|铸纹甲|玄壳|甲片|硬甲|壳/.test(text)) return asset('material-shell');
  if (/鳞甲|叠锻鳞|鳞片|鳞/.test(text)) return asset('material-scale');

  if (type === 'equipment' || type === 'device' || /装备|武器|剑|刀|匕首|弓|杖|枪|斧|锤|刃/.test(text)) return asset('equipment-crafted-longsword');
  if (type === 'consumable' || /道具|药|水|血瓶|魔瓶|药剂/.test(text)) {
    if (/食|果|肉|面包|料理|点心/.test(text)) return asset('food-bread');
    if (/魔|蓝|法力/.test(text)) return asset('potion-common-mana');
    if (/体力|耐力|绿/.test(text)) return asset('potion-common-buff');
    if (/宝箱|箱/.test(text)) return asset('chest');
    return asset('potion-common-life');
  }
  if (/晶|矿|石|宝石|琥珀|水晶/.test(text)) return asset('material-crystal');
  if (/木|枝|树|藤|纤维|木材/.test(text)) return asset('material-wood');
  if (/草|花|叶|种子|药草|蘑菇/.test(text)) return asset('material-herb');
  if (/魔|暗|碎片|精华|结晶/.test(text)) return asset('material-magic-shard');
  if (/稀有锻材|区域锻材|锻材|炼材|材料|怪材/.test(text)) return asset('material-magic-shard');
  return asset('material-magic-shard');
};

export const refinedMaterialAssetByBaseCode = refinedByCode;
