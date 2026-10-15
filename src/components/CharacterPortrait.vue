<script setup lang="ts">
import '../anime-growth-commerce.css';
import AnimeIcon from './AnimeIcon.vue';
import { computed, ref, watch } from 'vue';
import type { PanelEquippedItem, PanelPortrait } from '../api';
import { portraitAssetCandidates, type CharacterPortraitVariant } from '../character-assets';

const props = withDefaults(defineProps<{
  portrait?: PanelPortrait;
  variant?: CharacterPortraitVariant;
  /** 兼容角色页的轻量装备视图；接口完整装备仍可直接传入。 */
  equipment?: Array<Partial<PanelEquippedItem> & { slot?: string; name?: string; instanceId?: number | null }>;
  alt?: string;
}>(), { alt: '人类冒险者立绘', variant: 'default' });

const assetCandidates = computed(() => portraitAssetCandidates(props.portrait, props.variant));
const assetIndex = ref(0);
const baseSrc = computed(() => assetCandidates.value[assetIndex.value]);
const imageFailed = computed(() => !baseSrc.value);
watch(() => assetCandidates.value.join('|'), () => { assetIndex.value = 0; });
const tryNextAsset = () => { assetIndex.value += 1; };

const slotLabel: Record<string, string> = {
  weapon: '主手', offhand: '副手', shoulder: '头肩', upper: '上装', waist: '腰部', lower: '下装',
  feet: '脚部', necklace: '项链', bracelet: '手镯', ring: '戒指'
};
const labelForSlot = (slot?: string) => slot ? (slotLabel[slot] ?? slot) : '装备';
</script>

<template>
  <section class="character-portrait anime-growth-commerce" :data-portrait-variant="variant" aria-label="人物立绘与穿戴">
    <div class="character-portrait-stage">
      <img v-if="!imageFailed" class="character-portrait-base" :src="baseSrc" :alt="alt" @error="tryNextAsset" />
      <div v-else class="character-portrait-fallback" role="img" :aria-label="alt"><span>人类<br />冒险者</span></div>
    </div>
    <div v-if="equipment?.length" class="character-portrait-loadout">
      <span v-for="item in equipment" :key="`${item.slot}:${item.id ?? item.code}`" class="character-portrait-chip">
        <AnimeIcon :name="item.slot === 'weapon' ? 'sword' : item.slot === 'offhand' ? 'shield' : 'star'" :size="21" /><small>{{ labelForSlot(item.slot) }}</small>
        <strong>{{ item.appearanceName || item.name }}</strong>
      </span>
    </div>
    <p v-else class="character-portrait-empty">尚未穿戴装备</p>
  </section>
</template>

<style scoped>
.character-portrait { display: grid; gap: 10px; min-width: 0; }
.character-portrait-stage { position: relative; width: min(100%, 300px); aspect-ratio: 9 / 16; margin: 0 auto; overflow: hidden; border-radius: 24px; background: linear-gradient(145deg, rgba(246,235,226,.96), rgba(234,229,247,.94)); box-shadow: inset 0 0 0 1px rgba(255,255,255,.72), 0 13px 30px rgba(94,72,78,.12); }
.character-portrait-base { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.character-portrait-base { z-index: 1; }
.character-portrait-fallback { position: absolute; inset: 15% 20%; display: grid; place-items: center; color: #5d4b6c; background: radial-gradient(circle at 50% 28%, #f2c8a5 0 17%, transparent 18%), linear-gradient(#58749a 0 54%, #3d425d 55% 85%, #342f45 86%); border-radius: 48% 48% 30% 30%; text-align: center; }
.character-portrait-fallback span { margin-top: 120%; font-size: 12px; line-height: 1.5; }
.character-portrait-loadout { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
.character-portrait-chip { display: grid; gap: 2px; min-width: 0; padding: 7px 9px; color: #51475e; background: rgba(255,255,255,.68); border: 1px solid rgba(142,122,147,.14); border-radius: 10px; }
.character-portrait-chip small { color: #9b8998; font-size: 10px; }
.character-portrait-chip strong { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.character-portrait-empty { margin: 0; color: #9b8998; font-size: 11px; text-align: center; }
@media (max-width: 560px) { .character-portrait-stage { width: min(100%, 220px); } .character-portrait-loadout { grid-template-columns: 1fr; } }
</style>
