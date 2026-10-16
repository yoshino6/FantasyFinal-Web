import type { ExploreLocalMap, Panel, PanelNearbyPoint } from './api';
import { ANIME_SCENES } from './anime-assets';
import { portraitAssetCandidates } from './character-assets';
import { COMMON_ASSET_PATHS } from './common-asset-paths';
import { mapAvatarAtlas, mapTargetArt, terrainForRegion } from './exploration-assets';
import { GAME_UI_GEAR_ATLAS, GAME_UI_ITEM_ATLAS } from './game-ui-item-icons';
import { itemAssetFor, type ItemAssetInput } from './item-assets';
import { ENVIRONMENT_ATLAS, environmentDirectionalSprite, environmentSingleSprite } from './map-environment';
import { SURFACE_ATLASES, SURFACE_FOOTPRINT_ASSET, SURFACE_GROUND_MATERIAL } from './map-surface';
import { professionIconUrl, resolveProfessionIconCode } from './profession-icons';
import { skillArtwork } from './skill-art';
import { storyImageUrl } from './story-assets';

/** Paths are unversioned; the downloader adds the current manifest hash. */
export type PlayerAssetPlan = {
  opening: string[];
  background: string[];
  shell: string[];
  character: string[];
  inventory: string[];
  exploration: string[];
  battle: string[];
  paths: string[];
};

const pathOnly = (url?: string | null): string => {
  const path = url?.split(/[?#]/, 1)[0] ?? '';
  return path.startsWith('/assets/') ? path : '';
};

const add = (paths: Set<string>, url?: string | null): void => {
  const path = pathOnly(url);
  if (path) paths.add(path);
};

// InventoryItemIcon paints these two families from its fallback atlas instead
// of requesting the item-specific PNG returned by itemAssetFor.
const usesDrawnObject = (item: ItemAssetInput): boolean => {
  if (item.itemType === 'skill_book') return false;
  const text = `${item.name ?? ''} ${item.itemCategory ?? ''}`.toLowerCase();
  return /家具|木床|书桌|储物箱/.test(text) || /针剂|evolution_injection/.test(`${text} ${item.code ?? ''}`);
};

/** Public controls shared by authenticated screens can warm up before login. */
export function createCommonAssetPaths(): string[] {
  return [...COMMON_ASSET_PATHS];
}

/** Select only assets for this account and its current observed map window. */
export function createPlayerAssetPlan(panel: Panel, localMap?: ExploreLocalMap): PlayerAssetPlan {
  const shell = new Set(createCommonAssetPaths());
  const character = new Set<string>();
  const inventory = new Set<string>();
  const exploration = new Set<string>();
  const battle = new Set<string>();
  const inBattle = panel.inBattle === true && Boolean(panel.battle);
  const inStory = !inBattle && panel.account?.hasCharacter === false;

  // Only the account's current story joins the shared public controls.
  // Future chapters remain demand-loaded.
  for (const message of panel.pendingStory?.messages ?? []) add(shell, storyImageUrl(message.storyImage));

  // A newly registered account shows its story rather than a character/map.
  const summary = panel.summary;
  if (summary && panel.account?.hasCharacter !== false) {
    const portrait = summary.portrait;
    add(character, portraitAssetCandidates(portrait)[0]);
    add(character, portraitAssetCandidates(portrait, 'profile')[0]);
    add(character, portraitAssetCandidates(portrait, 'equipment')[0]);
    add(character, professionIconUrl(resolveProfessionIconCode(undefined, summary.profession)));
    add(character, GAME_UI_GEAR_ATLAS);
    add(character, '/assets/light-anime/skills-imagegen-v2/__fallback.png');
    for (const skill of panel.skills?.skills ?? []) add(character, skillArtwork(skill.code, skill.name)?.src);

    const addItem = (item: ItemAssetInput): void => {
      if (usesDrawnObject(item)) add(inventory, GAME_UI_ITEM_ATLAS);
      else add(inventory, itemAssetFor(item));
    };
    for (const item of panel.inventory?.stacked ?? []) addItem(item);
    for (const item of panel.inventory?.instances ?? []) addItem({ ...item, codexId: item.definitionCodexId });
    for (const item of summary.equipment ?? panel.equipment ?? []) addItem({ ...item, codexId: item.codexId ?? undefined });

    if (!inBattle && !inStory) {
      // This is the initial explore screen. Local-map cells refine current
      // terrain/objects; other regions and all undiscovered art stay on demand.
      const position = localMap?.origin ?? summary.position;
      const currentCell = localMap?.cells.find(cell => cell.x === position?.x && cell.y === position?.y
        && (cell.z ?? position?.z ?? 0) === (position?.z ?? 0));
      const currentRegionCode = currentCell?.regionCode
        ?? panel.regionMap?.currentRegionCode
        ?? panel.mapData?.maps.find(region => region.isCurrent)?.code;
      const currentRegionName = panel.mapData?.current?.name ?? summary.region;
      add(exploration, terrainForRegion(currentRegionCode, currentRegionName));
      for (const path of [
        '/assets/light-anime/explore-v1/explore-stat-frame.svg',
        '/assets/light-anime/explore-v1/explore-paper-frame.svg',
        '/assets/light-anime/explore-v1/explore-wood-ribbon.svg',
        '/assets/light-anime/explore-v1/explore-button-teal.svg',
      ]) add(exploration, path);
      add(exploration, mapAvatarAtlas(portrait).src || portraitAssetCandidates(portrait)[0]);
      add(exploration, SURFACE_GROUND_MATERIAL);
      add(exploration, SURFACE_FOOTPRINT_ASSET);
      // The current renderer requests all eight small map atlases at mount.
      for (const atlas of SURFACE_ATLASES) add(exploration, atlas);

      const observedCells = localMap && new Set(localMap.cells.map(cell =>
        `${cell.x}:${cell.y}:${cell.z ?? localMap.origin.z}`));
      const addPoint = (point: PanelNearbyPoint): void => {
        if (position && (point.z ?? position.z) !== position.z) return;
        if (point.portrait) add(exploration, mapAvatarAtlas(point.portrait).src || mapTargetArt({ type: '玩家' }).src);
        else add(exploration, mapTargetArt(point).src);
      };
      // App's ordinary map reads panel.nearby directly, including while the
      // local-map response is pending. Do not filter its points by local cells.
      for (const point of panel.nearby?.points ?? []) addPoint(point);
      for (const point of localMap?.nearby?.points ?? []) {
        if (observedCells?.has(`${point.x}:${point.y}:${point.z ?? localMap!.origin.z}`)) addPoint(point);
      }
      for (const object of localMap?.environment ?? []) {
        const sprite = environmentDirectionalSprite(object.assetKey, object)
          ?? environmentSingleSprite(object.assetKey);
        add(exploration, sprite?.assetPath ?? ENVIRONMENT_ATLAS);
      }
    }
    if (inBattle && panel.battle) {
      // The battle panel paints the current player's portrait immediately.
      add(battle, portraitAssetCandidates(portrait)[0]);
      add(battle, mapTargetArt({ type: 'member' }).src);
      add(battle, ANIME_SCENES.forest);
      add(battle, '/assets/light-anime/game-ui-v2/panel-parchment.webp');
      add(battle, '/assets/light-anime/game-ui-v2/button-paper.webp');
      add(battle, '/assets/light-anime/skills-imagegen-v2/__fallback.png');
      add(battle, skillArtwork('basic_slash')?.src);
      for (const skill of panel.battle.quickSkills ?? []) add(battle, skillArtwork(skill.code, skill.name)?.src);
      for (const skill of panel.battle.advancedSkills ?? []) add(battle, skillArtwork(skill.code, skill.name)?.src);
      for (const device of panel.battle.deviceSlots ?? []) {
        for (const skill of device.skills) add(battle, skillArtwork(skill.code, skill.name)?.src);
      }
      for (const target of panel.battle.targets ?? []) add(battle, mapTargetArt({
        type: panel.battle.mode === 'pvp' || panel.battle.mode === 'spar' ? '玩家' : '怪物',
        name: target.name
      }).src);
    }
  }

  const opening = [...new Set([...shell, ...(inBattle ? battle : inStory ? [] : exploration)])];
  const background = [...new Set([...character, ...inventory])].filter(path => !opening.includes(path));
  return { opening, background, shell: [...shell], character: [...character], inventory: [...inventory],
    exploration: [...exploration], battle: [...battle], paths: [...opening, ...background] };
}
