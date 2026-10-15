<script setup lang="ts">
import '../anime-growth-commerce.css';
import '../game-ui-shops.css';
import AnimeIcon from './AnimeIcon.vue';
import GameUiFeedbackArt from './GameUiFeedbackArt.vue';
import { computed, nextTick, ref, watch } from 'vue';
import { userFacingErrorMessage } from '../api';
import InventoryItemIcon from './InventoryItemIcon.vue';
import * as guildShop from '../guild-shop-api';
import type {
  GuildShopBuyQuote, GuildShopDetailResponse, GuildShopPage, GuildShopPreview,
  GuildShopSellableItem, GuildShopSellQuote, GuildShopShelfItem, GuildShopSide, GuildShopTarget
} from '../guild-shop-api';

const props = defineProps<{ open: boolean; targetId: string; initialSide?: GuildShopSide }>();
const emit = defineEmits<{ close: []; updated: [] }>();
type ActiveQuote = { side: GuildShopSide; targetId: string; itemId: number; quantity: number; preview: GuildShopPreview };

const closeButton = ref<HTMLButtonElement | null>(null);
const side = ref<GuildShopSide>('buy');
const shelf = ref<GuildShopPage<GuildShopShelfItem> | null>(null);
const sellable = ref<GuildShopPage<GuildShopSellableItem> | null>(null);
const target = ref<GuildShopTarget | null>(null);
const gateOpen = ref(false);
const loading = ref(false);
const detailLoading = ref(false);
const pending = ref(false);
const error = ref('');
const detailError = ref('');
const notice = ref('');
const buySearchDraft = ref('');
const buyKeyword = ref('');
const buyPage = ref(1);
const sellSearchDraft = ref('');
const sellKeyword = ref('');
const sellPage = ref(1);
const selectedBuy = ref<GuildShopShelfItem | null>(null);
const selectedSell = ref<GuildShopSellableItem | null>(null);
const detail = ref<GuildShopDetailResponse | null>(null);
const quantity = ref(1);
const activeQuote = ref<ActiveQuote | null>(null);
const uncertainConfirmToken = ref<string | null>(null);
const now = ref(Date.now());
let listVersion = 0;
let detailVersion = 0;

const pageData = computed(() => side.value === 'buy' ? shelf.value : sellable.value);
const contribution = computed(() => side.value === 'buy'
  ? shelf.value?.contribution ?? detail.value?.contribution ?? sellable.value?.contribution ?? null
  : sellable.value?.contribution ?? shelf.value?.contribution ?? null);
const detailItem = computed(() => {
  const current = detail.value;
  return current && current.item.id === selectedBuy.value?.id ? current.item : null;
});
const buyQuote = computed(() => activeQuote.value?.side === 'buy' ? activeQuote.value.preview.quote as GuildShopBuyQuote : null);
const sellQuote = computed(() => activeQuote.value?.side === 'sell' ? activeQuote.value.preview.quote as GuildShopSellQuote : null);
const quoteExpired = computed(() => activeQuote.value ? now.value >= new Date(activeQuote.value.preview.expiresAt).getTime() : false);
const canRetryConfirmation = computed(() => Boolean(activeQuote.value && uncertainConfirmToken.value === activeQuote.value.preview.token));

function numberText(value: number | null | undefined) { return value == null ? '—' : value.toLocaleString('zh-CN'); }
function dateText(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN');
}
function requestClose() { if (!pending.value && !canRetryConfirmation.value) emit('close'); }

async function loadList() {
  if (!props.open || !props.targetId) return;
  const version = ++listVersion;
  const requestedTarget = props.targetId;
  const requestedSide = side.value;
  loading.value = true;
  try {
    if (requestedSide === 'buy') {
      const result = await guildShop.guildShopShelf(requestedTarget, buyPage.value, buyKeyword.value);
      if (version !== listVersion || !props.open || props.targetId !== requestedTarget || side.value !== requestedSide) return;
      shelf.value = result;
      target.value = result.target;
      buyPage.value = result.page;
      const updated = result.items.find(item => item.id === selectedBuy.value?.id);
      if (updated) selectedBuy.value = updated;
    } else {
      const result = await guildShop.guildShopSellable(requestedTarget, sellPage.value, sellKeyword.value);
      if (version !== listVersion || !props.open || props.targetId !== requestedTarget || side.value !== requestedSide) return;
      sellable.value = result;
      target.value = result.target;
      sellPage.value = result.page;
      const updated = result.items.find(item => item.id === selectedSell.value?.id);
      if (updated) selectedSell.value = updated;
    }
    gateOpen.value = true;
  } catch (cause) {
    if (version === listVersion) {
      gateOpen.value = false;
      error.value = userFacingErrorMessage(cause);
    }
  } finally {
    if (version === listVersion) loading.value = false;
  }
}

async function loadDetail(itemId: number) {
  if (!props.open || !props.targetId) return;
  const version = ++detailVersion;
  const requestedTarget = props.targetId;
  detailLoading.value = true;
  detailError.value = '';
  detail.value = null;
  try {
    const result = await guildShop.guildShopItem(requestedTarget, itemId);
    if (version !== detailVersion || props.targetId !== requestedTarget || selectedBuy.value?.id !== itemId) return;
    detail.value = result;
  } catch (cause) {
    if (version === detailVersion) detailError.value = userFacingErrorMessage(cause);
  } finally {
    if (version === detailVersion) detailLoading.value = false;
  }
}

function chooseBuy(item: GuildShopShelfItem) {
  if (pending.value || canRetryConfirmation.value) return;
  selectedBuy.value = item;
  selectedSell.value = null;
  quantity.value = 1;
  activeQuote.value = null;
  void loadDetail(item.id);
}
function chooseSell(item: GuildShopSellableItem) {
  if (pending.value || canRetryConfirmation.value) return;
  selectedSell.value = item;
  selectedBuy.value = null;
  detail.value = null;
  detailError.value = '';
  ++detailVersion;
  quantity.value = 1;
  activeQuote.value = null;
}
function switchSide(next: GuildShopSide) {
  if (pending.value || canRetryConfirmation.value || side.value === next) return;
  side.value = next;
  error.value = '';
  notice.value = '';
  activeQuote.value = null;
  quantity.value = 1;
  void loadList();
}
function search() {
  if (pending.value || canRetryConfirmation.value || loading.value) return;
  error.value = '';
  activeQuote.value = null;
  if (side.value === 'buy') {
    buyKeyword.value = buySearchDraft.value.trim();
    buyPage.value = 1;
    selectedBuy.value = null;
    detail.value = null;
  } else {
    sellKeyword.value = sellSearchDraft.value.trim();
    sellPage.value = 1;
    selectedSell.value = null;
  }
  void loadList();
}
function changePage(next: number) {
  if (pending.value || canRetryConfirmation.value || loading.value || !pageData.value || next < 1 || next > pageData.value.totalPages || next === pageData.value.page) return;
  error.value = '';
  activeQuote.value = null;
  if (side.value === 'buy') buyPage.value = next;
  else sellPage.value = next;
  void loadList();
}

function validDraft() {
  const item = side.value === 'buy' ? selectedBuy.value : selectedSell.value;
  if (!item) throw new Error(`请先选择要${side.value === 'buy' ? '购买' : '出售'}的物品。`);
  if (!Number.isSafeInteger(quantity.value) || quantity.value < 1 || quantity.value > 999) throw new Error('数量必须是 1 至 999 的整数。');
  if (side.value === 'buy') {
    const chosen = item as GuildShopShelfItem;
    if (chosen.category === '地图' && quantity.value !== 1) throw new Error('地图每次只能购买一张。');
    if (chosen.category === '地图' && chosen.ownedQuantity > 0) throw new Error('你已经拥有这张地图。');
    if (chosen.stockQuantity !== null && quantity.value > chosen.stockQuantity) throw new Error(`当前货架仅剩 ${chosen.stockQuantity} 件。`);
  } else if (quantity.value > (item as GuildShopSellableItem).sellableQuantity) {
    throw new Error(`可出售数量仅有 ${(item as GuildShopSellableItem).sellableQuantity} 件。`);
  }
  return { side: side.value, itemId: item.id, quantity: quantity.value };
}

async function previewTrade() {
  if (pending.value || canRetryConfirmation.value || !gateOpen.value) return;
  let draft: ReturnType<typeof validDraft>;
  try { draft = validDraft(); } catch (cause) { error.value = userFacingErrorMessage(cause); return; }
  pending.value = true;
  error.value = '';
  notice.value = '';
  activeQuote.value = null;
  const requestedTarget = props.targetId;
  try {
    const preview = await guildShop.previewGuildShopTrade(requestedTarget, draft.side, draft.itemId, draft.quantity);
    if (props.open && props.targetId === requestedTarget && side.value === draft.side) {
      now.value = Date.now();
      activeQuote.value = { ...draft, targetId: requestedTarget, preview };
    }
  } catch (cause) {
    if (props.open && props.targetId === requestedTarget) {
      const message = userFacingErrorMessage(cause);
      await loadList();
      if (draft.side === 'buy' && selectedBuy.value?.id === draft.itemId && gateOpen.value) void loadDetail(draft.itemId);
      error.value = message;
    }
  } finally { pending.value = false; }
}

async function confirmTrade() {
  const current = activeQuote.value;
  if (!current || pending.value || !props.open) return;
  if (Date.now() >= new Date(current.preview.expiresAt).getTime() && !canRetryConfirmation.value) {
    error.value = '报价已过期，请重新预览。';
    activeQuote.value = null;
    return;
  }
  pending.value = true;
  error.value = '';
  notice.value = '';
  try {
    const response = await guildShop.confirmGuildShopTrade(current.targetId, current.side,
      current.preview.token, current.preview.idempotencyKey);
    uncertainConfirmToken.value = null;
    emit('updated');
    if (props.open && props.targetId === current.targetId) {
      activeQuote.value = null;
      notice.value = `${current.side === 'buy' ? '购买' : '出售'} ${response.result.name} ×${response.result.quantity} 已完成；${current.side === 'buy' ? '支出' : '获得'} ${numberText(response.result.price)} 贡献度。`;
      await loadList();
      if (current.side === 'buy' && selectedBuy.value?.id === current.itemId) void loadDetail(current.itemId);
    }
  } catch (cause) {
    if (props.open && props.targetId === current.targetId) {
      const message = userFacingErrorMessage(cause);
      const retryable = /网络连接异常|暂时不可用|服务器返回内容异常|操作未完成|请求超时|状态码 408/.test(message);
      uncertainConfirmToken.value = retryable ? current.preview.token : null;
      if (!retryable) activeQuote.value = null;
      await loadList();
      if (current.side === 'buy' && selectedBuy.value?.id === current.itemId && gateOpen.value) void loadDetail(current.itemId);
      error.value = retryable ? `${message} 原确认凭据已保留，可核对余额和库存后重试。`
        : `${message} 已重新读取商店状态，请再次预览。`;
    }
  } finally { pending.value = false; }
}

watch(quantity, () => { if (!canRetryConfirmation.value) activeQuote.value = null; });
watch([() => props.open, () => props.targetId], async ([open, targetId], _old, onCleanup) => {
  ++listVersion;
  ++detailVersion;
  const timer = open ? window.setInterval(() => { now.value = Date.now(); }, 1000) : null;
  onCleanup(() => { if (timer !== null) window.clearInterval(timer); });
  if (!open) { gateOpen.value = false; activeQuote.value = null; return; }
  shelf.value = null;
  sellable.value = null;
  target.value = null;
  gateOpen.value = false;
  side.value = props.initialSide ?? 'buy';
  buyPage.value = 1;
  sellPage.value = 1;
  buyKeyword.value = '';
  sellKeyword.value = '';
  buySearchDraft.value = '';
  sellSearchDraft.value = '';
  selectedBuy.value = null;
  selectedSell.value = null;
  detail.value = null;
  activeQuote.value = null;
  error.value = '';
  notice.value = '';
  now.value = Date.now();
  await nextTick();
  closeButton.value?.focus();
  if (!targetId) { error.value = '请从当前公会建筑入口打开商店。'; return; }
  void loadList();
}, { immediate: true });
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="guild-shop-backdrop" role="presentation" @click.self="requestClose">
      <section class="guild-shop-panel anime-growth-commerce shop-ledger-painted" role="dialog" aria-modal="true" aria-label="公会商店" @keydown.esc="requestClose">
        <header class="guild-shop-header">
          <div class="guild-shop-emblem"><AnimeIcon name="shield" :size="37" /></div>
          <div class="guild-shop-title"><small>冒险者补给 · 公会商店</small><h2>{{ target?.guildName ?? '冒险者公会' }}商店</h2><span v-if="target">{{ target.regionCode }}</span></div>
          <div v-if="contribution !== null" class="guild-shop-balance"><small>当前贡献度</small><strong>{{ numberText(contribution) }}</strong></div>
          <button ref="closeButton" class="guild-shop-close" type="button" aria-label="关闭公会商店" :disabled="pending || canRetryConfirmation" @click="requestClose"><AnimeIcon name="close" :size="25" /></button>
        </header>

        <nav class="guild-shop-tabs" aria-label="公会商店栏目">
          <button type="button" :class="{ active: side === 'buy' }" :disabled="pending || canRetryConfirmation" @click="switchSide('buy')">浏览货架</button>
          <button type="button" :class="{ active: side === 'sell' }" :disabled="pending || canRetryConfirmation" @click="switchSide('sell')">出售背包物品</button>
        </nav>

        <div class="guild-shop-body">
          <p v-if="notice" class="guild-shop-notice" role="status">{{ notice }}</p>
          <p v-if="error" class="guild-shop-error" role="alert">{{ error }}</p>
          <p v-if="canRetryConfirmation" class="guild-shop-error" role="status">确认结果尚未确定，请用原凭据核对。核对完成前暂不能关闭；网络持续不可用时请保持页面打开，稍后重试。</p>
          <p v-if="loading && !gateOpen" class="guild-shop-empty game-ui-empty-message" role="status"><GameUiFeedbackArt name="loading" :size="36" /><span>正在读取当前公会商店…</span></p>

          <template v-if="gateOpen">
            <p class="guild-shop-intro">{{ side === 'buy' ? '货架价格为当前参考值。实际贡献度与库存以服务端报价为准。' : '只能出售背包中当前可售的物品。实际贡献度以服务端报价为准。' }}</p>
            <form class="guild-shop-search" @submit.prevent="search">
              <AnimeIcon class="shop-ledger-search-art" name="search" :size="19" />
              <input v-if="side === 'buy'" v-model="buySearchDraft" type="search" maxlength="80" placeholder="搜索货架商品" aria-label="搜索货架商品" :disabled="pending" />
              <input v-else v-model="sellSearchDraft" type="search" maxlength="80" placeholder="搜索可售背包物品" aria-label="搜索可售背包物品" :disabled="pending" />
              <button type="submit" :disabled="pending || canRetryConfirmation || loading">搜索</button>
              <button type="button" class="guild-shop-reload" :disabled="pending || loading" @click="loadList">刷新</button>
            </form>

            <div class="guild-shop-content">
              <div class="guild-shop-results">
                <p v-if="loading" class="guild-shop-empty game-ui-empty-message" role="status"><GameUiFeedbackArt name="loading" :size="36" /><span>正在更新商品…</span></p>
                <template v-else-if="side === 'buy'">
                  <div v-if="shelf?.items.length" class="guild-shop-list">
                    <button v-for="item in shelf.items" :key="item.id" type="button" class="guild-shop-item" :class="{ selected: selectedBuy?.id === item.id }" :disabled="pending || canRetryConfirmation" @click="chooseBuy(item)">
                      <InventoryItemIcon :name="item.name" :codex-id="item.codexId" :item-category="item.category" />
                      <span class="guild-shop-item-text"><strong :title="item.name">{{ item.name }}</strong><small>{{ item.category }} · 当前参考 <b class="shop-price">{{ numberText(item.price) }}</b> 贡献度</small><span>库存 {{ item.stockQuantity === null ? '不设数量' : `${numberText(item.stockQuantity)} 件` }} · 已持有 {{ numberText(item.ownedQuantity) }}</span></span>
                      <span class="guild-shop-arrow" aria-hidden="true"><AnimeIcon name="arrow" :size="19" /></span>
                    </button>
                  </div>
                  <p v-else class="guild-shop-empty game-ui-empty-message"><GameUiFeedbackArt name="empty" :size="36" /><span>当前搜索下没有货架商品。</span></p>
                </template>
                <template v-else>
                  <div v-if="sellable?.items.length" class="guild-shop-list">
                    <button v-for="item in sellable.items" :key="item.id" type="button" class="guild-shop-item" :class="{ selected: selectedSell?.id === item.id }" :disabled="pending || canRetryConfirmation" @click="chooseSell(item)">
                      <InventoryItemIcon :name="item.name" :item-category="item.category" />
                      <span class="guild-shop-item-text"><strong :title="item.name">{{ item.name }}</strong><small>{{ item.category }} · 当前参考 <b class="shop-price">{{ numberText(item.price) }}</b> 贡献度 / 件</small><span>可售 {{ numberText(item.sellableQuantity) }} 件 · 背包共 {{ numberText(item.quantity) }} 件</span></span>
                      <span class="guild-shop-arrow" aria-hidden="true"><AnimeIcon name="arrow" :size="19" /></span>
                    </button>
                  </div>
                  <p v-else class="guild-shop-empty game-ui-empty-message"><GameUiFeedbackArt name="empty" :size="36" /><span>背包中没有符合搜索条件的可售物品。</span></p>
                </template>
                <div v-if="pageData" class="guild-shop-pager"><button type="button" :disabled="pending || loading || pageData.page <= 1" @click="changePage(pageData.page - 1)">上一页</button><span>第 {{ pageData.page }} / {{ pageData.totalPages }} 页</span><button type="button" :disabled="pending || loading || pageData.page >= pageData.totalPages" @click="changePage(pageData.page + 1)">下一页</button></div>
              </div>

              <aside class="guild-shop-detail">
                <template v-if="side === 'buy' && selectedBuy">
                  <div class="guild-shop-picked"><InventoryItemIcon :name="selectedBuy.name" :codex-id="selectedBuy.codexId" :item-category="selectedBuy.category" /><div><small>购买商品</small><h3>{{ selectedBuy.name }}</h3></div></div>
                  <p v-if="detailLoading" class="guild-shop-subtle">正在读取详情…</p>
                  <p v-if="detailError" class="guild-shop-error" role="alert">{{ detailError }}</p>
                  <template v-if="detailItem"><p class="guild-shop-description">{{ detailItem.description || '暂无描述。' }}</p><dl class="guild-shop-facts"><div><dt>类别</dt><dd>{{ detailItem.category }}</dd></div><div><dt>当前单件参考</dt><dd>{{ numberText(detailItem.price) }} 贡献度</dd></div><div><dt>库存</dt><dd>{{ detailItem.stockQuantity === null ? '不设数量' : `${numberText(detailItem.stockQuantity)} 件` }}</dd></div><div><dt>已持有</dt><dd>{{ numberText(detailItem.ownedQuantity) }} 件</dd></div></dl></template>
                  <label class="guild-shop-quantity">购买数量<input v-model.number="quantity" type="number" min="1" :max="selectedBuy.category === '地图' ? 1 : Math.min(999, selectedBuy.stockQuantity ?? 999)" step="1" inputmode="numeric" :disabled="pending || canRetryConfirmation" /></label>
                  <button class="guild-shop-primary" type="button" :disabled="pending || canRetryConfirmation || loading || (selectedBuy.category === '地图' && selectedBuy.ownedQuantity > 0) || selectedBuy.stockQuantity === 0" @click="previewTrade">预览真实报价</button>
                  <p v-if="selectedBuy.category === '地图' && selectedBuy.ownedQuantity > 0" class="guild-shop-subtle">已拥有这张地图，无法重复购入。</p>
                </template>
                <template v-else-if="side === 'sell' && selectedSell">
                  <div class="guild-shop-picked"><InventoryItemIcon :name="selectedSell.name" :item-category="selectedSell.category" /><div><small>出售物品</small><h3>{{ selectedSell.name }}</h3></div></div>
                  <dl class="guild-shop-facts"><div><dt>背包数量</dt><dd>{{ numberText(selectedSell.quantity) }} 件</dd></div><div><dt>当前可售</dt><dd>{{ numberText(selectedSell.sellableQuantity) }} 件</dd></div><div><dt>当前单件参考</dt><dd>{{ numberText(selectedSell.price) }} 贡献度</dd></div></dl>
                  <label class="guild-shop-quantity">出售数量<input v-model.number="quantity" type="number" min="1" :max="Math.min(999, selectedSell.sellableQuantity)" step="1" inputmode="numeric" :disabled="pending || canRetryConfirmation" /></label>
                  <button class="guild-shop-primary" type="button" :disabled="pending || canRetryConfirmation || loading || selectedSell.sellableQuantity < 1" @click="previewTrade">预览真实报价</button>
                </template>
                <p v-else class="guild-shop-empty game-ui-empty-message"><GameUiFeedbackArt name="message" :size="36" /><span>从{{ side === 'buy' ? '货架' : '可售背包' }}选择物品，查看详情并获取报价。</span></p>

                <div v-if="activeQuote && activeQuote.side === side" class="guild-shop-quote">
                  <strong>{{ side === 'buy' ? '购买确认' : '出售确认' }}</strong>
                  <p>{{ activeQuote.preview.quote.name }} ×{{ activeQuote.preview.quote.quantity }} · {{ side === 'buy' ? '支出' : '获得' }} <b>{{ numberText(activeQuote.preview.quote.price) }}</b> 贡献度</p>
                  <p>贡献度 {{ numberText(activeQuote.preview.quote.contributionBefore) }} → {{ numberText(activeQuote.preview.quote.contributionAfter) }}</p>
                  <p v-if="buyQuote">库存 {{ buyQuote.stockBefore === null ? '不设数量' : `${numberText(buyQuote.stockBefore)} → ${numberText(buyQuote.stockAfter)}` }} · {{ buyQuote.personalBound ? '购入后个人绑定' : '购入后可交易' }}</p>
                  <p v-if="buyQuote && (buyQuote.discountCredit || buyQuote.talentDiscount)">已应用补给或天赋优惠；实付贡献度以上方报价为准。</p>
                  <p v-if="sellQuote">可售数量 {{ numberText(sellQuote.sellableBefore) }} → {{ numberText(sellQuote.sellableAfter) }} · 单件 {{ numberText(sellQuote.unitPrice) }} 贡献度</p>
                  <small>报价有效至 {{ dateText(activeQuote.preview.expiresAt) }}；确认时仍会复核库存和余额。</small>
                  <button class="guild-shop-primary" type="button" :disabled="pending || (quoteExpired && !canRetryConfirmation)" @click="confirmTrade">{{ canRetryConfirmation ? '用原凭据核对结果' : `明确确认${side === 'buy' ? '购买' : '出售'}` }}</button>
                  <p v-if="quoteExpired" class="guild-shop-error" role="alert">{{ canRetryConfirmation ? '报价已过期；原确认凭据仅能回读已完成结果。' : '报价已过期，请重新预览。' }}</p>
                </div>
              </aside>
            </div>
          </template>
          <div v-if="!gateOpen && canRetryConfirmation && activeQuote" class="guild-shop-quote">
            <strong>公会商店确认结果待核对</strong>
            <p>原确认请求已发出。可用同一凭据核对结果；未完成的过期请求不会执行。</p>
            <button class="guild-shop-primary" type="button" :disabled="pending" @click="confirmTrade">用原凭据核对结果</button>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.guild-shop-backdrop { position: fixed; z-index: 97; inset: 0; display: grid; place-items: center; padding: max(10px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left)); background: #252030a8; backdrop-filter: blur(5px); }
.guild-shop-panel { display: flex; flex-direction: column; width: min(980px, 100%); height: min(780px, 100%); min-height: 0; overflow: hidden; color: #493b4f; background: #fffaf7; border: 1px solid #f0e3dd; border-radius: 21px; box-shadow: 0 25px 70px #17132366; }
.guild-shop-header { display: flex; align-items: center; gap: 12px; min-height: 79px; padding: 14px 20px; background: linear-gradient(110deg, #f8edf5, #fff6e9 63%, #f5f0fa); border-bottom: 1px solid #ecdedf; }
.guild-shop-emblem { display: grid; place-items: center; flex: 0 0 44px; width: 44px; height: 44px; color: #fff6e7; background: linear-gradient(145deg, #aa78a7, #be946f); border-radius: 13px; box-shadow: 0 5px 14px #aa78a755; font-size: 23px; }
.guild-shop-title { flex: 1; min-width: 0; }.guild-shop-title small { color: #ad8f9e; font-size: 10px; letter-spacing: .1em; }.guild-shop-title h2 { margin: 2px 0; color: #513c56; font-size: 19px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.guild-shop-title span { color: #a18f9e; font-size: 10px; }
.guild-shop-balance { display: grid; gap: 2px; padding: 6px 11px; color: #85643d; background: #fff3d9; border-radius: 10px; white-space: nowrap; }.guild-shop-balance small { font-size: 10px; }.guild-shop-balance strong { font-size: 17px; }
.guild-shop-close { width: 35px; height: 35px; flex: none; color: #846b83; background: #fff9fa; border: 1px solid #e9dce5; border-radius: 9px; font-size: 22px; line-height: 1; }
.guild-shop-tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); flex: none; padding: 0 18px; background: #fff; border-bottom: 1px solid #eee3e5; }.guild-shop-tabs button { min-height: 45px; color: #938494; background: none; border: 0; border-bottom: 3px solid transparent; font-size: 13px; }.guild-shop-tabs button.active { color: #875c84; border-bottom-color: #b787ae; font-weight: 800; }
.guild-shop-body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 17px 20px max(25px, env(safe-area-inset-bottom)); }.guild-shop-intro { margin: 0 0 13px; color: #8d7f8d; font-size: 12px; line-height: 1.55; }
.guild-shop-search { display: flex; gap: 8px; margin-bottom: 15px; }.guild-shop-search input, .guild-shop-quantity input { min-height: 38px; padding: 8px 10px; color: #4d3b53; background: white; border: 1px solid #dfd1dd; border-radius: 9px; font: inherit; font-size: 13px; }.guild-shop-search input { flex: 1; min-width: 0; }.guild-shop-search button { min-height: 38px; padding: 8px 15px; color: #fff; background: #9d6b95; border-radius: 9px; font-size: 12px; font-weight: 700; }.guild-shop-search .guild-shop-reload { color: #856786; background: #f3e9f2; }
.guild-shop-content { display: grid; grid-template-columns: minmax(0, 1fr) minmax(250px, 330px); gap: 15px; align-items: start; }.guild-shop-results { min-width: 0; }.guild-shop-list { display: grid; gap: 8px; }.guild-shop-item { display: flex; align-items: center; gap: 10px; width: 100%; min-width: 0; padding: 11px; color: inherit; text-align: left; background: #fff; border: 1px solid #ecdee7; border-radius: 12px; box-shadow: 0 3px 10px #7547780d; }.guild-shop-item.selected { border-color: #c69ac0; background: #fffafd; }.guild-shop-item :deep(.inventory-art-wrap), .guild-shop-picked :deep(.inventory-art-wrap) { flex: 0 0 44px; width: 44px; height: 44px; margin: 0; background: #f9edf4; border-radius: 10px; }.guild-shop-item :deep(.inventory-item-image), .guild-shop-picked :deep(.inventory-item-image) { width: 40px; height: 40px; }.guild-shop-item-text { display: grid; gap: 3px; flex: 1; min-width: 0; overflow-wrap: anywhere; }.guild-shop-item-text strong { color: #59425d; font-size: 13px; }.guild-shop-item-text small { color: #987b90; font-size: 11px; }.guild-shop-item-text > span { color: #837889; font-size: 11px; }.guild-shop-arrow { color: #bd94b6; font-size: 21px; }
.guild-shop-pager { display: flex; align-items: center; justify-content: center; gap: 13px; margin: 15px 0; color: #938595; font-size: 12px; }.guild-shop-pager button { min-height: 34px; padding: 7px 10px; color: #865e83; background: #f3e9f2; border-radius: 8px; }
.guild-shop-detail { min-width: 0; padding: 16px; background: #fff; border: 1px solid #eadddf; border-radius: 13px; box-shadow: 0 4px 14px #77517511; }.guild-shop-picked { display: flex; align-items: center; gap: 10px; margin-bottom: 11px; }.guild-shop-picked div { min-width: 0; }.guild-shop-picked small { color: #ab91a6; font-size: 11px; }.guild-shop-picked h3 { margin: 2px 0; color: #5a435d; font-size: 16px; overflow-wrap: anywhere; }.guild-shop-description { margin: 9px 0 14px; color: #817681; font-size: 12px; line-height: 1.55; }.guild-shop-facts { margin: 10px 0; }.guild-shop-facts div { display: flex; justify-content: space-between; gap: 8px; padding: 7px 0; border-top: 1px solid #f0e8ed; font-size: 12px; }.guild-shop-facts dt { color: #9b8d9c; }.guild-shop-facts dd { margin: 0; color: #68546c; text-align: right; }.guild-shop-quantity { display: grid; gap: 5px; margin-top: 14px; color: #746679; font-size: 12px; }.guild-shop-quantity input { width: 100%; }.guild-shop-primary { width: 100%; min-height: 39px; margin-top: 11px; padding: 9px 12px; color: white; background: #96648f; border-radius: 9px; font-size: 12px; font-weight: 800; }
.guild-shop-quote { display: grid; gap: 5px; margin-top: 17px; padding: 13px; color: #68586e; background: #f8eff8; border: 1px solid #e9d9e7; border-radius: 11px; font-size: 12px; line-height: 1.5; }.guild-shop-quote > strong { color: #744d78; font-size: 14px; }.guild-shop-quote p { margin: 0; }.guild-shop-quote b { color: #8b5983; }.guild-shop-quote small { color: #927f93; }
.guild-shop-empty { padding: 28px 10px; color: #a193a0; text-align: center; font-size: 13px; }.guild-shop-subtle { color: #a0929f; font-size: 12px; }.guild-shop-error, .guild-shop-notice { margin: 0 0 12px; padding: 10px 12px; border-radius: 9px; font-size: 12px; line-height: 1.5; }.guild-shop-error { color: #a85761; background: #fff0ed; }.guild-shop-notice { color: #528163; background: #e9f6ec; }
button { border: 0; cursor: pointer; font: inherit; }button:disabled { opacity: .48; cursor: not-allowed; }button:focus-visible, input:focus-visible { outline: 3px solid #a675a1; outline-offset: 2px; }
@media (max-width: 720px) { .guild-shop-panel { width: 100%; height: 100%; border-radius: 14px; }.guild-shop-header { min-height: 64px; padding: 10px 12px; gap: 8px; }.guild-shop-emblem { flex-basis: 36px; width: 36px; height: 36px; font-size: 19px; }.guild-shop-title h2 { font-size: 15px; }.guild-shop-title small { font-size: 8px; }.guild-shop-balance { padding: 5px 7px; }.guild-shop-balance strong { font-size: 13px; }.guild-shop-balance small { font-size: 9px; }.guild-shop-body { padding: 13px 11px max(22px, env(safe-area-inset-bottom)); }.guild-shop-tabs { padding: 0 5px; }.guild-shop-tabs button { min-height: 42px; font-size: 12px; }.guild-shop-content { display: flex; flex-direction: column; }.guild-shop-results, .guild-shop-detail { width: 100%; }.guild-shop-detail { order: -1; }.guild-shop-item { padding: 9px; } }
@media (max-width: 370px) { .guild-shop-emblem { display: none; }.guild-shop-title h2 { font-size: 14px; }.guild-shop-balance { max-width: 70px; }.guild-shop-balance strong { overflow: hidden; text-overflow: ellipsis; }.guild-shop-search { gap: 5px; }.guild-shop-search button { padding: 8px 10px; }.guild-shop-item :deep(.inventory-art-wrap) { flex-basis: 37px; width: 37px; height: 37px; } }
</style>
