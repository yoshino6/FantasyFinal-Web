<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { userFacingErrorMessage } from '../api';
import * as bookshop from '../bookshop-api';
import type {
  BookshopBuyQuote, BookshopDetail, BookshopPage, BookshopPreview, BookshopSellQuote,
  BookshopSellableItem, BookshopShelfItem, BookshopSide, BookshopTarget
} from '../bookshop-api';
import InventoryItemIcon from './InventoryItemIcon.vue';

const props = defineProps<{ open: boolean; targetId: string; initialSide?: BookshopSide }>();
const emit = defineEmits<{ close: []; updated: [] }>();
type ActiveQuote = { side: BookshopSide; targetId: string; itemId: number; quantity: number; preview: BookshopPreview };

const closeButton = ref<HTMLButtonElement | null>(null);
const side = ref<BookshopSide>('buy');
const target = ref<BookshopTarget | null>(null);
const shelf = ref<BookshopPage<BookshopShelfItem> | null>(null);
const sellable = ref<BookshopPage<BookshopSellableItem> | null>(null);
const detail = ref<BookshopDetail | null>(null);
const selectedBuy = ref<BookshopShelfItem | null>(null);
const selectedSell = ref<BookshopSellableItem | null>(null);
const quantity = ref(1);
const buySearchDraft = ref('');
const buyKeyword = ref('');
const buyPage = ref(1);
const sellSearchDraft = ref('');
const sellKeyword = ref('');
const sellPage = ref(1);
const gateOpen = ref(false);
const loading = ref(false);
const detailLoading = ref(false);
const pending = ref(false);
const error = ref('');
const detailError = ref('');
const notice = ref('');
const activeQuote = ref<ActiveQuote | null>(null);
const retryConfirmation = ref(false);
const now = ref(Date.now());
let pageVersion = 0;
let detailVersion = 0;

const currentPage = computed(() => side.value === 'buy' ? shelf.value : sellable.value);
const copper = computed(() => side.value === 'buy'
  ? shelf.value?.copper ?? detail.value?.copper ?? sellable.value?.copper ?? null
  : sellable.value?.copper ?? shelf.value?.copper ?? null);
const detailItem = computed(() => {
  const current = detail.value;
  return current && current.item.id === selectedBuy.value?.id ? current.item : null;
});
const buyQuote = computed(() => activeQuote.value?.side === 'buy' ? activeQuote.value.preview.quote as BookshopBuyQuote : null);
const sellQuote = computed(() => activeQuote.value?.side === 'sell' ? activeQuote.value.preview.quote as BookshopSellQuote : null);
const quoteExpired = computed(() => activeQuote.value ? now.value >= new Date(activeQuote.value.preview.expiresAt).getTime() : false);

function amount(value: number | null | undefined) { return value == null ? '—' : value.toLocaleString('zh-CN'); }
function dateText(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN');
}
function close() { if (!pending.value && !retryConfirmation.value) emit('close'); }

async function loadPage() {
  if (!props.open || props.targetId !== bookshop.BOOKSHOP_TARGET_ID) return;
  const version = ++pageVersion;
  const requestedSide = side.value;
  const requestedTarget = props.targetId;
  loading.value = true;
  try {
    if (requestedSide === 'buy') {
      const result = await bookshop.bookshopShelf(requestedTarget, buyPage.value, buyKeyword.value);
      if (version !== pageVersion || !props.open || props.targetId !== requestedTarget || side.value !== requestedSide) return;
      shelf.value = result;
      target.value = result.target;
      buyPage.value = result.page;
      const updated = result.items.find(item => item.id === selectedBuy.value?.id);
      if (updated) selectedBuy.value = updated;
    } else {
      const result = await bookshop.bookshopSellable(requestedTarget, sellPage.value, sellKeyword.value);
      if (version !== pageVersion || !props.open || props.targetId !== requestedTarget || side.value !== requestedSide) return;
      sellable.value = result;
      target.value = result.target;
      sellPage.value = result.page;
      const updated = result.items.find(item => item.id === selectedSell.value?.id);
      if (updated) selectedSell.value = updated;
    }
    gateOpen.value = true;
  } catch (cause) {
    if (version === pageVersion) {
      gateOpen.value = false;
      error.value = userFacingErrorMessage(cause);
    }
  } finally {
    if (version === pageVersion) loading.value = false;
  }
}

async function loadDetail(itemId: number) {
  if (!props.open || props.targetId !== bookshop.BOOKSHOP_TARGET_ID) return;
  const version = ++detailVersion;
  detailLoading.value = true;
  detailError.value = '';
  detail.value = null;
  try {
    const result = await bookshop.bookshopItem(props.targetId, itemId);
    if (version !== detailVersion || !props.open || selectedBuy.value?.id !== itemId) return;
    detail.value = result;
  } catch (cause) {
    if (version === detailVersion) detailError.value = userFacingErrorMessage(cause);
  } finally {
    if (version === detailVersion) detailLoading.value = false;
  }
}

async function reload() {
  if (pending.value || retryConfirmation.value || loading.value) return;
  if (props.targetId !== bookshop.BOOKSHOP_TARGET_ID) { error.value = '请从探索地图的百味书屋目标进入。'; return; }
  error.value = '';
  await loadPage();
  if (gateOpen.value && side.value === 'buy' && selectedBuy.value) void loadDetail(selectedBuy.value.id);
}
function switchSide(next: BookshopSide) {
  if (pending.value || retryConfirmation.value || side.value === next) return;
  side.value = next;
  quantity.value = 1;
  activeQuote.value = null;
  retryConfirmation.value = false;
  error.value = '';
  notice.value = '';
  void loadPage();
}
function selectBuy(item: BookshopShelfItem) {
  if (pending.value || retryConfirmation.value) return;
  error.value = '';
  notice.value = '';
  selectedBuy.value = item;
  quantity.value = 1;
  activeQuote.value = null;
  retryConfirmation.value = false;
  void loadDetail(item.id);
}
function selectSell(item: BookshopSellableItem) {
  if (pending.value || retryConfirmation.value) return;
  error.value = '';
  notice.value = '';
  selectedSell.value = item;
  quantity.value = 1;
  activeQuote.value = null;
  retryConfirmation.value = false;
}
function search() {
  if (pending.value || retryConfirmation.value || loading.value) return;
  error.value = '';
  activeQuote.value = null;
  retryConfirmation.value = false;
  if (side.value === 'buy') {
    buyKeyword.value = buySearchDraft.value.trim();
    buyPage.value = 1;
    selectedBuy.value = null;
    detail.value = null;
    ++detailVersion;
  } else {
    sellKeyword.value = sellSearchDraft.value.trim();
    sellPage.value = 1;
    selectedSell.value = null;
  }
  void loadPage();
}
function changePage(next: number) {
  if (pending.value || retryConfirmation.value || loading.value || !currentPage.value || next < 1 || next > currentPage.value.totalPages || next === currentPage.value.page) return;
  error.value = '';
  activeQuote.value = null;
  retryConfirmation.value = false;
  if (side.value === 'buy') buyPage.value = next;
  else sellPage.value = next;
  void loadPage();
}
function validDraft() {
  const chosen = side.value === 'buy' ? selectedBuy.value : selectedSell.value;
  if (!chosen) throw new Error(`请先选择要${side.value === 'buy' ? '购买' : '出售'}的物品。`);
  if (!Number.isSafeInteger(quantity.value) || quantity.value < 1 || quantity.value > 999) throw new Error('数量必须是 1 至 999 的整数。');
  if (side.value === 'buy' && quantity.value > (chosen as BookshopShelfItem).stockQuantity) throw new Error(`当前库存仅剩 ${(chosen as BookshopShelfItem).stockQuantity} 本。`);
  if (side.value === 'sell' && quantity.value > (chosen as BookshopSellableItem).quantity) throw new Error(`背包仅有 ${(chosen as BookshopSellableItem).quantity} 本。`);
  return { side: side.value, itemId: chosen.id, quantity: quantity.value };
}

async function previewTrade() {
  if (pending.value || retryConfirmation.value || !gateOpen.value) return;
  let draft: ReturnType<typeof validDraft>;
  try { draft = validDraft(); } catch (cause) { error.value = userFacingErrorMessage(cause); return; }
  pending.value = true;
  error.value = '';
  notice.value = '';
  activeQuote.value = null;
  retryConfirmation.value = false;
  const requestedTarget = props.targetId;
  try {
    const preview = await bookshop.previewBookshopTrade(requestedTarget, draft.side, draft.itemId, draft.quantity);
    if (props.open && props.targetId === requestedTarget && side.value === draft.side) {
      now.value = Date.now();
      activeQuote.value = { ...draft, targetId: requestedTarget, preview };
    }
  } catch (cause) {
    if (props.open && props.targetId === requestedTarget) {
      const message = userFacingErrorMessage(cause);
      await loadPage();
      if (gateOpen.value && draft.side === 'buy' && selectedBuy.value?.id === draft.itemId) void loadDetail(draft.itemId);
      error.value = message;
    }
  } finally { pending.value = false; }
}

async function confirmTrade() {
  const current = activeQuote.value;
  if (!current || pending.value || !props.open) return;
  if (Date.now() >= new Date(current.preview.expiresAt).getTime() && !retryConfirmation.value) {
    activeQuote.value = null;
    retryConfirmation.value = false;
    error.value = '报价已过期，请重新预览。';
    return;
  }
  pending.value = true;
  error.value = '';
  notice.value = '';
  try {
    const response = await bookshop.confirmBookshopTrade(current.targetId, current.side,
      current.preview.token, current.preview.idempotencyKey);
    emit('updated');
    if (props.open && props.targetId === current.targetId) {
      activeQuote.value = null;
      retryConfirmation.value = false;
      notice.value = `${current.side === 'buy' ? '购买' : '出售'} ${response.result.name} ×${response.result.quantity} 已完成；${current.side === 'buy' ? '支出' : '获得'} ${amount(response.result.price)} 铜币。`;
      await loadPage();
      if (gateOpen.value && current.side === 'buy' && selectedBuy.value?.id === current.itemId) void loadDetail(current.itemId);
    }
  } catch (cause) {
    if (props.open && props.targetId === current.targetId) {
      const message = userFacingErrorMessage(cause);
      const retryable = /网络连接异常|暂时不可用|服务器返回内容异常|操作未完成|请求超时|状态码 408/.test(message);
      if (!retryable) activeQuote.value = null;
      retryConfirmation.value = retryable;
      await loadPage();
      if (gateOpen.value && current.side === 'buy' && selectedBuy.value?.id === current.itemId) void loadDetail(current.itemId);
      error.value = retryable ? `${message} 原确认凭据已保留；可核对铜币和背包后重试。`
        : `${message} 已重新读取书屋状态，请再次预览。`;
    }
  } finally { pending.value = false; }
}

watch(quantity, () => { if (!retryConfirmation.value) activeQuote.value = null; });
watch([() => props.open, () => props.targetId], async ([open, targetId], _old, onCleanup) => {
  ++pageVersion;
  ++detailVersion;
  const timer = open ? window.setInterval(() => { now.value = Date.now(); }, 1000) : null;
  onCleanup(() => { if (timer !== null) window.clearInterval(timer); });
  if (!open) { gateOpen.value = false; activeQuote.value = null; loading.value = false; return; }
  side.value = props.initialSide ?? 'buy';
  target.value = null;
  shelf.value = null;
  sellable.value = null;
  detail.value = null;
  selectedBuy.value = null;
  selectedSell.value = null;
  buyPage.value = 1;
  sellPage.value = 1;
  buyKeyword.value = '';
  sellKeyword.value = '';
  buySearchDraft.value = '';
  sellSearchDraft.value = '';
  activeQuote.value = null;
  retryConfirmation.value = false;
  gateOpen.value = false;
  error.value = '';
  notice.value = '';
  now.value = Date.now();
  await nextTick();
  if (!props.open || props.targetId !== targetId) return;
  closeButton.value?.focus();
  if (targetId !== bookshop.BOOKSHOP_TARGET_ID) { error.value = '请从探索地图的百味书屋目标进入。'; return; }
  void loadPage();
}, { immediate: true });
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="bookshop-backdrop" role="presentation" @click.self="close">
      <section class="bookshop-panel" role="dialog" aria-modal="true" aria-label="百味书屋" @keydown.esc="close">
        <header class="bookshop-header">
          <div class="bookshop-mark" aria-hidden="true">✦</div>
          <div class="bookshop-heading"><small>FLAVORS OF KNOWLEDGE · BOOKSHOP</small><h2>{{ target?.name ?? '百味书屋' }}</h2></div>
          <div v-if="copper !== null" class="bookshop-wallet"><small>持有铜币</small><strong>{{ amount(copper) }}</strong></div>
          <button class="bookshop-refresh" type="button" :disabled="pending || retryConfirmation || loading" @click="reload">刷新</button>
          <button ref="closeButton" class="bookshop-close" type="button" aria-label="关闭百味书屋" :disabled="pending || retryConfirmation" @click="close">×</button>
        </header>
        <nav class="bookshop-tabs" aria-label="书屋栏目"><button type="button" :class="{ active: side === 'buy' }" :disabled="pending || retryConfirmation" @click="switchSide('buy')">书屋货架</button><button type="button" :class="{ active: side === 'sell' }" :disabled="pending || retryConfirmation" @click="switchSide('sell')">出售书卷</button></nav>
        <div class="bookshop-body">
          <p v-if="notice" class="bookshop-notice" role="status">{{ notice }}</p>
          <p v-if="error" class="bookshop-error" role="alert">{{ error }}</p>
          <p v-if="retryConfirmation" class="bookshop-error" role="status">确认结果尚未确定，请用原凭据核对。核对完成前暂不能关闭；网络持续不可用时请保持页面打开，稍后重试。</p>
          <p v-if="loading && !gateOpen" class="bookshop-empty" role="status">正在读取书屋…</p>
          <button v-else-if="!gateOpen && !loading && targetId === bookshop.BOOKSHOP_TARGET_ID" class="bookshop-retry" type="button" @click="reload">重试连接</button>
          <template v-if="gateOpen">
            <p class="bookshop-intro">{{ side === 'buy' ? '货架显示当前单价；确认购买前会重新核对库存和铜币。' : '这里列出服务端允许提交报价的背包书卷；实际收购金额以报价为准。' }}</p>
            <form class="bookshop-search" @submit.prevent="search">
              <input v-if="side === 'buy'" v-model="buySearchDraft" type="search" maxlength="80" placeholder="搜索货架书籍" aria-label="搜索货架书籍" :disabled="pending" />
              <input v-else v-model="sellSearchDraft" type="search" maxlength="80" placeholder="搜索可出售书卷" aria-label="搜索可出售书卷" :disabled="pending" />
              <button type="submit" :disabled="pending || retryConfirmation || loading">搜索</button>
            </form>
            <div class="bookshop-content">
              <div class="bookshop-results">
                <p v-if="loading" class="bookshop-empty" role="status">正在更新列表…</p>
                <template v-else-if="side === 'buy'"><div v-if="shelf?.items.length" class="bookshop-list"><button v-for="item in shelf.items" :key="item.id" type="button" class="bookshop-item" :class="{ selected: selectedBuy?.id === item.id }" :disabled="pending || retryConfirmation" @click="selectBuy(item)"><InventoryItemIcon :name="item.name" :codex-id="item.codexId" :item-category="item.category" /><span><strong>{{ item.name }}</strong><small>{{ item.category }} · {{ amount(item.price) }} 铜币 / 本</small><small>库存 {{ amount(item.stockQuantity) }} · 已持有 {{ amount(item.ownedQuantity) }}</small></span><b aria-hidden="true">›</b></button></div><p v-else class="bookshop-empty">当前搜索下没有书籍。</p></template>
                <template v-else><div v-if="sellable?.items.length" class="bookshop-list"><button v-for="item in sellable.items" :key="item.id" type="button" class="bookshop-item" :class="{ selected: selectedSell?.id === item.id }" :disabled="pending || retryConfirmation" @click="selectSell(item)"><InventoryItemIcon :name="item.name" :item-category="item.category" /><span><strong>{{ item.name }}</strong><small>{{ item.category }} · 当前收购 {{ amount(item.price) }} 铜币 / 本</small><small>背包 {{ amount(item.quantity) }} 本</small></span><b aria-hidden="true">›</b></button></div><p v-else class="bookshop-empty">背包中没有符合搜索条件的可出售书卷。</p></template>
                <div v-if="currentPage" class="bookshop-pager"><button type="button" :disabled="pending || loading || currentPage.page <= 1" @click="changePage(currentPage.page - 1)">上一页</button><span>第 {{ currentPage.page }} / {{ currentPage.totalPages }} 页</span><button type="button" :disabled="pending || loading || currentPage.page >= currentPage.totalPages" @click="changePage(currentPage.page + 1)">下一页</button></div>
              </div>
              <aside class="bookshop-detail">
                <template v-if="side === 'buy' && selectedBuy">
                  <div class="bookshop-picked"><InventoryItemIcon :name="selectedBuy.name" :codex-id="selectedBuy.codexId" :item-category="selectedBuy.category" /><div><small>购买书籍</small><h3>{{ selectedBuy.name }}</h3></div></div>
                  <p v-if="detailLoading" class="bookshop-muted">正在读取详情…</p><p v-if="detailError" class="bookshop-error" role="alert">{{ detailError }}</p>
                  <template v-if="detailItem"><p class="bookshop-description">{{ detailItem.description || '暂无描述。' }}</p><dl class="bookshop-facts"><div><dt>类别</dt><dd>{{ detailItem.category }}</dd></div><div><dt>单价</dt><dd>{{ amount(detailItem.price) }} 铜币</dd></div><div><dt>库存</dt><dd>{{ amount(detailItem.stockQuantity) }} 本</dd></div><div><dt>已持有</dt><dd>{{ amount(detailItem.ownedQuantity) }} 本</dd></div></dl></template>
                  <label class="bookshop-quantity">购买数量<input v-model.number="quantity" type="number" min="1" :max="Math.min(999, selectedBuy.stockQuantity)" step="1" inputmode="numeric" :disabled="pending || retryConfirmation" /></label>
                  <button class="bookshop-primary" type="button" :disabled="pending || retryConfirmation || loading || selectedBuy.stockQuantity < 1" @click="previewTrade">预览真实报价</button>
                </template>
                <template v-else-if="side === 'sell' && selectedSell">
                  <div class="bookshop-picked"><InventoryItemIcon :name="selectedSell.name" :item-category="selectedSell.category" /><div><small>出售书卷</small><h3>{{ selectedSell.name }}</h3></div></div>
                  <dl class="bookshop-facts"><div><dt>背包数量</dt><dd>{{ amount(selectedSell.quantity) }} 本</dd></div><div><dt>当前单件收购</dt><dd>{{ amount(selectedSell.price) }} 铜币</dd></div></dl>
                  <label class="bookshop-quantity">出售数量<input v-model.number="quantity" type="number" min="1" :max="Math.min(999, selectedSell.quantity)" step="1" inputmode="numeric" :disabled="pending || retryConfirmation" /></label>
                  <button class="bookshop-primary" type="button" :disabled="pending || retryConfirmation || loading" @click="previewTrade">预览真实报价</button>
                </template>
                <p v-else class="bookshop-empty">从{{ side === 'buy' ? '货架' : '可售背包' }}选择一本书。</p>

                <div v-if="activeQuote && activeQuote.side === side" class="bookshop-quote">
                  <strong>{{ side === 'buy' ? '确认购书' : '确认出售' }}</strong>
                  <p>{{ activeQuote.preview.quote.name }} ×{{ activeQuote.preview.quote.quantity }} · 单件 {{ amount(activeQuote.preview.quote.unitPrice) }} 铜币</p>
                  <p>{{ side === 'buy' ? '支出' : '获得' }} <b>{{ amount(activeQuote.preview.quote.price) }}</b> 铜币</p>
                  <p>铜币 {{ amount(activeQuote.preview.quote.copperBefore) }} → {{ amount(activeQuote.preview.quote.copperAfter) }}</p>
                  <p v-if="buyQuote">库存 {{ amount(buyQuote.stockBefore) }} → {{ amount(buyQuote.stockAfter) }} · {{ buyQuote.personalBound ? '购入后个人绑定' : '购入后可交易' }}</p>
                  <p v-if="sellQuote">背包 {{ amount(sellQuote.ownedBefore) }} → {{ amount(sellQuote.ownedAfter) }} 本</p>
                  <small>报价有效至 {{ dateText(activeQuote.preview.expiresAt) }}；确认时服务器会重新校验。</small>
                  <button class="bookshop-primary" type="button" :disabled="pending || (quoteExpired && !retryConfirmation) || !gateOpen" @click="confirmTrade">{{ retryConfirmation ? '用原凭据核对结果' : `明确确认${side === 'buy' ? '购买' : '出售'}` }}</button>
                  <p v-if="quoteExpired" class="bookshop-error" role="alert">{{ retryConfirmation ? '报价已过期；原确认凭据仅能回读已完成结果。' : '报价已过期，请重新预览。' }}</p>
                </div>
              </aside>
            </div>
          </template>
          <div v-if="!gateOpen && retryConfirmation && activeQuote" class="bookshop-quote">
            <strong>书屋确认结果待核对</strong>
            <p>原确认请求已发出。可用同一凭据核对结果；未完成的过期请求不会执行。</p>
            <button class="bookshop-primary" type="button" :disabled="pending" @click="confirmTrade">用原凭据核对结果</button>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.bookshop-backdrop { position: fixed; z-index: 98; inset: 0; display: grid; place-items: center; padding: max(10px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left)); background: #2b2633a8; backdrop-filter: blur(5px); }
.bookshop-panel { display: flex; flex-direction: column; width: min(980px, 100%); height: min(780px, 100%); min-height: 0; overflow: hidden; color: #4b3f4c; background: #fffdf8; border: 1px solid #efe7d9; border-radius: 21px; box-shadow: 0 25px 75px #241b2866; }
.bookshop-header { display: flex; align-items: center; gap: 11px; min-height: 77px; padding: 13px 19px; background: linear-gradient(110deg, #f9f0e5, #fff8ed 55%, #f6f0f8); border-bottom: 1px solid #ece3df; }.bookshop-mark { display: grid; place-items: center; flex: 0 0 43px; width: 43px; height: 43px; color: #fff5dc; background: linear-gradient(140deg, #b38b5d, #8e709b); border-radius: 12px; font-size: 22px; box-shadow: 0 5px 13px #8e709b44; }.bookshop-heading { flex: 1; min-width: 0; }.bookshop-heading small { color: #a78f91; font-size: 10px; letter-spacing: .09em; }.bookshop-heading h2 { margin: 3px 0 0; color: #5d4554; font-size: 20px; }.bookshop-wallet { display: grid; gap: 2px; padding: 6px 10px; color: #805e39; background: #fff0d1; border-radius: 9px; white-space: nowrap; }.bookshop-wallet small { font-size: 10px; }.bookshop-wallet strong { font-size: 16px; }.bookshop-refresh, .bookshop-close { flex: none; color: #806c79; background: #fffaf9; border: 1px solid #e5d9df; border-radius: 9px; }.bookshop-refresh { min-height: 35px; padding: 6px 11px; font-size: 12px; }.bookshop-close { width: 35px; height: 35px; font-size: 22px; line-height: 1; }
.bookshop-tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); flex: none; padding: 0 17px; background: white; border-bottom: 1px solid #eee7e1; }.bookshop-tabs button { min-height: 44px; color: #968692; background: none; border: 0; border-bottom: 3px solid transparent; font-size: 13px; }.bookshop-tabs button.active { color: #8a675c; border-bottom-color: #b9946d; font-weight: 800; }
.bookshop-body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 17px 20px max(24px, env(safe-area-inset-bottom)); }.bookshop-intro { margin: 0 0 13px; color: #8e828a; font-size: 12px; line-height: 1.55; }.bookshop-search { display: flex; gap: 8px; margin-bottom: 15px; }.bookshop-search input, .bookshop-quantity input { min-height: 38px; padding: 8px 10px; color: #50404e; background: white; border: 1px solid #ddd0d7; border-radius: 9px; font: inherit; font-size: 13px; }.bookshop-search input { flex: 1; min-width: 0; }.bookshop-search button, .bookshop-primary { min-height: 38px; padding: 8px 14px; color: white; background: #a47a65; border-radius: 9px; font-size: 12px; font-weight: 800; }.bookshop-retry { display: block; min-height: 37px; margin: 12px auto; padding: 8px 16px; color: #8d6e5b; background: #f8eadc; border-radius: 9px; font-size: 12px; }
.bookshop-content { display: grid; grid-template-columns: minmax(0, 1fr) minmax(255px, 330px); gap: 15px; align-items: start; }.bookshop-results { min-width: 0; }.bookshop-list { display: grid; gap: 8px; }.bookshop-item { display: flex; align-items: center; gap: 10px; width: 100%; min-width: 0; padding: 11px; color: inherit; text-align: left; background: #fff; border: 1px solid #e9ded9; border-radius: 12px; box-shadow: 0 3px 10px #794f4a0d; }.bookshop-item:hover, .bookshop-item.selected { border-color: #cbab91; background: #fffaf5; }.bookshop-item :deep(.inventory-art-wrap), .bookshop-picked :deep(.inventory-art-wrap) { flex: 0 0 44px; width: 44px; height: 44px; margin: 0; background: #f9efe7; border-radius: 10px; }.bookshop-item :deep(.inventory-item-image), .bookshop-picked :deep(.inventory-item-image) { width: 40px; height: 40px; }.bookshop-item > span { display: grid; gap: 3px; flex: 1; min-width: 0; overflow-wrap: anywhere; }.bookshop-item strong { color: #624c51; font-size: 13px; }.bookshop-item small { color: #918289; font-size: 11px; }.bookshop-item b { color: #ba9685; font-size: 21px; font-weight: 400; }
.bookshop-pager { display: flex; align-items: center; justify-content: center; gap: 12px; margin: 16px 0; color: #94868d; font-size: 12px; }.bookshop-pager button { min-height: 34px; padding: 7px 10px; color: #866d60; background: #f6ede4; border-radius: 8px; }
.bookshop-detail { min-width: 0; padding: 16px; background: #fff; border: 1px solid #e8deda; border-radius: 13px; box-shadow: 0 4px 13px #775e5110; }.bookshop-picked { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }.bookshop-picked div { min-width: 0; }.bookshop-picked small { color: #a38f94; font-size: 11px; }.bookshop-picked h3 { margin: 2px 0; color: #604c58; font-size: 16px; overflow-wrap: anywhere; }.bookshop-description { margin: 9px 0 13px; color: #857983; font-size: 12px; line-height: 1.55; }.bookshop-facts { margin: 10px 0; }.bookshop-facts div { display: flex; justify-content: space-between; gap: 8px; padding: 7px 0; border-top: 1px solid #f1eae7; font-size: 12px; }.bookshop-facts dt { color: #a09499; }.bookshop-facts dd { margin: 0; color: #705c65; text-align: right; }.bookshop-quantity { display: grid; gap: 5px; margin-top: 13px; color: #786a72; font-size: 12px; }.bookshop-quantity input { width: 100%; }.bookshop-detail .bookshop-primary { width: 100%; margin-top: 11px; }
.bookshop-quote { display: grid; gap: 5px; margin-top: 16px; padding: 13px; color: #675766; background: #fbf3e8; border: 1px solid #eaddca; border-radius: 11px; font-size: 12px; line-height: 1.5; }.bookshop-quote > strong { color: #846043; font-size: 14px; }.bookshop-quote p { margin: 0; }.bookshop-quote b { color: #a16f4b; }.bookshop-quote small { color: #978473; }.bookshop-empty { padding: 30px 10px; color: #a2969c; text-align: center; font-size: 13px; }.bookshop-muted { color: #9c8f97; font-size: 12px; }.bookshop-error, .bookshop-notice { margin: 0 0 12px; padding: 10px 12px; border-radius: 9px; font-size: 12px; line-height: 1.5; }.bookshop-error { color: #a95c5d; background: #fff0eb; }.bookshop-notice { color: #548266; background: #ecf8ee; }
button { border: 0; cursor: pointer; font: inherit; }button:disabled { opacity: .48; cursor: not-allowed; }button:focus-visible, input:focus-visible { outline: 3px solid #b38b5d; outline-offset: 2px; }
@media (max-width: 720px) { .bookshop-panel { width: 100%; height: 100%; border-radius: 14px; }.bookshop-header { min-height: 63px; padding: 10px 11px; gap: 7px; }.bookshop-mark { flex-basis: 35px; width: 35px; height: 35px; font-size: 18px; }.bookshop-heading small { font-size: 8px; }.bookshop-heading h2 { font-size: 16px; }.bookshop-wallet { padding: 5px 7px; }.bookshop-wallet small { font-size: 9px; }.bookshop-wallet strong { font-size: 12px; }.bookshop-refresh { padding: 6px 8px; font-size: 11px; }.bookshop-tabs { padding: 0 5px; }.bookshop-body { padding: 13px 11px max(22px, env(safe-area-inset-bottom)); }.bookshop-content { display: flex; flex-direction: column; }.bookshop-results, .bookshop-detail { width: 100%; }.bookshop-detail { order: -1; }.bookshop-item { padding: 9px; } }
@media (max-width: 370px) { .bookshop-mark { display: none; }.bookshop-wallet { max-width: 66px; }.bookshop-wallet strong { overflow: hidden; text-overflow: ellipsis; }.bookshop-heading h2 { font-size: 14px; }.bookshop-refresh { padding: 5px; }.bookshop-item :deep(.inventory-art-wrap) { flex-basis: 37px; width: 37px; height: 37px; } }
</style>
