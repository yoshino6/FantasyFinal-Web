<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { userFacingErrorMessage } from '../api';
import InventoryItemIcon from './InventoryItemIcon.vue';
import * as market from '../market-api';
import type {
  MarketAccess, MarketCatalog, MarketItemDetail, MarketListing, MarketOrderPage,
  MarketPreview, MarketQuote, MarketCancelQuote, MarketSellable, MarketSellableItem,
  MarketSide, MarketSort, MarketTradePage, MarketTradable, MarketTradables, MarketType
} from '../market-api';

const props = withDefaults(defineProps<{ open: boolean; inline?: boolean }>(), { inline: false });
const emit = defineEmits<{ close: []; updated: []; 'pending-change': [pending: boolean] }>();
type Tab = 'browse' | 'listings' | 'buy' | 'orders';
const tabs: { id: Tab; label: string }[] = [
  { id: 'browse', label: '浏览挂单' }, { id: 'listings', label: '我的挂单' },
  { id: 'buy', label: '求购' }, { id: 'orders', label: '订单' }
];
const fallbackTypes: MarketType[] = ['全部', '怪材', '锻材', '炼材', '粒子', '药剂', '食物', '其他'];
const sortLabels: Record<MarketSort, string> = { price_asc: '卖价从低到高', price_desc: '卖价从高到低', newest: '最近上架' };
const closeButton = ref<HTMLButtonElement | null>(null);
const now = ref(Date.now());
const tab = ref<Tab>('browse');
const listingView = ref<'active' | 'new'>('active');
const ordersView = ref<'orders' | 'trades'>('orders');
const access = ref<MarketAccess | null>(null);
const accessLoading = ref(false);
const loading = ref(false);
const pending = ref(false);
const error = ref('');
const notice = ref('');
const catalog = ref<MarketCatalog | null>(null);
const tradables = ref<MarketTradables | null>(null);
const sellable = ref<MarketSellable | null>(null);
const listings = ref<MarketListing[] | null>(null);
const orderPage = ref<MarketOrderPage | null>(null);
const tradePage = ref<MarketTradePage | null>(null);
const browseType = ref<MarketType>('全部');
const browseSort = ref<MarketSort>('price_asc');
const browseSearch = ref('');
const browseDraft = ref('');
const browsePage = ref(1);
const sellSearch = ref('');
const sellDraft = ref('');
const sellPage = ref(1);
const buyType = ref<MarketType>('全部');
const buySearch = ref('');
const buyDraft = ref('');
const buyPage = ref(1);
const ordersPageNumber = ref(1);
const tradesPageNumber = ref(1);
const selectedDetailId = ref<number | null>(null);
const detail = ref<MarketItemDetail | null>(null);
const detailLoading = ref(false);
const detailError = ref('');
const chosenSell = ref<MarketSellableItem | null>(null);
const chosenBuy = ref<MarketTradable | null>(null);
const unitPrice = ref(1);
const quantity = ref(1);
const orderQuote = ref<MarketPreview<MarketQuote> | null>(null);
const cancelQuote = ref<(MarketPreview<MarketCancelQuote> & { orderId: number; name: string }) | null>(null);
const uncertainOrderToken = ref<string | null>(null);
const uncertainCancelToken = ref<string | null>(null);
let loadVersion = 0;
let detailVersion = 0;

const types = computed(() => access.value?.types ?? fallbackTypes);
const sorts = computed(() => access.value?.sorts ?? ['price_asc', 'price_desc', 'newest'] as MarketSort[]);
const side = computed<MarketSide | null>(() => tab.value === 'listings' && listingView.value === 'new' ? 'sell' : tab.value === 'buy' ? 'buy' : null);
const chosenItem = computed(() => side.value === 'sell' ? chosenSell.value : side.value === 'buy' ? chosenBuy.value : null);
const currentPage = computed(() => tab.value === 'browse' ? catalog.value
  : tab.value === 'listings' && listingView.value === 'new' ? sellable.value
    : tab.value === 'buy' ? tradables.value
      : tab.value === 'orders' && ordersView.value === 'orders' ? orderPage.value
        : tab.value === 'orders' && ordersView.value === 'trades' ? tradePage.value : null);
const walletCopper = computed(() => tab.value === 'browse' ? catalog.value?.copper ?? null
  : tab.value === 'buy' ? tradables.value?.copper ?? null
    : tab.value === 'orders' && ordersView.value === 'orders' ? orderPage.value?.copper ?? null : null);
const quoteExpired = computed(() => orderQuote.value ? now.value >= new Date(orderQuote.value.expiresAt).getTime() : false);
const cancelExpired = computed(() => cancelQuote.value ? now.value >= new Date(cancelQuote.value.expiresAt).getTime() : false);
const canRetryOrder = computed(() => Boolean(orderQuote.value && uncertainOrderToken.value === orderQuote.value.token));
const canRetryCancel = computed(() => Boolean(cancelQuote.value && uncertainCancelToken.value === cancelQuote.value.token));
const resolutionPending = computed(() => pending.value || canRetryOrder.value || canRetryCancel.value);
watch(resolutionPending, value => emit('pending-change', value), { immediate: true });
const detailMatchesDraft = computed(() => detail.value?.id === chosenItem.value?.id);
function requestClose() { if (!resolutionPending.value) emit('close'); }
function dismissCancelQuote() { if (!resolutionPending.value) cancelQuote.value = null; }

async function loadAccess() {
  accessLoading.value = true;
  try { access.value = await market.marketAccess(); }
  catch (cause) { access.value = null; error.value = userFacingErrorMessage(cause); }
  finally { accessLoading.value = false; }
}

async function loadTab() {
  if (!props.open || !access.value?.canTrade) return;
  const version = ++loadVersion;
  loading.value = true;
  try {
    if (tab.value === 'browse') {
      const result = await market.marketCatalog(browsePage.value, browseType.value, browseSearch.value, browseSort.value);
      if (version === loadVersion) { catalog.value = result; browsePage.value = result.page; }
    } else if (tab.value === 'listings') {
      if (listingView.value === 'active') {
        const result = await market.marketListings();
        if (version === loadVersion) listings.value = result;
      } else {
        const result = await market.marketSellable(sellPage.value, sellSearch.value);
        if (version === loadVersion) { sellable.value = result; sellPage.value = result.page; }
      }
    } else if (tab.value === 'buy') {
      const result = await market.marketTradables(buyPage.value, buyType.value, buySearch.value);
      if (version === loadVersion) { tradables.value = result; buyPage.value = result.page; }
    } else if (ordersView.value === 'orders') {
      const result = await market.marketOrders(ordersPageNumber.value);
      if (version === loadVersion) { orderPage.value = result; ordersPageNumber.value = result.page; }
    } else {
      const result = await market.marketTrades(tradesPageNumber.value);
      if (version === loadVersion) { tradePage.value = result; tradesPageNumber.value = result.page; }
    }
  } catch (cause) {
    if (version === loadVersion) error.value = userFacingErrorMessage(cause);
  } finally {
    if (version === loadVersion) loading.value = false;
  }
}

async function refreshState() {
  await loadAccess();
  if (access.value?.canTrade) await loadTab();
  if (selectedDetailId.value && access.value?.canTrade) void showDetail(selectedDetailId.value);
}

watch(() => props.open, async (open, _previous, onCleanup) => {
  ++loadVersion; ++detailVersion;
  if (!open) { cancelQuote.value = null; return; }
  now.value = Date.now();
  const interval = window.setInterval(() => { now.value = Date.now(); }, 1000);
  onCleanup(() => window.clearInterval(interval));
  error.value = ''; notice.value = '';
  await nextTick(); closeButton.value?.focus();
  await loadAccess();
  if (access.value?.canTrade) void loadTab();
}, { immediate: true });

watch([side, () => chosenSell.value?.id, () => chosenBuy.value?.id, unitPrice, quantity], () => {
  if (!canRetryOrder.value) orderQuote.value = null;
});

function switchTab(next: Tab) {
  if (tab.value === next || resolutionPending.value) return;
  tab.value = next; error.value = ''; notice.value = ''; closeDetail(); cancelQuote.value = null;
  void loadTab();
}
function switchListingView(next: 'active' | 'new') {
  if (listingView.value === next || resolutionPending.value) return;
  listingView.value = next; error.value = ''; closeDetail(); void loadTab();
}
function switchOrdersView(next: 'orders' | 'trades') {
  if (ordersView.value === next || resolutionPending.value) return;
  ordersView.value = next; error.value = ''; closeDetail(); void loadTab();
}
function changePage(next: number) {
  if (resolutionPending.value || loading.value || !currentPage.value || next < 1 || next > currentPage.value.totalPages || next === currentPage.value.page) return;
  if (tab.value === 'browse') browsePage.value = next;
  else if (tab.value === 'listings') sellPage.value = next;
  else if (tab.value === 'buy') buyPage.value = next;
  else if (ordersView.value === 'orders') ordersPageNumber.value = next;
  else tradesPageNumber.value = next;
  void loadTab();
}
function searchBrowse() { if (resolutionPending.value) return; browseSearch.value = browseDraft.value.trim(); browsePage.value = 1; closeDetail(); void loadTab(); }
function searchSell() { if (resolutionPending.value) return; sellSearch.value = sellDraft.value.trim(); sellPage.value = 1; closeDetail(); void loadTab(); }
function searchBuy() { if (resolutionPending.value) return; buySearch.value = buyDraft.value.trim(); buyPage.value = 1; closeDetail(); void loadTab(); }
function changeBrowseType(type: MarketType) { if (resolutionPending.value) return; browseType.value = type; browsePage.value = 1; closeDetail(); void loadTab(); }
function changeBuyType(type: MarketType) { if (resolutionPending.value) return; buyType.value = type; buyPage.value = 1; closeDetail(); void loadTab(); }
function changeSort(sort: MarketSort) { if (resolutionPending.value) return; browseSort.value = sort; browsePage.value = 1; void loadTab(); }

function closeDetail() { ++detailVersion; selectedDetailId.value = null; detail.value = null; detailError.value = ''; detailLoading.value = false; }
async function showDetail(itemId: number) {
  const version = ++detailVersion;
  selectedDetailId.value = itemId; detail.value = null; detailError.value = ''; detailLoading.value = true;
  try {
    const result = await market.marketItemDetail(itemId);
    if (version === detailVersion) detail.value = result;
  } catch (cause) {
    if (version === detailVersion) detailError.value = userFacingErrorMessage(cause);
  } finally {
    if (version === detailVersion) detailLoading.value = false;
  }
}
function chooseSell(item: MarketSellableItem) {
  if (resolutionPending.value) return;
  chosenSell.value = item; unitPrice.value = item.reference; quantity.value = 1;
  void showDetail(item.id);
}
function chooseBuy(item: MarketTradable) {
  if (resolutionPending.value) return;
  chosenBuy.value = item; unitPrice.value = item.reference; quantity.value = 1;
  void showDetail(item.id);
}

function validDraft() {
  const item = chosenItem.value;
  if (!side.value || !item) throw new Error(`请先选择${side.value === 'sell' ? '寄售' : '求购'}物品。`);
  if (!Number.isSafeInteger(unitPrice.value) || unitPrice.value < 1 || unitPrice.value > 99999999) throw new Error('单价须为 1 至 99999999 的整数。');
  if (!Number.isSafeInteger(quantity.value) || quantity.value < 1 || quantity.value > 999) throw new Error('数量须为 1 至 999 的整数。');
  if (side.value === 'sell' && quantity.value > (item as MarketSellableItem).quantity) throw new Error('寄售数量超过可交易的未绑定库存。');
  if (side.value === 'buy' && quantity.value > (item as MarketTradable).stackLimit) throw new Error('求购数量超过该物品的堆叠上限。');
  return { side: side.value, itemId: item.id, price: unitPrice.value, quantity: quantity.value };
}

async function previewOrder() {
  if (resolutionPending.value) return;
  let draft: ReturnType<typeof validDraft>;
  try { draft = validDraft(); } catch (cause) { error.value = userFacingErrorMessage(cause); return; }
  pending.value = true; error.value = ''; notice.value = ''; orderQuote.value = null;
  try { orderQuote.value = await market.previewMarketOrder(draft.side, draft.itemId, draft.price, draft.quantity); }
  catch (cause) { error.value = userFacingErrorMessage(cause); await refreshState(); }
  finally { pending.value = false; }
}

async function confirmOrder() {
  const preview = orderQuote.value;
  if (!preview || pending.value) return;
  if (Date.now() >= new Date(preview.expiresAt).getTime() && !canRetryOrder.value) { error.value = '报价已过期，请重新预览。'; orderQuote.value = null; return; }
  pending.value = true; error.value = ''; notice.value = '';
  try {
    const response = await market.confirmMarketOrder(preview.token, preview.idempotencyKey);
    uncertainOrderToken.value = null;
    orderQuote.value = null;
    notice.value = `${response.result.side === 'sell' ? '寄售' : '求购'}订单 #${response.result.orderId} 已提交${response.result.matchedQuantity ? `，已撮合 ${response.result.matchedQuantity} 件` : ''}。`;
    emit('updated');
    await refreshState();
  } catch (cause) {
    const message = userFacingErrorMessage(cause);
    const uncertain = /网络连接异常|暂时不可用|服务器返回内容异常|操作未完成|请求超时|状态码 408/.test(message);
    uncertainOrderToken.value = uncertain ? preview.token : null;
    error.value = uncertain ? `${message} 请先查看订单；可用原凭据安全核对结果。` : message;
    if (!uncertain) orderQuote.value = null;
    await refreshState();
  } finally { pending.value = false; }
}

async function previewCancel(orderId: number, name: string) {
  if (resolutionPending.value) return;
  pending.value = true; error.value = ''; cancelQuote.value = null;
  try { cancelQuote.value = { ...await market.previewMarketCancel(orderId), orderId, name }; }
  catch (cause) { error.value = userFacingErrorMessage(cause); await refreshState(); }
  finally { pending.value = false; }
}

async function confirmCancel() {
  const preview = cancelQuote.value;
  if (!preview || pending.value) return;
  if (Date.now() >= new Date(preview.expiresAt).getTime() && !canRetryCancel.value) { error.value = '撤单预览已过期，请重新获取。'; cancelQuote.value = null; return; }
  pending.value = true; error.value = '';
  try {
    const response = await market.confirmMarketCancel(preview.orderId, preview.token, preview.idempotencyKey);
    uncertainCancelToken.value = null;
    cancelQuote.value = null;
    notice.value = `订单 #${response.result.orderId} 已撤销${response.result.fee ? `，手续费 ${response.result.fee} 铜币` : ''}。`;
    emit('updated');
    await refreshState();
  } catch (cause) {
    const message = userFacingErrorMessage(cause);
    const uncertain = /网络连接异常|暂时不可用|服务器返回内容异常|操作未完成|请求超时|状态码 408/.test(message);
    uncertainCancelToken.value = uncertain ? preview.token : null;
    error.value = uncertain ? `${message} 请先核对订单状态；可用原凭据安全核对结果。` : message;
    if (!uncertain) cancelQuote.value = null;
    await refreshState();
  } finally { pending.value = false; }
}

function dateText(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN');
}
function orderStatus(value: string) {
  return ({ open: '挂单中', partial: '部分成交', filled: '已成交', cancelled: '已撤单', expired: '已到期' } as Record<string, string>)[value] ?? value;
}
function numberText(value: number | null | undefined) { return value === null || value === undefined ? '—' : value.toLocaleString('zh-CN'); }
function canCancel(order: { status: string; remaining: number }) { return (order.status === 'open' || order.status === 'partial') && order.remaining > 0; }
</script>

<template>
  <Teleport to="body" :disabled="inline">
    <div v-if="open" class="market-backdrop" :class="{ inline }" role="presentation" @click.self="!inline && requestClose()">
      <section class="market-panel" :class="{ inline }" :role="inline ? 'region' : 'dialog'" :aria-modal="inline ? undefined : 'true'" aria-label="万叶联市" @keydown.esc="requestClose">
        <header class="market-header"><div class="market-emblem" aria-hidden="true">✦</div><div class="market-title"><small>WORLD MARKET · 万叶联会</small><h2>万叶联市</h2></div><span v-if="walletCopper !== null" class="wallet">铜币 {{ numberText(walletCopper) }}</span><button ref="closeButton" class="close-button" type="button" aria-label="关闭万叶联市" :disabled="resolutionPending" @click="requestClose">×</button></header>
        <nav class="market-tabs" aria-label="市场栏目"><button v-for="entry in tabs" :key="entry.id" type="button" :class="{ active: tab === entry.id }" :disabled="resolutionPending" @click="switchTab(entry.id)">{{ entry.label }}</button></nav>
        <div class="market-body">
          <p v-if="notice" class="notice" role="status">{{ notice }}</p><p v-if="error" class="error" role="alert">{{ error }}</p>
          <p v-if="canRetryOrder || canRetryCancel" class="error" role="status">确认结果尚未确定，请用原凭据核对。核对完成前暂不能离开或修改报价；网络持续不可用时请保持页面打开，稍后重试。</p>
          <p v-if="accessLoading" class="empty" role="status">正在连接联市…</p>
          <div v-else-if="access && !access.canTrade" class="locked"><span aria-hidden="true">✧</span><h3>联市尚未开放</h3><p>{{ access.reason }}</p></div>
          <template v-else-if="access?.canTrade">
            <template v-if="tab === 'browse'">
              <p class="intro">浏览当前公开挂单。卖价与求购价会随订单变化，实际报价以预览为准。</p>
              <div class="filters"><label>分类<select :value="browseType" :disabled="loading || pending" @change="changeBrowseType(($event.target as HTMLSelectElement).value as MarketType)"><option v-for="type in types" :key="type" :value="type">{{ type }}</option></select></label><label>排序<select :value="browseSort" :disabled="loading || pending" @change="changeSort(($event.target as HTMLSelectElement).value as MarketSort)"><option v-for="sort in sorts" :key="sort" :value="sort">{{ sortLabels[sort] }}</option></select></label><form class="search" @submit.prevent="searchBrowse"><input v-model="browseDraft" maxlength="80" type="search" placeholder="搜索物品名称" aria-label="搜索挂单物品" /><button type="submit" :disabled="loading || pending">搜索</button></form></div>
              <div class="content-grid"><div class="result-column"><div v-if="!loading && catalog?.items.length" class="item-list"><button v-for="item in catalog.items" :key="item.id" class="item-card" type="button" @click="showDetail(item.id)"><InventoryItemIcon :name="item.name" :item-category="item.category" /><span class="item-copy"><strong>{{ item.name }}</strong><small>{{ item.category }} · 参考 {{ numberText(item.reference) }} 铜币</small><span>最低卖价 <b>{{ numberText(item.lowestSell) }}</b> · 在售 {{ item.sellQuantity }} 件</span><span>最高求购 <b>{{ numberText(item.highestBuy) }}</b> · 求购 {{ item.buyQuantity }} 件</span></span><span class="chevron">›</span></button></div><p v-else-if="!loading && !error" class="empty">当前筛选下没有公开挂单。</p></div>
                <aside v-if="selectedDetailId" class="detail-card"><button class="detail-close" type="button" @click="closeDetail">收起详情 ×</button><p v-if="detailLoading" class="empty">正在读取商品…</p><p v-if="detailError" class="error">{{ detailError }}</p><template v-if="detail"><InventoryItemIcon :name="detail.name" :item-category="detail.category" /><small>{{ detail.category }}</small><h3>{{ detail.name }}</h3><p>{{ detail.description || '暂无物品描述。' }}</p><dl><div><dt>参考价</dt><dd>{{ numberText(detail.reference) }} 铜币</dd></div><div><dt>挂单范围</dt><dd>{{ numberText(detail.band.min) }}～{{ numberText(detail.band.max) }} 铜币</dd></div><div><dt>最低卖价</dt><dd>{{ numberText(detail.lowestSell) }}</dd></div><div><dt>最高求购</dt><dd>{{ numberText(detail.highestBuy) }}</dd></div><div><dt>近 24 小时成交</dt><dd>{{ detail.volume }} 件</dd></div></dl></template></aside>
              </div>
            </template>

            <template v-else-if="tab === 'listings'">
              <div class="subtabs"><button type="button" :class="{ active: listingView === 'active' }" :disabled="pending" @click="switchListingView('active')">进行中的寄售</button><button type="button" :class="{ active: listingView === 'new' }" :disabled="pending" @click="switchListingView('new')">发布寄售</button></div>
              <template v-if="listingView === 'active'"><p class="intro">这里仅列出仍在进行中的寄售。已结束的订单可在「订单」查看。</p><div v-if="!loading && listings?.length" class="item-list"><article v-for="entry in listings" :key="entry.id" class="item-card order-card"><button type="button" class="item-link" @click="showDetail(entry.itemId)"><InventoryItemIcon :name="entry.name" :item-category="entry.category" /><span class="item-copy"><strong>{{ entry.name }}</strong><small>寄售 #{{ entry.id }} · {{ orderStatus(entry.status) }}</small><span>{{ numberText(entry.price) }} 铜币 / 件 · 剩余 {{ entry.remaining }} / {{ entry.total }}</span><span>到期 {{ dateText(entry.expiresAt) }}</span></span></button><button v-if="canCancel(entry)" class="subtle-button" type="button" :disabled="pending" @click="previewCancel(entry.id, entry.name)">预览撤单</button></article></div><p v-else-if="!loading && !error" class="empty">目前没有进行中的寄售。</p></template>
              <template v-else><p class="intro">选择背包里可交易的未绑定物品。预览会核对库存、价格区间、额度与手续费。</p><form class="search narrow-search" @submit.prevent="searchSell"><input v-model="sellDraft" maxlength="80" type="search" placeholder="搜索可寄售物品" aria-label="搜索可寄售物品" /><button type="submit" :disabled="loading || pending">搜索</button></form><div class="content-grid"><div class="result-column"><div v-if="!loading && sellable?.items.length" class="item-list"><button v-for="item in sellable.items" :key="item.id" class="item-card" :class="{ chosen: chosenSell?.id === item.id }" type="button" :disabled="resolutionPending" @click="chooseSell(item)"><InventoryItemIcon :name="item.name" :item-category="item.category" /><span class="item-copy"><strong>{{ item.name }}</strong><small>{{ item.category }} · 参考 {{ numberText(item.reference) }} 铜币</small><span>未绑定可寄售 {{ item.quantity }} 件</span></span><span class="chevron">{{ chosenSell?.id === item.id ? '✓' : '›' }}</span></button></div><p v-else-if="!loading && !error" class="empty">背包中没有可寄售的未绑定物品。</p></div><aside class="detail-card composer"><h3>寄售报价</h3><template v-if="chosenSell"><div class="chosen-name"><InventoryItemIcon :name="chosenSell.name" :item-category="chosenSell.category" /><span><strong>{{ chosenSell.name }}</strong><small>可寄售 {{ chosenSell.quantity }} 件</small></span></div><p v-if="detailMatchesDraft && detail" class="range-hint">允许单价 {{ numberText(detail.band.min) }}～{{ numberText(detail.band.max) }} 铜币</p><label>单价（铜币）<input v-model.number="unitPrice" type="number" min="1" max="99999999" step="1" inputmode="numeric" :disabled="resolutionPending" /></label><label>数量<input v-model.number="quantity" type="number" min="1" :max="Math.min(999, chosenSell.quantity)" step="1" inputmode="numeric" :disabled="resolutionPending" /></label><button class="primary-button" type="button" :disabled="resolutionPending" @click="previewOrder">预览真实报价</button></template><p v-else class="quiet">从左侧选择要寄售的物品。</p><div v-if="orderQuote && side === 'sell'" class="quote"><strong>寄售确认</strong><span>总价 {{ numberText(orderQuote.quote.grossCopper) }} 铜币</span><span>预估手续费 {{ numberText(orderQuote.quote.estimatedFeeCopper) }} 铜币 · 预估净得 {{ numberText(orderQuote.quote.estimatedNetCopper) }} 铜币</span><span>可能即时撮合 {{ orderQuote.quote.matchableQuantityEstimate }} 件 · 订单 {{ orderQuote.quote.orderExpiresHours }} 小时后到期</span><small>报价有效至 {{ dateText(orderQuote.expiresAt) }}；撮合与税费以实际成交为准。</small><button class="primary-button" type="button" :disabled="pending || (quoteExpired && !canRetryOrder)" @click="confirmOrder">{{ canRetryOrder ? '用原凭据核对结果' : '明确确认寄售' }}</button><p v-if="quoteExpired" class="error">{{ canRetryOrder ? '报价已过期；原确认凭据仅能回读已完成结果。' : '报价已过期，请重新预览。' }}</p></div></aside></div></template>
            </template>

            <template v-else-if="tab === 'buy'">
              <p class="intro">从全部可交易物品中选择求购物品，包括当前没有公开挂单的物品。铜币会按单价与数量托管。</p>
              <div class="filters"><label>分类<select :value="buyType" :disabled="loading || pending" @change="changeBuyType(($event.target as HTMLSelectElement).value as MarketType)"><option v-for="type in types" :key="type" :value="type">{{ type }}</option></select></label><form class="search" @submit.prevent="searchBuy"><input v-model="buyDraft" maxlength="80" type="search" placeholder="搜索可求购物品" aria-label="搜索可求购物品" /><button type="submit" :disabled="loading || pending">搜索</button></form></div>
              <div class="content-grid"><div class="result-column"><div v-if="!loading && tradables?.items.length" class="item-list"><button v-for="item in tradables.items" :key="item.id" class="item-card" :class="{ chosen: chosenBuy?.id === item.id }" type="button" :disabled="resolutionPending" @click="chooseBuy(item)"><InventoryItemIcon :name="item.name" :item-category="item.category" /><span class="item-copy"><strong>{{ item.name }}</strong><small>{{ item.category }} · 参考 {{ numberText(item.reference) }} 铜币</small><span>允许单价 {{ numberText(item.band.min) }}～{{ numberText(item.band.max) }} 铜币</span></span><span class="chevron">{{ chosenBuy?.id === item.id ? '✓' : '›' }}</span></button></div><p v-else-if="!loading && !error" class="empty">当前筛选下没有可求购的物品。</p></div><aside class="detail-card composer"><h3>求购报价</h3><template v-if="chosenBuy"><div class="chosen-name"><InventoryItemIcon :name="chosenBuy.name" :item-category="chosenBuy.category" /><span><strong>{{ chosenBuy.name }}</strong><small>堆叠上限 {{ chosenBuy.stackLimit }} 件</small></span></div><p class="range-hint">允许单价 {{ numberText(chosenBuy.band.min) }}～{{ numberText(chosenBuy.band.max) }} 铜币</p><label>单价（铜币）<input v-model.number="unitPrice" type="number" min="1" max="99999999" step="1" inputmode="numeric" :disabled="resolutionPending" /></label><label>数量<input v-model.number="quantity" type="number" min="1" :max="Math.min(999, chosenBuy.stackLimit)" step="1" inputmode="numeric" :disabled="resolutionPending" /></label><button class="primary-button" type="button" :disabled="resolutionPending" @click="previewOrder">预览真实报价</button></template><p v-else class="quiet">从左侧选择要求购的物品。</p><div v-if="orderQuote && side === 'buy'" class="quote"><strong>求购确认</strong><span>托管 {{ numberText(orderQuote.quote.reservedCopper) }} 铜币 · 当前持有 {{ numberText(orderQuote.quote.copper) }} 铜币</span><span>可能即时撮合 {{ orderQuote.quote.matchableQuantityEstimate }} 件 · 订单 {{ orderQuote.quote.orderExpiresHours }} 小时后到期</span><small>报价有效至 {{ dateText(orderQuote.expiresAt) }}；撮合价与实际退款以成交结果为准。</small><button class="primary-button" type="button" :disabled="pending || (quoteExpired && !canRetryOrder)" @click="confirmOrder">{{ canRetryOrder ? '用原凭据核对结果' : '明确确认求购' }}</button><p v-if="quoteExpired" class="error">{{ canRetryOrder ? '报价已过期；原确认凭据仅能回读已完成结果。' : '报价已过期，请重新预览。' }}</p></div></aside></div>
            </template>

            <template v-else>
              <div class="subtabs"><button type="button" :class="{ active: ordersView === 'orders' }" :disabled="pending" @click="switchOrdersView('orders')">全部订单</button><button type="button" :class="{ active: ordersView === 'trades' }" :disabled="pending" @click="switchOrdersView('trades')">成交记录</button></div>
              <template v-if="ordersView === 'orders'"><p v-if="orderPage" class="intro">共 {{ orderPage.total }} 笔订单 · 本周已售 {{ numberText(orderPage.volume.gross) }} 铜币，手续费 {{ numberText(orderPage.volume.fees) }} 铜币。</p><div v-if="!loading && orderPage?.orders.length" class="item-list"><article v-for="entry in orderPage.orders" :key="entry.id" class="item-card order-card"><button type="button" class="item-link" @click="showDetail(entry.itemId)"><InventoryItemIcon :name="entry.name" :item-category="entry.category" /><span class="item-copy"><strong>{{ entry.name }}</strong><small>{{ entry.side === 'sell' ? '寄售' : '求购' }} #{{ entry.id }} · {{ orderStatus(entry.status) }}</small><span>{{ numberText(entry.price) }} 铜币 / 件 · 剩余 {{ entry.remaining }} / {{ entry.total }}</span><span>发布 {{ dateText(entry.createdAt) }} · 到期 {{ dateText(entry.expiresAt) }}</span></span></button><button v-if="canCancel(entry)" class="subtle-button" type="button" :disabled="pending" @click="previewCancel(entry.id, entry.name)">预览撤单</button></article></div><p v-else-if="!loading && !error" class="empty">尚无订单记录。</p></template>
              <template v-else><p class="intro">这里只列出已经真实撮合并结算的交易。</p><div v-if="!loading && tradePage?.trades.length" class="item-list"><article v-for="entry in tradePage.trades" :key="entry.id" class="item-card order-card"><button type="button" class="item-link" @click="showDetail(entry.itemId)"><InventoryItemIcon :name="entry.name" :item-category="entry.category" /><span class="item-copy"><strong>{{ entry.name }}</strong><small>{{ entry.side === 'sell' ? '售出' : '买入' }} · {{ dateText(entry.createdAt) }}</small><span>{{ entry.quantity }} 件 × {{ numberText(entry.price) }} 铜币 = {{ numberText(entry.grossCopper) }} 铜币</span><span v-if="entry.side === 'sell'">手续费 {{ numberText(entry.feeCopper) }} · 实收 {{ numberText(entry.receivedCopper) }} 铜币</span></span></button></article></div><p v-else-if="!loading && !error" class="empty">尚无成交记录。</p></template>
            </template>

            <p v-if="loading" class="empty" role="status">正在更新联市记录…</p>
            <nav v-if="currentPage && currentPage.totalPages > 1 && !loading" class="pager" aria-label="市场翻页"><button type="button" :disabled="pending || currentPage.page <= 1" @click="changePage(currentPage.page - 1)">上一页</button><span>{{ currentPage.page }} / {{ currentPage.totalPages }}</span><button type="button" :disabled="pending || currentPage.page >= currentPage.totalPages" @click="changePage(currentPage.page + 1)">下一页</button></nav>
            <aside v-if="tab !== 'browse' && selectedDetailId" class="detail-card compact-detail"><button class="detail-close" type="button" @click="closeDetail">收起详情 ×</button><p v-if="detailLoading" role="status">正在读取商品详情…</p><p v-if="detailError" class="error" role="alert">{{ detailError }}</p><template v-if="detail"><InventoryItemIcon :name="detail.name" :item-category="detail.category" /><h3>{{ detail.name }}</h3><p>{{ detail.description || '暂无物品描述。' }}</p><p>参考 {{ numberText(detail.reference) }} 铜币 · 挂单范围 {{ numberText(detail.band.min) }}～{{ numberText(detail.band.max) }} 铜币</p><p>最低卖价 {{ numberText(detail.lowestSell) }} · 最高求购 {{ numberText(detail.highestBuy) }} · 近 24 小时成交 {{ detail.volume }} 件</p></template></aside>
          </template>
          <div v-if="!access?.canTrade && canRetryOrder && orderQuote" class="quote">
            <strong>联市确认结果待核对</strong>
            <span>原确认请求已发出。可用同一凭据核对结果；未完成的过期请求不会执行。</span>
            <button class="primary-button" type="button" :disabled="pending" @click="confirmOrder">用原凭据核对结果</button>
          </div>
        </div>
        <div v-if="cancelQuote" class="confirm-cover" role="presentation" @click.self="dismissCancelQuote"><section class="confirm-card" role="alertdialog" aria-modal="true" aria-label="确认撤单"><h3>撤销 {{ cancelQuote.name }}？</h3><p>订单 #{{ cancelQuote.orderId }} · {{ cancelQuote.quote.side === 'sell' ? '寄售' : '求购' }} · 剩余 {{ cancelQuote.quote.quantity }} 件</p><p>手续费 {{ numberText(cancelQuote.quote.feeCopper) }} 铜币。<template v-if="cancelQuote.quote.side === 'sell'">返还 {{ cancelQuote.quote.returnedQuantity }} 件物品。</template><template v-else>返还 {{ numberText(cancelQuote.quote.refundedCopper) }} 铜币。</template></p><small>预览有效至 {{ dateText(cancelQuote.expiresAt) }}；确认时服务器会重新校验。</small><p v-if="error" class="error" role="alert">{{ error }}</p><div class="confirm-actions"><button type="button" :disabled="resolutionPending" @click="dismissCancelQuote">暂不撤单</button><button class="danger-button" type="button" :disabled="pending || (cancelExpired && !canRetryCancel)" @click="confirmCancel">{{ canRetryCancel ? '用原凭据核对结果' : '确认撤单' }}</button></div><p v-if="cancelExpired" class="error">{{ canRetryCancel ? '预览已过期；原确认凭据仅能回读已完成结果。' : '预览已过期，请重新获取。' }}</p></section></div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.market-backdrop { position: fixed; z-index: 94; inset: 0; display: grid; place-items: center; padding: max(10px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left)); background: rgba(35, 45, 53, .53); backdrop-filter: blur(5px); }
.market-panel { position: relative; display: flex; flex-direction: column; width: min(1040px, 100%); height: min(790px, 100%); min-height: 0; overflow: hidden; color: #334b50; background: #fbfdfa; border: 1px solid #eff7ed; border-radius: 22px; box-shadow: 0 30px 82px #172e344a; }
.market-backdrop.inline { position: static; display: block; width: 100%; padding: 0; background: none; backdrop-filter: none; }
.market-panel.inline { width: 100%; height: min(760px, calc(100dvh - 190px)); min-height: 380px; box-shadow: none; }
.market-header { display: flex; align-items: center; gap: 12px; min-height: 78px; padding: 14px 20px; background: linear-gradient(110deg, #eaf8f1, #f7fbeb 55%, #eef7fc); border-bottom: 1px solid #dcebe4; }.market-emblem { display: grid; place-items: center; flex: 0 0 43px; width: 43px; height: 43px; color: #fff; background: linear-gradient(145deg, #77bca4, #75a3bc); border-radius: 13px; box-shadow: 0 5px 13px #71adab4a; font-size: 22px; }.market-title { flex: 1; min-width: 0; }.market-title small { color: #86a29c; font-size: 10px; letter-spacing: .1em; }.market-title h2 { margin: 2px 0 0; font-size: 20px; }.wallet { padding: 7px 10px; color: #807342; background: #fff7d9; border-radius: 9px; font-size: 12px; white-space: nowrap; }.close-button { width: 34px; height: 34px; color: #60847c; background: #fff; border: 1px solid #dae7e2; border-radius: 9px; font-size: 23px; line-height: 1; }
.market-tabs { display: grid; grid-template-columns: repeat(4, 1fr); flex: 0 0 auto; padding: 0 15px; background: white; border-bottom: 1px solid #e3ece7; }.market-tabs button { min-height: 46px; color: #728b86; background: none; border: 0; border-bottom: 3px solid transparent; font-size: 13px; }.market-tabs button.active { color: #397e6b; border-bottom-color: #75b8a0; font-weight: 700; }
.market-body { flex: 1; min-height: 0; overflow-y: auto; padding: 18px 20px max(26px, env(safe-area-inset-bottom)); overscroll-behavior: contain; }.intro { margin: 1px 0 15px; color: #78908a; font-size: 12px; line-height: 1.6; }.filters { display: flex; align-items: end; gap: 10px; flex-wrap: wrap; margin: 12px 0 16px; }.filters > label { display: grid; gap: 5px; color: #6a807a; font-size: 11px; }.filters select { min-width: 114px; }.search { display: flex; flex: 1; gap: 7px; min-width: 190px; }.search input { flex: 1; min-width: 0; }.search button, .primary-button { min-height: 36px; padding: 8px 15px; color: white; background: #4f9c85; border-radius: 9px; font-size: 12px; font-weight: 700; }.narrow-search { max-width: 460px; margin-bottom: 15px; }.filters select, .search input, .composer input { min-height: 36px; padding: 7px 9px; color: #344f4d; background: #fff; border: 1px solid #cfdfd7; border-radius: 9px; font: inherit; font-size: 12px; }
.content-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(255px, 340px); align-items: start; gap: 15px; }.content-grid:not(:has(.detail-card)) { display: block; }.result-column { min-width: 0; }.item-list { display: grid; gap: 9px; }.item-card { display: flex; align-items: center; gap: 11px; width: 100%; min-width: 0; padding: 12px; color: inherit; text-align: left; background: white; border: 1px solid #e0ebe4; border-radius: 13px; box-shadow: 0 3px 11px #325d4710; }.item-card:hover, .item-card.chosen { border-color: #8ec5ae; background: #f8fdfa; }.item-card :deep(.inventory-art-wrap), .chosen-name :deep(.inventory-art-wrap), .detail-card > :deep(.inventory-art-wrap) { flex: 0 0 43px; width: 43px; height: 43px; margin: 0; background: #eef8f2; border-radius: 11px; }.item-card :deep(.inventory-item-image), .chosen-name :deep(.inventory-item-image), .detail-card > :deep(.inventory-item-image) { width: 39px; height: 39px; }.item-copy { display: grid; gap: 3px; flex: 1; min-width: 0; overflow-wrap: anywhere; }.item-copy strong { color: #36544b; font-size: 13px; }.item-copy small { color: #8aa199; font-size: 11px; }.item-copy > span { color: #607c73; font-size: 12px; line-height: 1.45; }.item-copy b { color: #507d65; }.chevron { color: #8dbca9; font-size: 22px; }
.detail-card { min-width: 0; padding: 16px; background: #fff; border: 1px solid #dcebe3; border-radius: 14px; box-shadow: 0 3px 14px #3c795213; }.detail-card h3 { margin: 8px 0; color: #34554a; font-size: 16px; }.detail-card > small { display: block; margin-top: 8px; color: #91a79b; }.detail-card > p { color: #71877c; font-size: 12px; line-height: 1.6; overflow-wrap: anywhere; }.detail-card dl { display: grid; gap: 0; margin: 11px 0 0; }.detail-card dl div { display: flex; justify-content: space-between; gap: 8px; padding: 8px 0; border-top: 1px solid #ecf2ed; font-size: 12px; }.detail-card dt { color: #8b9e95; }.detail-card dd { margin: 0; color: #416955; text-align: right; }.detail-close { float: right; color: #729889; background: none; font-size: 11px; }.compact-detail { margin-top: 13px; }
.subtabs { display: flex; gap: 7px; margin: 1px 0 15px; }.subtabs button { min-height: 36px; padding: 7px 13px; color: #64857a; background: #edf5ee; border-radius: 9px; font-size: 12px; }.subtabs button.active { color: #317d65; background: #dff2e8; font-weight: 700; }.order-card { flex-wrap: wrap; }.item-link { display: flex; align-items: center; gap: 11px; flex: 1; min-width: 210px; padding: 0; color: inherit; text-align: left; background: none; }.subtle-button { min-height: 34px; padding: 7px 10px; color: #9b7057; background: #fcf0e6; border-radius: 8px; font-size: 11px; }
.composer h3 { margin: 0 0 13px; }.composer label { display: grid; gap: 5px; margin: 10px 0; color: #627a70; font-size: 12px; }.composer input { width: 100%; }.composer .primary-button { width: 100%; margin-top: 5px; }.chosen-name { display: flex; align-items: center; gap: 9px; margin: 8px 0; padding: 8px; background: #f7fbf7; border-radius: 10px; }.chosen-name span:not(.inventory-art-wrap) { display: grid; gap: 3px; min-width: 0; }.chosen-name strong { font-size: 12px; }.chosen-name small { color: #8fa39a; font-size: 11px; }.range-hint { margin: 8px 0; color: #5b8a70; font-size: 11px; }.quote { display: grid; gap: 7px; margin-top: 15px; padding: 13px; color: #5b776b; background: #eef8f1; border: 1px solid #d9ebdc; border-radius: 11px; font-size: 12px; line-height: 1.45; }.quote strong { color: #3c795b; font-size: 14px; }.quote small { color: #7f9587; }.quote .primary-button { margin-top: 5px; }
.empty { margin: 0; padding: 40px 12px; color: #91a69a; font-size: 13px; text-align: center; }.quiet { color: #91a69a; font-size: 12px; line-height: 1.6; }.locked { max-width: 420px; margin: 65px auto; padding: 26px; text-align: center; background: #fff; border: 1px solid #e3ebe2; border-radius: 16px; }.locked span { color: #85b4a0; font-size: 28px; }.locked h3 { margin: 8px 0; font-size: 16px; }.locked p { color: #788e80; font-size: 13px; line-height: 1.6; }.pager { display: flex; align-items: center; justify-content: center; gap: 14px; margin: 19px 0 2px; color: #758e81; font-size: 12px; }.pager button { min-height: 34px; padding: 7px 11px; color: #4e8b72; background: #e6f4eb; border-radius: 9px; }.notice, .error { padding: 10px 12px; border-radius: 9px; font-size: 12px; line-height: 1.5; }.notice { color: #49745b; background: #e6f6e9; }.error { color: #aa5864; background: #fff0ed; }
.confirm-cover { position: absolute; z-index: 2; inset: 0; display: grid; place-items: center; padding: 15px; background: #263d3caf; }.confirm-card { width: min(420px, 100%); padding: 20px; color: #3c5450; background: #fffdf9; border-radius: 15px; box-shadow: 0 15px 45px #263d3c5c; }.confirm-card h3 { margin: 0 0 12px; font-size: 17px; }.confirm-card p { font-size: 13px; line-height: 1.6; }.confirm-card small { color: #849b90; font-size: 11px; }.confirm-actions { display: flex; justify-content: end; gap: 8px; margin-top: 17px; }.confirm-actions button { min-height: 36px; padding: 8px 12px; color: #59796c; background: #eaf2eb; border-radius: 8px; font-size: 12px; }.confirm-actions .danger-button { color: white; background: #bd7765; }
button { border: 0; cursor: pointer; font: inherit; }button:disabled { opacity: .48; cursor: not-allowed; }button:focus-visible, input:focus-visible, select:focus-visible { outline: 3px solid #63a991; outline-offset: 2px; }
@media (max-width: 720px) { .market-panel { width: 100%; height: 100%; border-radius: 14px; }.market-header { min-height: 62px; padding: 10px 13px; gap: 8px; }.market-emblem { flex-basis: 35px; width: 35px; height: 35px; }.market-title h2 { font-size: 16px; }.market-title small { font-size: 9px; }.wallet { max-width: 96px; overflow: hidden; text-overflow: ellipsis; font-size: 10px; }.market-tabs { padding: 0 5px; }.market-tabs button { min-height: 43px; font-size: 11px; }.market-body { padding: 14px 12px max(22px, env(safe-area-inset-bottom)); }.filters { gap: 7px; }.filters > label { flex: 1; }.filters select { width: 100%; min-width: 0; }.filters .search { flex-basis: 100%; }.content-grid { display: flex; flex-direction: column; }.content-grid .result-column, .content-grid .detail-card { width: 100%; }.content-grid .detail-card:not(.composer) { order: -1; }.item-card { padding: 10px; }.item-copy > span { font-size: 11px; }.order-card .subtle-button { margin-left: auto; } }
@media (max-width: 720px) { .market-panel.inline { height: min(720px, calc(100dvh - 160px)); min-height: 360px; } }
@media (max-width: 370px) { .wallet { display: none; }.market-tabs button { font-size: 10px; }.item-card :deep(.inventory-art-wrap) { flex-basis: 36px; width: 36px; height: 36px; }.item-card :deep(.inventory-item-image) { width: 33px; height: 33px; } }
</style>
