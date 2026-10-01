<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { userFacingErrorMessage } from '../api';
import * as homeApi from '../home-purchase-api';
import type {
  HomePurchasePreview, HomePurchaseResult, HomePurchaseSite, HomePurchaseSiteTarget,
  HomeShopDetail, HomeShopOffer, HomeShopPreview, HomeShopShelf
} from '../home-purchase-api';
import InventoryItemIcon from './InventoryItemIcon.vue';

type Mode = 'purchase' | 'shop';
type OfferFilter = 'all' | 'copper' | 'material';
const props = withDefaults(defineProps<{ open: boolean; mode?: Mode; targetId?: string }>(), {
  mode: 'purchase', targetId: homeApi.HOME_PURCHASE_TARGET_ID
});
const emit = defineEmits<{ close: []; updated: []; purchased: [result: HomePurchaseResult]; locate: [target: HomePurchaseSiteTarget]; 'pending-change': [pending: boolean] }>();

const closeButton = ref<HTMLButtonElement | null>(null);
const tab = ref<Mode>('purchase');
const site = ref<HomePurchaseSite | null>(null);
const shelf = ref<HomeShopShelf | null>(null);
const selectedOffer = ref<HomeShopOffer | null>(null);
const offerDetail = ref<HomeShopDetail | null>(null);
const offerFilter = ref<OfferFilter>('all');
const tradeCount = ref(1);
const purchaseQuote = ref<HomePurchasePreview | null>(null);
const shopQuote = ref<HomeShopPreview | null>(null);
const purchaseResult = ref<HomePurchaseResult | null>(null);
const purchaseRetry = ref(false);
const shopRetry = ref(false);
const loadingSite = ref(false);
const loadingShop = ref(false);
const loadingDetail = ref(false);
const pending = ref(false);
const resolutionPending = computed(() => pending.value || (purchaseRetry.value && Boolean(purchaseQuote.value))
  || (shopRetry.value && Boolean(shopQuote.value)));
watch(resolutionPending, value => emit('pending-change', value), { immediate: true });
const error = ref('');
const detailError = ref('');
const notice = ref('');
const now = ref(Date.now());
let siteVersion = 0;
let shopVersion = 0;
let detailVersion = 0;

const filteredOffers = computed(() => shelf.value?.offers.filter(offer => offerFilter.value === 'all'
  || (offerFilter.value === 'copper' ? offer.inputName === null : offer.inputName !== null)) ?? []);
const selectedDetail = computed(() => {
  const current = offerDetail.value;
  return current && current.offer.id === selectedOffer.value?.id ? current.offer : null;
});
const purchaseExpired = computed(() => purchaseQuote.value ? now.value >= new Date(purchaseQuote.value.expiresAt).getTime() : false);
const shopExpired = computed(() => shopQuote.value ? now.value >= new Date(shopQuote.value.expiresAt).getTime() : false);

function amount(value: number | null | undefined) { return value == null ? '—' : value.toLocaleString('zh-CN'); }
function dateText(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN');
}
function close() { if (!resolutionPending.value) emit('close'); }
function locateSite() { if (!resolutionPending.value && site.value) emit('locate', site.value.target); }

async function loadSite() {
  if (!props.open || props.targetId !== homeApi.HOME_PURCHASE_TARGET_ID) return false;
  const version = ++siteVersion;
  loadingSite.value = true;
  try {
    const result = await homeApi.homePurchaseSite();
    if (version !== siteVersion || !props.open) return false;
    site.value = result;
    return true;
  } catch (cause) {
    if (version === siteVersion) error.value = userFacingErrorMessage(cause);
    return false;
  } finally {
    if (version === siteVersion) loadingSite.value = false;
  }
}

async function loadShop() {
  if (!props.open || props.targetId !== homeApi.HOME_PURCHASE_TARGET_ID || !site.value?.atSite) return;
  const version = ++shopVersion;
  loadingShop.value = true;
  try {
    const result = await homeApi.homeShopShelf(props.targetId);
    if (version !== shopVersion || !props.open) return;
    shelf.value = result;
    const updated = result.offers.find(offer => offer.id === selectedOffer.value?.id);
    if (updated) selectedOffer.value = updated;
  } catch (cause) {
    if (version === shopVersion) error.value = userFacingErrorMessage(cause);
  } finally {
    if (version === shopVersion) loadingShop.value = false;
  }
}

async function loadOfferDetail(offerId: number) {
  if (!props.open || props.targetId !== homeApi.HOME_PURCHASE_TARGET_ID) return;
  const version = ++detailVersion;
  loadingDetail.value = true;
  detailError.value = '';
  offerDetail.value = null;
  try {
    const result = await homeApi.homeShopOffer(props.targetId, offerId);
    if (version !== detailVersion || !props.open || selectedOffer.value?.id !== offerId) return;
    offerDetail.value = result;
  } catch (cause) {
    if (version === detailVersion) detailError.value = userFacingErrorMessage(cause);
  } finally {
    if (version === detailVersion) loadingDetail.value = false;
  }
}

async function refresh() {
  if (pending.value || loadingSite.value || loadingShop.value) return;
  if (props.targetId !== homeApi.HOME_PURCHASE_TARGET_ID) { error.value = '请从百纳居地图目标进入。'; return; }
  error.value = '';
  const siteLoaded = await loadSite();
  if (siteLoaded && tab.value === 'shop' && site.value?.atSite) {
    await loadShop();
    if (selectedOffer.value) void loadOfferDetail(selectedOffer.value.id);
  }
}
function switchTab(next: Mode) {
  if (resolutionPending.value || tab.value === next) return;
  tab.value = next;
  error.value = '';
  notice.value = '';
  if (next === 'shop' && site.value?.atSite) void loadShop();
}
function chooseOffer(offer: HomeShopOffer) {
  if (resolutionPending.value) return;
  error.value = '';
  notice.value = '';
  selectedOffer.value = offer;
  tradeCount.value = 1;
  shopQuote.value = null;
  shopRetry.value = false;
  void loadOfferDetail(offer.id);
}
function changeFilter(next: OfferFilter) {
  if (offerFilter.value === next || resolutionPending.value) return;
  offerFilter.value = next;
  if (selectedOffer.value && next !== 'all'
    && (next === 'copper') !== (selectedOffer.value.inputName === null)) {
    selectedOffer.value = null;
    offerDetail.value = null;
    shopQuote.value = null;
    shopRetry.value = false;
    ++detailVersion;
  }
}

async function previewPurchase() {
  if (resolutionPending.value || !site.value || site.value.owned || !site.value.atSite) return;
  pending.value = true;
  error.value = '';
  notice.value = '';
  purchaseQuote.value = null;
  purchaseRetry.value = false;
  try {
    const result = await homeApi.previewHomePurchase();
    if (props.open) { now.value = Date.now(); purchaseQuote.value = result; }
  } catch (cause) {
    if (props.open) {
      const message = userFacingErrorMessage(cause);
      await loadSite();
      error.value = message;
    }
  } finally { pending.value = false; }
}

async function confirmPurchase() {
  const quote = purchaseQuote.value;
  if (!quote || pending.value || !props.open) return;
  if (Date.now() >= new Date(quote.expiresAt).getTime() && !purchaseRetry.value) {
    purchaseQuote.value = null;
    purchaseRetry.value = false;
    error.value = '购房报价已过期，请重新预览。';
    return;
  }
  pending.value = true;
  error.value = '';
  notice.value = '';
  try {
    const response = await homeApi.confirmHomePurchase(quote.token, quote.idempotencyKey);
    purchaseQuote.value = null;
    purchaseRetry.value = false;
    purchaseResult.value = response.result;
    notice.value = `已购得${response.result.name}，实际地块已分配。`;
    emit('purchased', response.result);
    emit('updated');
    if (props.open) await loadSite();
  } catch (cause) {
    if (props.open) {
      const message = userFacingErrorMessage(cause);
      const retryable = /网络连接异常|暂时不可用|服务器返回内容异常|操作未完成|请求超时|状态码 408/.test(message);
      if (!retryable) purchaseQuote.value = null;
      purchaseRetry.value = retryable;
      await loadSite();
      if (retryable && site.value?.owned) emit('updated');
      error.value = retryable ? `${message} 原确认凭据已保留，可核对家园状态后重试。`
        : `${message} 已重新读取购房状态，请再次预览。`;
    }
  } finally { pending.value = false; }
}

function validTradeCount() {
  if (!selectedOffer.value) throw new Error('请先选择兑换项目。');
  if (!Number.isSafeInteger(tradeCount.value) || tradeCount.value < 1 || tradeCount.value > 999) throw new Error('组数必须是 1 至 999 的整数。');
  const selected = selectedDetail.value;
  if (selected?.inputOwnedQuantity != null && selected.inputQuantity * tradeCount.value > selected.inputOwnedQuantity) {
    throw new Error(`投入材料不足，当前仅有 ${selected.inputOwnedQuantity} 个。`);
  }
  return { offerId: selectedOffer.value.id, quantity: tradeCount.value };
}

async function previewTrade() {
  if (resolutionPending.value || !site.value?.atSite) return;
  let draft: ReturnType<typeof validTradeCount>;
  try { draft = validTradeCount(); } catch (cause) { error.value = userFacingErrorMessage(cause); return; }
  pending.value = true;
  error.value = '';
  notice.value = '';
  shopQuote.value = null;
  shopRetry.value = false;
  try {
    const result = await homeApi.previewHomeShopTrade(props.targetId, draft.offerId, draft.quantity);
    if (props.open && selectedOffer.value?.id === draft.offerId) { now.value = Date.now(); shopQuote.value = result; }
  } catch (cause) {
    if (props.open) {
      const message = userFacingErrorMessage(cause);
      await loadSite();
      if (site.value?.atSite) {
        await loadShop();
        if (selectedOffer.value?.id === draft.offerId) void loadOfferDetail(draft.offerId);
      }
      error.value = message;
    }
  } finally { pending.value = false; }
}

async function confirmTrade() {
  const quote = shopQuote.value;
  if (!quote || pending.value || !props.open) return;
  if (Date.now() >= new Date(quote.expiresAt).getTime() && !shopRetry.value) {
    shopQuote.value = null;
    shopRetry.value = false;
    error.value = '兑换报价已过期，请重新预览。';
    return;
  }
  pending.value = true;
  error.value = '';
  notice.value = '';
  try {
    const response = await homeApi.confirmHomeShopTrade(props.targetId, quote.token, quote.idempotencyKey);
    shopQuote.value = null;
    shopRetry.value = false;
    notice.value = `已兑换 ${response.result.name} ×${amount(response.result.quantity)}。`;
    emit('updated');
    if (props.open) {
      await loadSite();
      if (site.value?.atSite) {
        await loadShop();
        if (selectedOffer.value) void loadOfferDetail(selectedOffer.value.id);
      }
    }
  } catch (cause) {
    if (props.open) {
      const message = userFacingErrorMessage(cause);
      const retryable = /网络连接异常|暂时不可用|服务器返回内容异常|操作未完成|请求超时|状态码 408/.test(message);
      if (!retryable) shopQuote.value = null;
      shopRetry.value = retryable;
      await loadSite();
      if (site.value?.atSite) {
        await loadShop();
        if (selectedOffer.value) void loadOfferDetail(selectedOffer.value.id);
      }
      if (retryable) emit('updated');
      error.value = retryable ? `${message} 原确认凭据已保留，可核对铜币和背包后重试。`
        : `${message} 已重新读取兑换状态，请再次预览。`;
    }
  } finally { pending.value = false; }
}

watch(tradeCount, () => { if (!shopRetry.value) shopQuote.value = null; });
watch([() => props.open, () => props.mode, () => props.targetId], async ([open, mode, targetId], _old, onCleanup) => {
  ++siteVersion; ++shopVersion; ++detailVersion;
  const timer = open ? window.setInterval(() => { now.value = Date.now(); }, 1000) : null;
  onCleanup(() => { if (timer !== null) window.clearInterval(timer); });
  if (!open) { loadingSite.value = false; loadingShop.value = false; return; }
  tab.value = mode;
  site.value = null;
  shelf.value = null;
  selectedOffer.value = null;
  offerDetail.value = null;
  offerFilter.value = 'all';
  tradeCount.value = 1;
  purchaseQuote.value = null;
  shopQuote.value = null;
  purchaseResult.value = null;
  purchaseRetry.value = false;
  shopRetry.value = false;
  error.value = '';
  notice.value = '';
  now.value = Date.now();
  await nextTick();
  if (!props.open || props.mode !== mode || props.targetId !== targetId) return;
  closeButton.value?.focus();
  if (targetId !== homeApi.HOME_PURCHASE_TARGET_ID) { error.value = '请从百纳居地图目标进入。'; return; }
  const loaded = await loadSite();
  if (loaded && mode === 'shop') void loadShop();
}, { immediate: true });
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="home-purchase-backdrop" role="presentation" @click.self="close">
      <section class="home-purchase-panel" role="dialog" aria-modal="true" aria-label="百纳居" @keydown.esc="close">
        <header class="home-purchase-header"><div class="home-purchase-mark" aria-hidden="true">⌂</div><div class="home-purchase-title"><small>BAINA RESIDENCE · HOME</small><h2>百纳居</h2></div><button class="home-purchase-refresh" type="button" :disabled="resolutionPending || loadingSite || loadingShop" @click="refresh">刷新</button><button ref="closeButton" class="home-purchase-close" type="button" aria-label="关闭百纳居" :disabled="resolutionPending" @click="close">×</button></header>
        <nav class="home-purchase-tabs" aria-label="百纳居栏目"><button type="button" :class="{ active: tab === 'purchase' }" :disabled="resolutionPending" @click="switchTab('purchase')">购置小屋</button><button type="button" :class="{ active: tab === 'shop' }" :disabled="resolutionPending" @click="switchTab('shop')">建材兑换</button></nav>
        <div class="home-purchase-body">
          <p v-if="notice" class="home-purchase-notice" role="status">{{ notice }}</p>
          <p v-if="error" class="home-purchase-error" role="alert">{{ error }}</p>
          <p v-if="purchaseRetry || shopRetry" class="home-purchase-error" role="status">确认结果尚未确定，请用原凭据核对。核对完成前暂不能关闭或定位；网络持续不可用时请保持页面打开，稍后重试。</p>
          <p v-if="loadingSite && !site" class="home-purchase-empty" role="status">正在查找百纳居位置…</p>
          <button v-else-if="!site && targetId === homeApi.HOME_PURCHASE_TARGET_ID" class="home-purchase-subtle-button" type="button" :disabled="pending" @click="refresh">重试读取地点</button>

          <template v-if="site">
            <div class="home-purchase-site"><div><small>购置地点 · 服务端实时位置</small><strong>{{ site.target.name }}</strong><span>{{ site.target.regionName }} · ({{ site.target.x }}, {{ site.target.y }}, {{ site.target.z }})</span></div><button type="button" :disabled="resolutionPending" @click="locateSite">地图定位</button></div>
            <p v-if="!site.atSite" class="home-purchase-travel">你当前不在百纳居所在格；需到达地点后才能购房或兑换。</p>

            <template v-if="tab === 'purchase'">
              <div class="home-purchase-card">
                <p class="home-purchase-eyebrow">A PLACE TO CALL HOME</p>
                <h3>{{ site.owned ? '你已经拥有小屋' : '购置自己的小屋' }}</h3>
                <p v-if="site.owned">家园已建立，可在「世界 › 家园」查看楼层与家具。</p>
                <template v-else><p>购房费用 <b>{{ amount(site.purchaseCopper) }} 铜币</b>。确认交易成功后，服务端才会分配实际地块。</p><button v-if="site.atSite" class="home-purchase-primary" type="button" :disabled="resolutionPending" @click="previewPurchase">预览购房报价</button><p v-else>请先通过地图定位前往百纳居。</p></template>
              </div>
              <div v-if="purchaseQuote" class="home-purchase-quote"><strong>购房确认</strong><p>{{ purchaseQuote.quote.name }} · 支出 {{ amount(purchaseQuote.quote.price) }} 铜币</p><p>铜币 {{ amount(purchaseQuote.quote.copperBefore) }} → {{ amount(purchaseQuote.quote.copperAfter) }}</p><p>小屋地块将在确认成功时分配；当前报价不含地块坐标。</p><small>报价有效至 {{ dateText(purchaseQuote.expiresAt) }}</small><button class="home-purchase-primary" type="button" :disabled="pending || (purchaseExpired && !purchaseRetry)" @click="confirmPurchase">{{ purchaseRetry ? '用原凭据核对结果' : '明确确认购房' }}</button><p v-if="purchaseExpired" class="home-purchase-error">{{ purchaseRetry ? '报价已过期；原确认凭据仅能回读已完成结果。' : '报价已过期，请重新预览。' }}</p></div>
              <div v-if="purchaseResult" class="home-purchase-result"><strong>{{ purchaseResult.name }}已建立</strong><p>实际地块：{{ site.target.regionName }} · ({{ purchaseResult.plot.x }}, {{ purchaseResult.plot.y }}, {{ purchaseResult.plot.z }})</p><p>小屋编号 {{ purchaseResult.homeId }} · 支出 {{ amount(purchaseResult.copper) }} 铜币</p></div>
            </template>

            <template v-else>
              <p v-if="!site.atSite" class="home-purchase-empty">抵达百纳居后可查看并兑换建材。</p>
              <template v-else>
                <div class="home-purchase-shop-head"><div><p class="home-purchase-eyebrow">MATERIAL EXCHANGE</p><h3>建材兑换</h3></div><span v-if="shelf">铜币 {{ amount(shelf.copper) }}</span></div>
                <div class="home-purchase-filters" role="group" aria-label="筛选兑换方式"><button type="button" :class="{ active: offerFilter === 'all' }" :disabled="resolutionPending" @click="changeFilter('all')">全部</button><button type="button" :class="{ active: offerFilter === 'copper' }" :disabled="resolutionPending" @click="changeFilter('copper')">铜币购买</button><button type="button" :class="{ active: offerFilter === 'material' }" :disabled="resolutionPending" @click="changeFilter('material')">材料兑换</button></div>
                <p v-if="loadingShop && !shelf" class="home-purchase-empty" role="status">正在读取兑换项目…</p>
                <div class="home-purchase-shop-grid">
                  <div class="home-purchase-offers"><button v-for="offer in filteredOffers" :key="offer.id" type="button" class="home-purchase-offer" :class="{ selected: selectedOffer?.id === offer.id }" :disabled="resolutionPending" @click="chooseOffer(offer)"><InventoryItemIcon :name="offer.outputName" item-category="建材" /><span><strong>{{ offer.outputName }} ×{{ amount(offer.outputQuantity) }}</strong><small v-if="offer.inputName">每组投入 {{ offer.inputName }} ×{{ amount(offer.inputQuantity) }}</small><small v-else>每组 {{ amount(offer.copperPrice) }} 铜币</small></span><b aria-hidden="true">›</b></button><p v-if="shelf && !filteredOffers.length" class="home-purchase-empty">当前没有此类兑换项目。</p></div>
                  <aside class="home-purchase-detail"><template v-if="selectedOffer"><div class="home-purchase-picked"><InventoryItemIcon :name="selectedOffer.outputName" item-category="建材" /><div><small>兑换项目</small><h4>{{ selectedOffer.outputName }}</h4></div></div><p v-if="loadingDetail" class="home-purchase-muted">正在读取项目详情…</p><p v-if="detailError" class="home-purchase-error" role="alert">{{ detailError }}</p><dl class="home-purchase-facts"><div><dt>每组获得</dt><dd>{{ amount(selectedOffer.outputQuantity) }} 个</dd></div><div v-if="selectedOffer.inputName"><dt>每组投入</dt><dd>{{ selectedOffer.inputName }} ×{{ amount(selectedOffer.inputQuantity) }}</dd></div><div v-else><dt>每组费用</dt><dd>{{ amount(selectedOffer.copperPrice) }} 铜币</dd></div><div v-if="selectedDetail?.inputOwnedQuantity != null"><dt>当前持有投入材料</dt><dd>{{ amount(selectedDetail.inputOwnedQuantity) }} 个</dd></div></dl><label class="home-purchase-count">兑换组数<input v-model.number="tradeCount" type="number" min="1" max="999" step="1" inputmode="numeric" :disabled="resolutionPending" /></label><button class="home-purchase-primary" type="button" :disabled="resolutionPending || loadingShop" @click="previewTrade">预览真实报价</button></template><p v-else class="home-purchase-empty">选择兑换项目查看投入与产出。</p>
                    <div v-if="shopQuote" class="home-purchase-quote"><strong>兑换确认</strong><p>{{ amount(shopQuote.quote.tradeCount) }} 组 · 获得 {{ shopQuote.quote.name }} ×{{ amount(shopQuote.quote.quantity) }}</p><p v-if="shopQuote.quote.inputItemId !== null">投入材料 {{ amount(shopQuote.quote.inputQuantity) }} 个 · 持有 {{ amount(shopQuote.quote.inputOwnedBefore) }} → {{ amount(shopQuote.quote.inputOwnedAfter) }}</p><p v-else>支出 {{ amount(shopQuote.quote.price) }} 铜币 · 余额 {{ amount(shopQuote.quote.copperBefore) }} → {{ amount(shopQuote.quote.copperAfter) }}</p><p>产物绑定：未绑定 {{ amount(shopQuote.quote.outputBinding.unbound) }} · 交易绑定 {{ amount(shopQuote.quote.outputBinding.trade) }} · 个人绑定 {{ amount(shopQuote.quote.outputBinding.personal) }}</p><small>报价有效至 {{ dateText(shopQuote.expiresAt) }}；确认时会重新校验。</small><button class="home-purchase-primary" type="button" :disabled="pending || (shopExpired && !shopRetry)" @click="confirmTrade">{{ shopRetry ? '用原凭据核对结果' : '明确确认兑换' }}</button><p v-if="shopExpired" class="home-purchase-error">{{ shopRetry ? '报价已过期；原确认凭据仅能回读已完成结果。' : '报价已过期，请重新预览。' }}</p></div>
                  </aside>
                </div>
              </template>
            </template>
          </template>
          <div v-if="shopRetry && shopQuote && (!site || !site.atSite)" class="home-purchase-quote">
            <strong>建材兑换确认结果待核对</strong>
            <p>原确认请求已发出；可用原凭据核对。未完成的过期请求不会执行。</p>
            <button class="home-purchase-primary" type="button" :disabled="pending" @click="confirmTrade">用原凭据核对结果</button>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.home-purchase-backdrop { position: fixed; z-index: 99; inset: 0; display: grid; place-items: center; padding: max(10px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(10px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left)); background: #262530ab; backdrop-filter: blur(5px); }
.home-purchase-panel { display: flex; flex-direction: column; width: min(950px, 100%); height: min(760px, 100%); min-height: 0; overflow: hidden; color: #3d4253; background: #fffcfa; border: 1px solid #e9e3e6; border-radius: 20px; box-shadow: 0 28px 75px #181a285e; }
.home-purchase-header { display: flex; align-items: center; gap: 11px; min-height: 75px; padding: 13px 19px; background: linear-gradient(110deg, #f2edf8, #fff3e8 62%, #ecf4f6); border-bottom: 1px solid #e9e2e7; }.home-purchase-mark { display: grid; place-items: center; flex: 0 0 43px; width: 43px; height: 43px; color: white; background: linear-gradient(140deg, #aa83b9, #d09c85); border-radius: 12px; font-size: 29px; }.home-purchase-title { flex: 1; min-width: 0; }.home-purchase-title small { color: #a58ca6; font-size: 10px; letter-spacing: .1em; }.home-purchase-title h2 { margin: 3px 0 0; color: #574765; font-size: 19px; }.home-purchase-refresh, .home-purchase-close { flex: none; color: #7c6c81; background: #fff; border: 1px solid #e6dbe5; border-radius: 9px; }.home-purchase-refresh { min-height: 35px; padding: 6px 12px; font-size: 12px; }.home-purchase-close { width: 35px; height: 35px; font-size: 22px; line-height: 1; }
.home-purchase-tabs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); flex: none; padding: 0 16px; background: #fff; border-bottom: 1px solid #ece5e9; }.home-purchase-tabs button { min-height: 44px; color: #918596; background: none; border: 0; border-bottom: 3px solid transparent; font-size: 13px; }.home-purchase-tabs button.active { color: #8c638e; border-bottom-color: #b48bb9; font-weight: 800; }
.home-purchase-body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; padding: 18px 20px max(24px, env(safe-area-inset-bottom)); }.home-purchase-site { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; background: #f8f2fa; border: 1px solid #ecdfef; border-radius: 13px; }.home-purchase-site div { display: grid; gap: 3px; min-width: 0; }.home-purchase-site small { color: #a08aa7; font-size: 10px; }.home-purchase-site strong { color: #644a70; font-size: 15px; }.home-purchase-site span { color: #867a8d; font-size: 12px; }.home-purchase-site button, .home-purchase-subtle-button { flex: none; min-height: 35px; padding: 8px 12px; color: #785c84; background: #fff; border: 1px solid #e4d3e7; border-radius: 9px; font-size: 12px; font-weight: 700; }.home-purchase-travel { margin: 12px 0; padding: 10px 12px; color: #8b6f54; background: #fff4e8; border-radius: 9px; font-size: 12px; line-height: 1.5; }
.home-purchase-card, .home-purchase-result { margin-top: 16px; padding: 22px; background: white; border: 1px solid #e9e1e8; border-radius: 14px; box-shadow: 0 4px 16px #705d7410; }.home-purchase-eyebrow { margin: 0; color: #ad91ab; font-size: 10px; font-weight: 800; letter-spacing: .13em; }.home-purchase-card h3, .home-purchase-shop-head h3 { margin: 5px 0 10px; color: #5f4c68; font-size: 19px; }.home-purchase-card > p:not(.home-purchase-eyebrow), .home-purchase-result p { color: #847b87; font-size: 13px; line-height: 1.6; }.home-purchase-card b { color: #aa724f; }.home-purchase-primary { min-height: 39px; padding: 9px 15px; color: #fff; background: #946e9d; border-radius: 9px; font-size: 12px; font-weight: 800; }.home-purchase-card .home-purchase-primary { margin-top: 8px; }.home-purchase-quote { display: grid; gap: 7px; margin-top: 16px; padding: 15px; color: #6d5e73; background: #f8eff8; border: 1px solid #e5d8e7; border-radius: 12px; font-size: 12px; line-height: 1.5; }.home-purchase-quote strong { color: #765180; font-size: 15px; }.home-purchase-quote p { margin: 0; }.home-purchase-quote small { color: #94849a; }.home-purchase-result { background: #f0f8ef; border-color: #dbecda; }.home-purchase-result strong { color: #4f7a55; }.home-purchase-result p { margin: 6px 0 0; }
.home-purchase-shop-head { display: flex; align-items: center; justify-content: space-between; gap: 9px; margin: 18px 0 9px; }.home-purchase-shop-head h3 { margin-bottom: 0; }.home-purchase-shop-head span { color: #8b704f; background: #fff1d8; border-radius: 9px; padding: 7px 10px; font-size: 12px; }.home-purchase-filters { display: flex; gap: 6px; flex-wrap: wrap; margin: 12px 0; }.home-purchase-filters button { padding: 7px 12px; color: #85748a; background: #f5eff6; border-radius: 999px; font-size: 12px; }.home-purchase-filters button.active { color: white; background: #a27ba7; }.home-purchase-shop-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(250px, 330px); gap: 14px; align-items: start; }.home-purchase-offers { display: grid; gap: 8px; min-width: 0; }.home-purchase-offer { display: flex; align-items: center; gap: 10px; width: 100%; min-width: 0; padding: 11px; color: inherit; text-align: left; background: #fff; border: 1px solid #e9dfe8; border-radius: 12px; }.home-purchase-offer:hover, .home-purchase-offer.selected { border-color: #c6a2c7; background: #fffaff; }.home-purchase-offer :deep(.inventory-art-wrap), .home-purchase-picked :deep(.inventory-art-wrap) { flex: 0 0 43px; width: 43px; height: 43px; margin: 0; background: #f5edf6; border-radius: 10px; }.home-purchase-offer :deep(.inventory-item-image), .home-purchase-picked :deep(.inventory-item-image) { width: 39px; height: 39px; }.home-purchase-offer > span { display: grid; gap: 3px; flex: 1; min-width: 0; }.home-purchase-offer strong { color: #614e68; font-size: 13px; }.home-purchase-offer small { color: #978799; font-size: 11px; }.home-purchase-offer b { color: #bd9abd; font-size: 20px; font-weight: 400; }
.home-purchase-detail { min-width: 0; padding: 16px; background: white; border: 1px solid #e8dde7; border-radius: 13px; }.home-purchase-picked { display: flex; align-items: center; gap: 9px; }.home-purchase-picked div { min-width: 0; }.home-purchase-picked small { color: #a18fa3; font-size: 11px; }.home-purchase-picked h4 { margin: 2px 0; color: #5c4965; font-size: 15px; }.home-purchase-facts { margin: 14px 0; }.home-purchase-facts div { display: flex; justify-content: space-between; gap: 8px; padding: 7px 0; border-top: 1px solid #f0e9ee; font-size: 12px; }.home-purchase-facts dt { color: #9b8f9e; }.home-purchase-facts dd { margin: 0; color: #6d5c71; text-align: right; }.home-purchase-count { display: grid; gap: 5px; color: #786c7e; font-size: 12px; }.home-purchase-count input { min-height: 38px; width: 100%; padding: 8px 10px; color: #493f50; border: 1px solid #ddd0df; border-radius: 9px; font: inherit; }.home-purchase-detail .home-purchase-primary { width: 100%; margin-top: 10px; }.home-purchase-muted { color: #9c8e9e; font-size: 12px; }.home-purchase-empty { padding: 28px 10px; color: #a396a5; text-align: center; font-size: 13px; }.home-purchase-error, .home-purchase-notice { margin: 0 0 12px; padding: 10px 12px; border-radius: 9px; font-size: 12px; line-height: 1.5; }.home-purchase-error { color: #a65c62; background: #fff0ed; }.home-purchase-notice { color: #52805b; background: #eaf7ea; }
button { border: 0; cursor: pointer; font: inherit; }button:disabled { opacity: .48; cursor: not-allowed; }button:focus-visible, input:focus-visible { outline: 3px solid #9e78aa; outline-offset: 2px; }
@media (max-width: 720px) { .home-purchase-panel { width: 100%; height: 100%; border-radius: 14px; }.home-purchase-header { min-height: 63px; padding: 10px 12px; }.home-purchase-mark { flex-basis: 35px; width: 35px; height: 35px; font-size: 23px; }.home-purchase-title small { font-size: 8px; }.home-purchase-title h2 { font-size: 16px; }.home-purchase-body { padding: 13px 11px max(22px, env(safe-area-inset-bottom)); }.home-purchase-shop-grid { display: flex; flex-direction: column; }.home-purchase-offers, .home-purchase-detail { width: 100%; }.home-purchase-detail { order: -1; }.home-purchase-card, .home-purchase-result { padding: 16px; }.home-purchase-site { padding: 11px; } }
@media (max-width: 380px) { .home-purchase-mark { display: none; }.home-purchase-site { align-items: flex-start; }.home-purchase-site button { padding: 7px; }.home-purchase-refresh { padding: 6px 7px; } }
</style>
