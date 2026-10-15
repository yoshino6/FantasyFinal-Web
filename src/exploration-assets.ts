import type {PanelPortrait} from './api';
import {gameAssetUrl} from './game-assets';
import {EXPLORATION_TERRAIN_KEYS,EXPLORATION_TARGET_KEYS,EXPLORATION_AVATAR_KEYS,EXPLORATION_AVATAR_NATIVE_LEFT_FRAMES} from './exploration-art-manifest';
import {BUILDING_ART_BY_CODE,MONSTER_ART_BY_TEMPLATE,MONSTER_ART_BY_NAME} from './exploration-target-mapping';
import {EXPLORATION_TARGET_BOUNDS,EXPLORATION_AVATAR_IDLE_BOUNDS} from './exploration-sprite-bounds';
import resourceSpriteBounds from './map-resource-sprite-bounds.json';
import targetProjectionBounds from './map-target-projection-bounds.json';
const root='/assets/light-anime/exploration-v1';
const resourceRoot='/assets/light-anime/map-surface-v2';
const resourceOverrides:Record<string,string>={plant_mushroom:'/assets/light-anime/map-surface-v3/plant-mushroom-overhead-v1.png'};
const resourceKeys=new Set(['ore_iron','ore_crystal','plant_herb','plant_mushroom','plant_tree']);
const regions:Record<string,string>={"世界树":"world_tree","幽暗密林":"dark_forest","幽暗密林深处":"dark_forest_deep","地下迷宫":"dark_forest_dungeon","百纳镇":"baina_town","首领测试场":"boss_test_arena","永恒竞技场":"eternal_arena","世界树草原环带":"worldtree_meadow","晨露河岸":"morningdew_riverbank","砾风石滩":"gravelwind_shore","岩脊山麓":"ridge_foothills","赤铁山道":"rediron_pass","雾藻湿地":"mistalgae_marsh","沉星沼泽":"fallenstar_swamp","霜冠高原":"frostcrown_plateau","雷鸣断崖":"thundercliff","月蚀遗迹":"eclipse_ruins","浮叶镇":"floating_leaf_town","霜龙客舍":"frost_dragon_inn"};
export function terrainForRegion(code?:string,name?:string):string {
 const key=code&&EXPLORATION_TERRAIN_KEYS.includes(code)?code:regions[name??''];
 return gameAssetUrl(root+'/terrain/'+(key&&EXPLORATION_TERRAIN_KEYS.includes(key)?key:'world_tree')+'.webp');
}
export type MapArtPoint={type?:string;name?:string;code?:string;templateCode?:string;portrait?:PanelPortrait;siteType?:string};
export function monsterArtKey(template?:string,name=''):string {
 if(template&&MONSTER_ART_BY_TEMPLATE[template])return MONSTER_ART_BY_TEMPLATE[template];
 return MONSTER_ART_BY_NAME[name.trim()]??'monster_unknown';
}
function buildingArt(point:MapArtPoint):string {
 const code=point.code??'';
 if(BUILDING_ART_BY_CODE[code])return BUILDING_ART_BY_CODE[code];
 const t=code+' '+(point.name??'')+' '+(point.siteType??'');
 if(/guild|公会|会馆|civic_hall|议事/i.test(t))return 'building_guild';
 if(/church|教堂|shrine|祭坛/i.test(t))return 'building_church';
 if(/forge|blacksmith|铁匠|锻造|mining_station/i.test(t))return 'building_forge';
 if(/alchemy|sweetshop|糖水|药剂|laboratory|研究室/i.test(t))return 'building_alchemy';
 if(/workshop|工坊/i.test(t))return 'building_workshop';
 if(/library|bookshop|archive|书屋|图书|档案/i.test(t))return 'building_library';
 if(/gate|界门|传送/i.test(t))return 'building_gate';
 if(/arena|竞技|试炼/i.test(t))return 'building_arena';
 if(/bank|银行/i.test(t))return 'building_bank';
 if(/market|exchange|集市|联市|商铺/i.test(t))return 'building_market';
 if(/inn|rest_stop|客舍|驿舍|旅馆/i.test(t))return 'building_inn';
 if(/lodge|camp|shelter|watchpost|猎户|营地|哨/i.test(t))return 'building_lodge';
 if(/observatory|lighthouse|观景|观测|灯塔/i.test(t))return 'landmark_observatory';
 return 'building_house';
}
export function mapTargetArt(point:MapArtPoint):{src:string;idle:boolean;key:string} {
 const type=point.type??'',code=point.code??'',name=point.name??'';
 let key='landmark';
 if(type==='怪物')key=monsterArtKey(point.templateCode,name);
 else if(type==='玩家'||type==='member')key='player_unknown';
 else if(type==='域民'||type==='NPC')key=code==='pear_guide'?'npc_pear':code==='tree_keeper'?'npc_keeper':'npc_traveler';
 else if(type==='矿脉')key=/crystal|gem|晶|宝石/i.test(code+' '+name)?'ore_crystal':'ore_iron';
 else if(type==='植被'||type==='资源')key=/wood|timber|tree|木材|树木/i.test(code+' '+name)?'plant_tree':/mushroom|fungus|蘑菇|菌/i.test(code+' '+name)?'plant_mushroom':'plant_herb';
 else if(type==='地下入口'||type==='入口')key='dungeon_entrance';
 else if(type==='悬赏'||type==='bounty')key='bounty';
 else if(type==='建筑'||type==='building')key=buildingArt(point);
 else if(type==='地标'||type==='landmark'){
   const t=code+' '+name;
   key=/altar|祭坛/i.test(t)?'landmark_altar':/bridge|桥/i.test(t)?'landmark_bridge':/observatory|观风|观景/i.test(t)?'landmark_observatory':/stone|memorial|碑|雾石/i.test(t)?'landmark_stone':/market|集市/i.test(t)?'building_market':/dungeon|地下.*入口|迷宫.*入口/i.test(t)?'dungeon_entrance':'landmark';
 }
 const released=EXPLORATION_TARGET_KEYS.includes(key)?key:EXPLORATION_TARGET_KEYS.includes('monster_unknown')&&type==='怪物'?'monster_unknown':'';
  const projection=(targetProjectionBounds as Record<string,{assetPath:string}>)[released];
  return {key,src:released?gameAssetUrl(projection?.assetPath??resourceOverrides[released]??(resourceKeys.has(released)?resourceRoot+'/'+released+'.webp':root+'/targets/'+released+'.webp')):'',idle:type==='怪物'};
}
export function mapAvatarAtlas(portrait?:PanelPortrait):{src:string;key:string;columns:number;rows:number;frames:number;idleFrame:number;runFrames:readonly number[];nativeLeftFrames:readonly number[]} {
 const preferred=portrait?.baseKey??'';
 const key=EXPLORATION_AVATAR_KEYS.includes(preferred)?preferred:portrait?.fallbackKey&&EXPLORATION_AVATAR_KEYS.includes(portrait.fallbackKey)?portrait.fallbackKey:'';
 return {key,src:key?gameAssetUrl(root+'/avatars/'+key+'.webp'):'',columns:4,rows:2,frames:8,idleFrame:0,runFrames:[1,2,3,4,5,6],nativeLeftFrames:EXPLORATION_AVATAR_NATIVE_LEFT_FRAMES[key]??[]};
}

/** Ore's bottom 25% is its ground base: anchor its centre, 12.5% from the
    painted bottom. Transparent export margins do not shift the ground point. */
export function mapTargetSpriteStyle(point:MapArtPoint,groundBase=false):{width:string;height:string;left:string;bottom:string} {
 const key=mapTargetArt(point).key;
  const bounds=(targetProjectionBounds as Record<string,{width:number;height:number;left:number;top:number;right:number;bottom:number}>)[key]??(resourceSpriteBounds as Record<string,{width:number;height:number;left:number;top:number;right:number;bottom:number}>)[key]??EXPLORATION_TARGET_BOUNDS[key];
 if(!bounds)return {width:'100%',height:'100%',left:'0',bottom:'0'};
 const scale=Math.min(1/(bounds.right-bounds.left+1),1.25/(bounds.bottom-bounds.top+1));
 const anchorX=(bounds.left+bounds.right+1)/2;
 const anchorY=groundBase?bounds.bottom+1-(bounds.bottom-bounds.top+1)*.125:bounds.bottom+1;
 return {
  width:`calc(var(--map-avatar-size) * ${bounds.width*scale})`,
  height:`calc(var(--map-avatar-size) * ${bounds.height*scale})`,
  left:`calc(50% - var(--map-avatar-size) * ${anchorX*scale})`,
  bottom:`calc(var(--map-avatar-size) * ${-(bounds.height-anchorY)*scale})`
 };
}

/** Use one stable idle baseline for every animation frame; do not resize gait frames. */
export function mapAvatarGroundPadding(portrait?:PanelPortrait):number {
 const bounds=EXPLORATION_AVATAR_IDLE_BOUNDS[mapAvatarAtlas(portrait).key];
 return bounds?(bounds.height-bounds.bottom-1)/bounds.height:0;
}
