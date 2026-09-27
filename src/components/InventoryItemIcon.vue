<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { itemAssetFor } from '../item-assets';

type IconKind = 'all' | 'weapon' | 'armor' | 'accessory' | 'helmet' | 'boots' | 'map' | 'card' | 'quest' | 'potion' | 'food' | 'crystal' | 'wood' | 'herb' | 'hide' | 'material';

const props = withDefaults(defineProps<{
  name?: string;
  code?: string;
  codexId?: string;
  itemType?: string;
  itemCategory?: string;
  instance?: boolean;
}>(), {
  name: '',
  code: '',
  codexId: '',
  itemType: '',
  itemCategory: '',
  instance: false,
});

const kind = computed<IconKind>(() => {
  const text = `${props.name} ${props.itemCategory}`.toLowerCase();
  if (/全部|所有/.test(text)) return 'all';
  if (props.instance || props.itemType === 'equipment' || /装备|武器|剑|刀|匕首|弓|杖|枪|斧|锤|刃/.test(text)) {
    if (/防具/.test(text)) return 'armor';
    if (/首饰/.test(text)) return 'accessory';
    if (/武器/.test(text)) return 'weapon';
    if (/头盔|头冠|帽|盔/.test(text)) return 'helmet';
    if (/鞋|靴|足具/.test(text)) return 'boots';
    if (/戒|环|项链|护符|耳环|饰品|吊坠/.test(text)) return 'accessory';
    if (/甲|铠|胸|衣|袍|护腕|护臂|护肩|披风/.test(text)) return 'armor';
    return 'weapon';
  }
  if (/地图|卷轴|地图册/.test(text) || props.code.toLowerCase().startsWith('map_')) return 'map';
  if (/怪物卡片|卡片/.test(text) || props.code.toLowerCase().includes('monster_card')) return 'card';
  if (/任务|徽章|令牌|勋章/.test(text)) return 'quest';
  if (props.itemType === 'consumable' || /道具|药|水| potion|血瓶|魔瓶/.test(text)) {
    return /食|果|肉|面包|料理|点心/.test(text) ? 'food' : 'potion';
  }
  if (/晶|矿|石|宝石|琥珀|水晶/.test(text)) return 'crystal';
  if (/木|枝|树|藤|纤维|木材/.test(text)) return 'wood';
  if (/草|花|叶|种子|药草|蘑菇/.test(text)) return 'herb';
  if (/皮|毛|羽|鳞|骨/.test(text)) return 'hide';
  return 'material';
});
const assetSrc = computed(() => itemAssetFor({ code: props.code, codexId: props.codexId, name: props.name, itemType: props.itemType, itemCategory: props.itemCategory }));
const imageFailed = ref(false);
watch(assetSrc, () => { imageFailed.value = false; });
</script>

<template>
  <span class="inventory-art-wrap" :class="`inventory-art-${kind}`" aria-hidden="true">
    <img v-if="!imageFailed" class="inventory-item-image" :src="assetSrc" alt="" loading="lazy" @error="imageFailed = true" />
    <svg v-else class="inventory-art" viewBox="0 0 64 64" focusable="false">
      <!-- 分类：四个小徽记表示背包总览。 -->
      <template v-if="kind === 'all'">
        <circle cx="20" cy="20" r="10" fill="currentColor" opacity=".88"/>
        <circle cx="44" cy="20" r="10" fill="#c18d63" opacity=".88"/>
        <circle cx="20" cy="44" r="10" fill="#7188b5" opacity=".88"/>
        <circle cx="44" cy="44" r="10" fill="#6a9b78" opacity=".88"/>
        <path d="M25 25 39 39M39 25 25 39" stroke="#fff8e8" stroke-width="3" opacity=".8"/>
      </template>
      <!-- 装备：以大色块和轮廓表达部位，缩小后仍能辨识。 -->
      <template v-else-if="kind === 'weapon'">
        <path d="M16 48 43 13l7 7-28 34-9-2Z" fill="currentColor" opacity=".25"/>
        <path d="m19 51 27-34 4 4-28 34-7-2 4-2Z" fill="currentColor"/>
        <path d="m12 50 8-8 6 6-8 8Z" fill="#6d506b"/>
        <path d="m9 55 12-12 3 3-12 12Z" fill="#e7af6f"/>
        <path d="m39 17 6-7 8 8-6 7Z" fill="#fff8e9" opacity=".9"/>
      </template>
      <template v-else-if="kind === 'armor'">
        <path d="M17 14 28 9h8l11 5 5 11-8 4-3-7v26H23V32l-8-7Z" fill="currentColor" opacity=".86"/>
        <path d="M23 20h18v29H23Z" fill="#fff8e8" opacity=".28"/>
        <path d="M28 10v12m8-12v12M23 30h18" stroke="#fff8e8" stroke-width="2" opacity=".6"/>
        <path d="m17 14-7 8 8 8 5-6m24-10 7 8-8 8-5-6" fill="currentColor" opacity=".65"/>
      </template>
      <template v-else-if="kind === 'helmet'">
        <path d="M13 42V30c0-12 8-20 19-20s19 8 19 20v12Z" fill="currentColor" opacity=".86"/>
        <path d="M9 42h46v8H9Z" fill="#fff8e8" opacity=".8"/>
        <path d="M26 17h12v10H26Z" fill="#fff8e8" opacity=".35"/>
        <path d="m29 10-2-6 6 4 4-4-1 7" fill="#e6b271"/>
      </template>
      <template v-else-if="kind === 'boots'">
        <path d="M22 10h15v25l15 8c3 2 3 7-1 9H14c-4 0-6-5-3-8l11-9Z" fill="currentColor" opacity=".86"/>
        <path d="M22 13h15v6H22Zm0 10h15v6H22Z" fill="#fff8e8" opacity=".35"/>
        <path d="M13 48h37" stroke="#fff8e8" stroke-width="3" opacity=".7"/>
      </template>
      <template v-else-if="kind === 'accessory'">
        <circle cx="32" cy="32" r="20" fill="none" stroke="currentColor" stroke-width="7" opacity=".82"/>
        <circle cx="32" cy="32" r="9" fill="#fff8e8" opacity=".8"/>
        <path d="m32 6 4 8-4 5-4-5Z" fill="#e7af6f"/>
      </template>
      <template v-else-if="kind === 'map'">
        <path d="M10 15 25 10l14 5 15-5v39l-15 5-14-5-15 5Z" fill="currentColor" opacity=".84"/>
        <path d="M25 10v39m14-34v35" stroke="#fff8e8" stroke-width="2.5" opacity=".78"/>
        <path d="m17 28 8-6 8 5 9-8" fill="none" stroke="#fff8e8" stroke-width="2.5" opacity=".85"/>
        <circle cx="43" cy="20" r="3" fill="#e7af6f"/>
      </template>
      <template v-else-if="kind === 'card'">
        <rect x="15" y="9" width="34" height="46" rx="4" fill="currentColor" opacity=".84"/>
        <rect x="20" y="14" width="24" height="22" rx="2" fill="#fff8e8" opacity=".62"/>
        <path d="m32 18 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z" fill="currentColor" opacity=".78"/>
        <path d="M22 43h20M25 48h14" stroke="#fff8e8" stroke-width="2" opacity=".72"/>
      </template>
      <template v-else-if="kind === 'quest'">
        <path d="M17 12h30v40H17Z" fill="currentColor" opacity=".84"/>
        <path d="M22 19h20M22 27h20M22 35h13" stroke="#fff8e8" stroke-width="3" opacity=".76"/>
        <circle cx="40" cy="44" r="7" fill="#e7af6f"/>
        <path d="m37 44 2 2 4-5" fill="none" stroke="#fff8e8" stroke-width="2"/>
      </template>
      <!-- 道具与材料：使用明确的剪影，数量文字由格子本身承载。 -->
      <template v-else-if="kind === 'potion'">
        <path d="M25 10h14v9l7 8v20c0 5-4 8-14 8s-14-3-14-8V27l7-8Z" fill="currentColor" opacity=".86"/>
        <path d="M25 10h14v7H25Z" fill="#fff8e8" opacity=".85"/>
        <path d="M20 31h24v12H20Z" fill="#fff8e8" opacity=".28"/>
        <path d="M25 22h14" stroke="#fff8e8" stroke-width="2" opacity=".7"/>
      </template>
      <template v-else-if="kind === 'food'">
        <path d="M13 38c0-13 8-22 19-22s19 9 19 22c0 8-7 13-19 13s-19-5-19-13Z" fill="currentColor" opacity=".86"/>
        <path d="m19 34 7-6 6 5 6-6 8 8" fill="none" stroke="#fff8e8" stroke-width="3" opacity=".8"/>
        <circle cx="24" cy="42" r="2" fill="#fff8e8"/><circle cx="38" cy="43" r="2" fill="#fff8e8"/>
      </template>
      <template v-else-if="kind === 'crystal'">
        <path d="m32 7 13 15-5 30H24l-5-30Z" fill="currentColor" opacity=".85"/>
        <path d="m32 7 3 22-3 23-8-30Z" fill="#fff8e8" opacity=".4"/>
        <path d="m19 22 13 7 13-7" fill="none" stroke="#fff8e8" stroke-width="2" opacity=".75"/>
      </template>
      <template v-else-if="kind === 'wood'">
        <path d="m16 48 29-32 7 6-29 32Z" fill="currentColor" opacity=".86"/>
        <path d="m20 45 25-27" stroke="#fff8e8" stroke-width="3" opacity=".5"/>
        <ellipse cx="49" cy="19" rx="7" ry="5" fill="#e7af6f"/>
        <ellipse cx="49" cy="19" rx="3" ry="2" fill="currentColor"/>
      </template>
      <template v-else-if="kind === 'herb'">
        <path d="M32 53V28" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>
        <path d="M31 34C16 34 12 24 14 16c10 1 17 6 17 18Zm2 5c15 0 19-10 17-18-10 1-17 6-17 18Z" fill="currentColor" opacity=".86"/>
        <path d="M32 27C22 22 20 14 23 9c8 3 10 9 9 18Z" fill="#fff8e8" opacity=".42"/>
      </template>
      <template v-else-if="kind === 'hide'">
        <path d="M15 17c8-8 26-7 34 1l3 25-7 8H19l-7-8Z" fill="currentColor" opacity=".86"/>
        <path d="M21 22c6-4 16-4 22 0m-24 8c8-4 18-4 26 0m-25 9c7-3 17-3 24 0" fill="none" stroke="#fff8e8" stroke-width="2" opacity=".6"/>
      </template>
      <template v-else>
        <path d="m32 8 7 15 17 2-13 11 4 17-15-9-15 9 4-17L8 25l17-2Z" fill="currentColor" opacity=".82"/>
        <circle cx="32" cy="31" r="6" fill="#fff8e8" opacity=".55"/>
      </template>
    </svg>
  </span>
</template>
