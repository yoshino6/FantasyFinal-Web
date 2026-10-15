<script setup lang="ts">
import '../anime-growth-commerce.css';
import { computed, ref, watch } from 'vue';
import { itemAssetFor } from '../item-assets';
import { gameAssetUrl } from '../game-assets';
import { gameUiItemIconStyle, type GameUiItemIconName } from '../game-ui-item-icons';

type IconKind = 'all' | 'weapon' | 'armor' | 'accessory' | 'helmet' | 'boots' | 'map' | 'card' | 'quest' | 'potion' | 'food' | 'crystal' | 'wood' | 'herb' | 'hide' | 'material' | 'book' | 'injection' | 'furniture';

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
  if (props.itemType === 'skill_book') return 'book';
  if (/家具|木床|书桌|储物箱/.test(text)) return 'furniture';
  if (/针剂|evolution_injection/.test(`${text} ${props.code}`)) return 'injection';
  if (/书籍|书卷|技能|图鉴|笔记|指南/.test(text)) return 'book';
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
  if (props.itemType !== 'consumable' && /草药|药草/.test(text) && !/药剂|药水|药丸|药瓶|合剂/.test(text)) return 'herb';
  if (props.itemType === 'consumable' || /道具|药|水| potion|血瓶|魔瓶/.test(text)) {
    return /食|果|肉|面包|料理|点心/.test(text) ? 'food' : 'potion';
  }
  if (/晶|矿|石|宝石|琥珀|水晶/.test(text)) return 'crystal';
  if (/木|枝|树|藤|纤维|木材/.test(text)) return 'wood';
  if (/草|花|叶|种子|药草|蘑菇/.test(text)) return 'herb';
  if (/皮|毛|羽|鳞|骨/.test(text)) return 'hide';
  return 'material';
});
const assetSrc = computed(() => {
  // Bookshop responses omit item codes. Its explicit context still identifies
  // a book even when the title has no book-related word; real codes keep priority.
  if (!props.code.trim() && props.itemType === 'skill_book') return gameAssetUrl('/assets/items/skill-book.png');
  return itemAssetFor({ code: props.code, codexId: props.codexId, name: props.name, itemType: props.itemType, itemCategory: props.itemCategory });
});
const imageFailed = ref(false);
// These families have dedicated painted objects instead of abstract bottle art.
const drawnObject = computed(() => kind.value === 'furniture' || kind.value === 'injection');
const fallbackName = computed<GameUiItemIconName>(() => {
  if (kind.value === 'injection') {
    return /激进|调和/.test(props.name) ? 'injection-coral'
      : /感知|蜕变/.test(props.name) ? 'injection-purple' : 'injection';
  }
  if (kind.value === 'furniture') {
    return /床/.test(props.name) ? 'furniture-bed'
      : /桌|书架/.test(props.name) ? 'furniture-desk' : 'furniture-chest';
  }
  return kind.value;
});
watch(assetSrc, () => { imageFailed.value = false; });
</script>

<template>
  <span class="inventory-art-wrap anime-growth-commerce" :class="`inventory-art-${kind}`" aria-hidden="true">
    <img v-if="!imageFailed && !drawnObject" class="inventory-item-image" :src="assetSrc" alt="" loading="lazy" @error="imageFailed = true" />
    <span v-else class="inventory-art inventory-fallback-image" :data-item-fallback="fallbackName">
      <span class="inventory-fallback-sprite" :style="gameUiItemIconStyle(fallbackName)"></span>
    </span>
  </span>
</template>

<style scoped>
.inventory-fallback-image { position: relative; container-type: size; }
.inventory-fallback-sprite { position: absolute; top: 50%; left: 50%; width: min(100cqw, 100cqh); height: min(100cqw, 100cqh); transform: translate(-50%, -50%); background-repeat: no-repeat; }
</style>
