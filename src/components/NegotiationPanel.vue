<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useViewportPagination } from '../useViewportPagination';
import ViewportPagination from './ViewportPagination.vue';
import type { NegotiationPanel as NegotiationState } from '../api';
import AnimeIcon from './AnimeIcon.vue';
import InventoryItemIcon from './InventoryItemIcon.vue';
import { ANIME_SCENES } from '../anime-assets';
import { gameAssetUrl } from '../game-assets';
import './anime-adventure.css';

type NegotiationAction = 'view' | 'talk' | 'gift' | 'fight' | 'leave';

const props = defineProps<{
  negotiation: NegotiationState;
  playerPortrait?: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  (event: 'action', payload: { type: NegotiationAction; itemId?: number; quantity?: number; page?: number }): void;
}>();

const giftMode = ref(false);
const dialogueOpen = ref(false);
const quantity = ref(1);

const isOngoing = computed(() => props.negotiation.kind === 'ongoing');
const inventory = computed(() => props.negotiation.inventory?.items ?? []);
const giftViewport = ref<HTMLElement | null>(null);
const giftPaging = useViewportPagination(() => inventory.value, {container:giftViewport,rowHeight:64,gap:6});
watch(() => props.negotiation.inventory?.page, giftPaging.reset);
const moodLabel = computed(() => props.negotiation.mood || '未判明');
// 交涉规则中的善意、开战保护是“次数”而不是百分比（善意累计三次获得一层保护）。
// 这里用三格进度展示，避免把 0～3 的整数误当成百万分比后几乎看不见。
const goodwill = computed(() => Math.max(0, Math.min(100, Number(props.negotiation.goodwill ?? 0) / 3 * 100)));
const protection = computed(() => Math.max(0, Math.min(100, Number(props.negotiation.protection ?? 0) / 3 * 100)));

const emitAction = (type: NegotiationAction, extra: { itemId?: number; page?: number } = {}) => {
  if (props.disabled || !isOngoing.value) return;
  emit('action', { type, ...(extra.itemId ? { itemId: extra.itemId, quantity: Math.max(1, Math.floor(Number(quantity.value) || 1)) } : {}), ...(extra.page ? { page: extra.page } : {}) });
};

const selectGift = (itemId?: number) => {
  if (!itemId) return;
  emitAction('gift', { itemId });
};

const changePage = (offset: number) => {
  const page = props.negotiation.inventory?.page ?? 1;
  const totalPages = props.negotiation.inventory?.totalPages ?? 1;
  const next = Math.max(1, Math.min(totalPages, page + offset));
  if (next !== page) emitAction('view', { page: next });
};
</script>

<template>
  <section class="negotiation-panel card-surface anime-adventure" :style="{ '--adventure-scene': `url(${ANIME_SCENES.forest})` }" aria-label="交涉面板">
    <header class="negotiation-header">
      <div class="negotiation-target-mark"><AnimeIcon name="paw" :size="32" /></div>
      <div class="negotiation-heading">
        <p class="eyebrow">NEGOTIATION</p>
        <h3>与 {{ negotiation.name || '未知目标' }} 交涉</h3>
        <small>目标编号 #{{ negotiation.spawnId }}</small>
      </div>
      <span class="negotiation-mood">{{ moodLabel }}</span>
    </header>

    <div class="negotiation-scene" aria-hidden="true"><img v-if="playerPortrait" :src="playerPortrait" alt="" /><AnimeIcon v-else name="party" :size="76" /><span class="negotiation-scene-path" /><img v-if="negotiation.name?.includes('球兔')" :src="gameAssetUrl('/assets/loading/ball-rabbit.png')" alt="" /><AnimeIcon v-else name="paw" :size="76" /></div>
    <div class="negotiation-bars" aria-label="交涉状态">
      <div><AnimeIcon name="heart" :size="28" /><span>善意</span><strong>{{ negotiation.goodwill ?? 0 }}</strong><i><b class="goodwill" :style="{ width: `${goodwill}%` }" /></i></div>
      <div><AnimeIcon name="shield" :size="28" /><span>戒备</span><strong>{{ negotiation.protection ?? 0 }}</strong><i><b class="protection" :style="{ width: `${protection}%` }" /></i></div>
    </div>

    <div class="negotiation-dialogue">
      <span class="dialogue-tail" aria-hidden="true" />
      <p>{{ negotiation.text || '对方正在观察你的举动。' }}</p>
    </div>

    <div v-if="negotiation.completionText" class="negotiation-note">{{ negotiation.completionText }}</div>
    <button type="button" class="negotiation-read" @click="dialogueOpen = true">查看完整交涉记录</button>
    <div v-if="dialogueOpen" class="negotiation-dialogue-backdrop" @click.self="dialogueOpen = false"><section class="negotiation-dialogue-detail" role="dialog" aria-modal="true" aria-label="完整交涉记录"><header><h3>交涉记录</h3><button type="button" class="dialog-close" aria-label="关闭交涉记录" @click="dialogueOpen = false">×</button></header><div><p>{{ negotiation.text || '对方正在观察你的举动。' }}</p><p v-if="negotiation.completionText">{{ negotiation.completionText }}</p></div></section></div>

    <div v-if="isOngoing" class="negotiation-actions">
      <button type="button" class="negotiation-action primary" :disabled="disabled" @click="emitAction('talk')"><AnimeIcon name="scroll" :size="30" /><strong>交谈</strong><small>试探对方态度</small></button>
      <button type="button" class="negotiation-action gift" :class="{ active: giftMode }" :disabled="disabled" @click="giftMode = !giftMode"><AnimeIcon name="star" :size="30" /><strong>赠礼</strong><small>选择可交涉物品</small></button>
      <button type="button" class="negotiation-action danger" :disabled="disabled" @click="emitAction('fight')"><AnimeIcon name="sword" :size="30" /><strong>开战</strong><small>结束交涉并进入战斗</small></button>
      <button type="button" class="negotiation-action soft" :disabled="disabled" @click="emitAction('leave')"><AnimeIcon name="arrow" :size="30" /><strong>离开</strong><small>保留目标记忆</small></button>
    </div>

    <div v-if="isOngoing && giftMode" class="negotiation-gift-backdrop" @click.self="!disabled && (giftMode = false)">
    <div class="negotiation-gifts" role="dialog" aria-modal="true" aria-label="选择交涉礼物">
      <button type="button" class="dialog-close" aria-label="关闭礼物选择" :disabled="disabled" @click="giftMode = false">×</button>
      <div class="negotiation-gift-heading"><div><p class="eyebrow">OFFER</p><strong>选择一份礼物</strong></div><label>数量 <input v-model.number="quantity" type="number" min="1" max="999999" /></label></div>
      <div ref="giftViewport" class="negotiation-gift-viewport">
      <div v-if="inventory.length" class="negotiation-item-grid">
        <button v-for="item in giftPaging.visibleItems.value" :key="`${item.id ?? item.code}`" type="button" class="negotiation-item" :disabled="disabled" @click="selectGift(item.id)">
          <span class="negotiation-item-icon"><InventoryItemIcon :name="item.name" :code="item.code" :item-type="item.item_type" /></span>
          <span><strong>{{ item.name }}</strong><small>{{ item.policy?.subtype || item.item_category || '材料' }} · ×{{ item.available ?? item.quantity ?? 0 }}</small></span>
        </button>
      </div>
      <div v-else class="empty-state">没有可用于交涉的材料。</div>
      </div>
      <ViewportPagination :page="giftPaging.page.value" :total-pages="giftPaging.totalPages.value" :total="inventory.length" label="交涉礼物本页翻页" :disabled="disabled" @update:page="giftPaging.setPage" />
      <div v-if="(negotiation.inventory?.totalPages ?? 1) > 1" class="negotiation-pagination"><button type="button" class="ghost-button" :disabled="disabled || (negotiation.inventory?.page ?? 1) <= 1" @click="changePage(-1)">上一页</button><span>{{ negotiation.inventory?.page ?? 1 }} / {{ negotiation.inventory?.totalPages ?? 1 }}</span><button type="button" class="ghost-button" :disabled="disabled || (negotiation.inventory?.page ?? 1) >= (negotiation.inventory?.totalPages ?? 1)" @click="changePage(1)">下一页</button></div>
    </div>
    </div>

    <div v-if="!isOngoing" class="negotiation-result"><strong>{{ negotiation.kind === 'success' ? '交涉成功' : negotiation.kind === 'closed' ? '交涉结束' : negotiation.kind === 'combat_started' || negotiation.kind === 'combat_resumed' ? '交涉转为战斗' : '交涉状态已更新' }}</strong><p>{{ negotiation.text }}</p></div>
  </section>
</template>

<style scoped>
.negotiation-panel { position: relative; padding: 21px; overflow: hidden; }
.negotiation-header { display: flex; align-items: center; gap: 11px; margin-bottom: 14px; }
.negotiation-target-mark { display: grid; place-items: center; flex: 0 0 47px; width: 47px; height: 47px; color: #8f709c; background: #f0e8ff; border-radius: 15px; font-size: 25px; }
.negotiation-heading { min-width: 0; flex: 1; }
.negotiation-heading h3 { margin: 0 0 3px; font-size: 17px; }
.negotiation-heading small { color: var(--muted, #827487); font-size: 10px; }
.negotiation-mood { flex: 0 0 auto; padding: 5px 8px; color: #856e88; background: #fbf0e9; border-radius: 8px; font-size: 10px; }
.negotiation-bars { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; margin-bottom: 14px; }
.negotiation-bars > div { display: grid; grid-template-columns: auto auto; gap: 4px 7px; padding: 9px 10px; background: #fbf6f1; border-radius: 10px; color: var(--muted, #827487); font-size: 10px; }
.negotiation-bars strong { margin-left: auto; color: #5b5061; font-size: 10px; }
.negotiation-bars i { display: block; grid-column: 1 / -1; height: 5px; overflow: hidden; background: #eadfd9; border-radius: 99px; }
.negotiation-bars i b { display: block; height: 100%; border-radius: inherit; transition: width .2s ease; }
.negotiation-bars i b.goodwill { background: linear-gradient(90deg, #7dbb9b, #acd8b1); }
.negotiation-bars i b.protection { background: linear-gradient(90deg, #dd8b83, #efb193); }
.negotiation-dialogue { position: relative; min-height: 62px; margin-bottom: 14px; padding: 12px 14px; color: #594d60; background: #fffaf5; border: 1px solid #f0e2d8; border-radius: 13px; font-size: 12px; line-height: 1.6; }
.negotiation-dialogue p { margin: 0; white-space: pre-line; }
.dialogue-tail { position: absolute; bottom: -6px; left: 28px; width: 11px; height: 11px; background: #fffaf5; border-right: 1px solid #f0e2d8; border-bottom: 1px solid #f0e2d8; transform: rotate(45deg); }
.negotiation-note { margin: -3px 0 13px; padding: 8px 10px; color: #8b6d76; background: #fff2e8; border-radius: 9px; font-size: 10px; line-height: 1.5; }
.negotiation-actions { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; }
.negotiation-action { display: grid; justify-items: center; gap: 2px; min-width: 0; padding: 9px 5px; border-radius: 11px; text-align: center; }
.negotiation-action > span { font-size: 16px; line-height: 1; }
.negotiation-action strong { font-size: 11px; }
.negotiation-action small { color: var(--muted, #827487); font-size: 8px; white-space: nowrap; }
.negotiation-action.primary { color: #665197; background: #eee9ff; }
.negotiation-action.gift { color: #8d6f50; background: #fff1d8; }
.negotiation-action.gift.active { box-shadow: inset 0 0 0 2px rgba(204,153,80,.35); }
.negotiation-action.danger { color: #a65c62; background: #ffe7e2; }
.negotiation-action.soft { color: #756d7d; background: #f3eee9; }
.negotiation-action:disabled, .negotiation-item:disabled { opacity: .45; cursor: not-allowed; }
.negotiation-gifts { margin-top: 12px; padding-top: 13px; border-top: 1px solid var(--line, #eadfd8); }
.negotiation-gift-heading { display: flex; align-items: end; justify-content: space-between; gap: 10px; margin-bottom: 9px; }
.negotiation-gift-heading strong { font-size: 12px; }
.negotiation-gift-heading label { display: flex; align-items: center; gap: 5px; color: var(--muted, #827487); font-size: 10px; }
.negotiation-gift-heading input { width: 72px; padding: 5px 6px; color: var(--ink, #4d4354); background: #fffaf5; border: 1px solid var(--line, #eadfd8); border-radius: 7px; font-size: 11px; }
.negotiation-item-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
.negotiation-item { display: flex; align-items: center; gap: 7px; min-width: 0; padding: 8px; color: #554c5d; background: #faf4ee; border: 1px solid transparent; border-radius: 10px; text-align: left; }

.negotiation-item-icon { display: grid; place-items: center; flex: 0 0 25px; width: 25px; height: 25px; color: #bd8b55; background: #fff; border-radius: 8px; }
.negotiation-item > span:last-child { display: grid; min-width: 0; gap: 2px; }
.negotiation-item strong, .negotiation-item small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.negotiation-item strong { font-size: 10px; }
.negotiation-item small { color: var(--muted, #827487); font-size: 8px; }
.negotiation-pagination { display: flex; align-items: center; justify-content: center; gap: 9px; margin-top: 9px; color: var(--muted, #827487); font-size: 10px; }
.negotiation-pagination .ghost-button { padding: 5px 7px; font-size: 10px; }
.negotiation-result { margin-top: 8px; padding: 11px 12px; color: #615566; background: #fbf5ef; border-radius: 11px; font-size: 11px; line-height: 1.5; }
.negotiation-result strong { color: #8063a0; }
.negotiation-result p { margin: 5px 0 0; white-space: pre-line; }
@media (max-width: 560px) { .negotiation-panel { padding: 16px 13px; } .negotiation-actions { grid-template-columns: repeat(2, minmax(0, 1fr)); } .negotiation-item-grid { grid-template-columns: 1fr; } }
</style>
