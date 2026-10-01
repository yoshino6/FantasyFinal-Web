<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { userFacingErrorMessage } from '../api';
import { confirmHomeStorageTransfer, homeFloor, homeOverview, homeStoragePage, previewHomeStorageTransfer } from '../home-api';
import type { HomeFloor, HomeFurniture, HomeOverview, HomeStorageCategory, HomeStorageItem,
  HomeStoragePage, HomeStoragePreview, HomeStorageScope, HomeStorageSide } from '../home-api';
import InventoryItemIcon from './InventoryItemIcon.vue';

const props = withDefaults(defineProps<{ active?: boolean }>(), { active: true });
const emit = defineEmits<{ purchase: []; updated: []; 'pending-change': [pending: boolean] }>();

const overview = ref<HomeOverview | null>(null);
const floor = ref<HomeFloor | null>(null);
const selectedFloorNumber = ref(1);
const loading = ref(false);
const floorLoading = ref(false);
const error = ref('');
const floorError = ref('');
const storageScope = ref<HomeStorageScope>('storage');
const storageCategory = ref<HomeStorageCategory>('材料');
const storageCategories: HomeStorageCategory[] = ['装备', '道具', '材料'];
const storagePageNumber = ref(1);
const storageKeywordInput = ref('');
const storageKeyword = ref('');
const storageList = ref<HomeStoragePage | null>(null);
const storageLoading = ref(false);
const storageError = ref('');
const selectedStorageItem = ref<HomeStorageItem | null>(null);
const transferQuantity = ref(1);
const transferQuote = ref<HomeStoragePreview | null>(null);
const quoteReceivedAt = ref(0);
const confirmUncertain = ref(false);
const transferPending = ref(false);
const transferError = ref('');
const transferNotice = ref('');
const quoteTick = ref(0);
let overviewVersion = 0;
let floorVersion = 0;
let storageVersion = 0;

const home = computed(() => overview.value?.home ?? null);
const floorChoices = computed(() => home.value?.floors ?? []);
const currentFloor = computed(() => floor.value?.number === selectedFloorNumber.value
  ? floor.value : floorChoices.value.find(item => item.number === selectedFloorNumber.value) ?? null);
const room = computed(() => currentFloor.value?.room ?? null);
const cells = computed(() => room.value ? Array.from({ length: room.value.columns * room.value.rows }, (_, index) => index) : []);
const transferSide = computed<HomeStorageSide>(() => storageScope.value === 'backpack' ? 'deposit' : 'withdraw');
const transferBusy = computed(() => transferPending.value || confirmUncertain.value);
const quoteExpired = computed(() => {
  void quoteTick.value;
  const quote = transferQuote.value;
  if (!quote) return false;
  const lifetime = Date.parse(quote.expiresAt) - Date.parse(quote.serverTime);
  return !Number.isFinite(lifetime) || performance.now() - quoteReceivedAt.value >= Math.max(0, lifetime);
});
watch(transferBusy, value => emit('pending-change', value), { immediate: true });

function canDraw(item: HomeFurniture, selected: HomeFloor | null): boolean {
  if (!selected || item.gridX == null || item.gridY == null) return false;
  const { columns, rows } = selected.room;
  return Number.isInteger(item.gridX) && Number.isInteger(item.gridY)
    && Number.isInteger(item.width) && Number.isInteger(item.height)
    && item.gridX >= 0 && item.gridY >= 0 && item.width > 0 && item.height > 0
    && item.gridX + item.width <= columns && item.gridY + item.height <= rows;
}

const placedFurniture = computed(() => currentFloor.value?.furniture.filter(item => canDraw(item, currentFloor.value)) ?? []);

function furnitureStyle(item: HomeFurniture) {
  return {
    gridColumn: `${item.gridX! + 1} / span ${item.width}`,
    gridRow: `${item.gridY! + 1} / span ${item.height}`,
    zIndex: String(Math.max(1, item.layerOrder + 1))
  };
}

function amount(value: number) { return Number(value).toLocaleString('zh-CN'); }
function kilograms(value: number) { return `${amount(value)} kg`; }
function locationText() {
  const location = home.value?.location;
  return location ? `区域 ${location.regionId} · (${location.x}, ${location.y}, ${location.z})` : '';
}
function transferName(side: HomeStorageSide) { return side === 'deposit' ? '放入' : '取出'; }
function bindingText(binding: { unbound: number; trade: number; personal: number }) {
  return `未绑定 ${binding.unbound} · 交易绑定 ${binding.trade} · 个人绑定 ${binding.personal}`;
}
function transferAllowed(item: HomeStorageItem | null) {
  return Boolean(storageList.value && !storageLoading.value
    && item?.kind === 'stacked' && item.transferable && item.quantity > 0
    && (storageScope.value === 'storage' || storageList.value?.depositAvailable));
}
async function loadStorage() {
  if (!props.active || !home.value) return;
  const version = ++storageVersion;
  const scope = storageScope.value;
  const category = storageCategory.value;
  const page = storagePageNumber.value;
  const keyword = storageKeyword.value;
  storageLoading.value = true;
  storageError.value = '';
  try {
    const result = await homeStoragePage(scope, category, page, keyword);
    if (version !== storageVersion || !props.active || !home.value || scope !== storageScope.value
      || category !== storageCategory.value || keyword !== storageKeyword.value) return;
    storageList.value = result;
    storagePageNumber.value = result.page;
    const updated = result.items.find(item => item.kind === selectedStorageItem.value?.kind && item.id === selectedStorageItem.value?.id);
    if (selectedStorageItem.value && !transferQuote.value) selectedStorageItem.value = updated ?? null;
  } catch (cause) {
    if (version === storageVersion) storageError.value = userFacingErrorMessage(cause);
  } finally {
    if (version === storageVersion) storageLoading.value = false;
  }
}
function selectStorageScope(scope: HomeStorageScope) {
  if (transferBusy.value || scope === storageScope.value) return;
  storageScope.value = scope;
  storagePageNumber.value = 1;
  selectedStorageItem.value = null;
  storageList.value = null;
  transferQuote.value = null;
  transferError.value = '';
  void loadStorage();
}
function selectStorageCategory(category: HomeStorageCategory) {
  if (transferBusy.value || category === storageCategory.value) return;
  storageCategory.value = category;
  storagePageNumber.value = 1;
  selectedStorageItem.value = null;
  storageList.value = null;
  transferQuote.value = null;
  transferError.value = '';
  void loadStorage();
}
function searchStorage() {
  if (transferBusy.value) return;
  storageKeyword.value = storageKeywordInput.value.trim();
  storagePageNumber.value = 1;
  selectedStorageItem.value = null;
  storageList.value = null;
  transferQuote.value = null;
  void loadStorage();
}
function turnStoragePage(page: number) {
  if (transferBusy.value || !storageList.value || page < 1 || page > storageList.value.pages) return;
  storagePageNumber.value = page;
  selectedStorageItem.value = null;
  storageList.value = null;
  transferQuote.value = null;
  void loadStorage();
}
function selectStorageItem(item: HomeStorageItem) {
  if (transferBusy.value) return;
  selectedStorageItem.value = item;
  transferQuantity.value = 1;
  transferQuote.value = null;
  transferError.value = '';
  transferNotice.value = '';
}
async function previewTransfer() {
  const item = selectedStorageItem.value;
  if (transferBusy.value || !transferAllowed(item) || item?.kind !== 'stacked') return;
  if (!Number.isSafeInteger(transferQuantity.value) || transferQuantity.value < 1 || transferQuantity.value > item.quantity) {
    transferError.value = `数量须为 1 至 ${item.quantity} 的整数。`;
    return;
  }
  transferPending.value = true;
  transferError.value = '';
  transferNotice.value = '';
  transferQuote.value = null;
  try {
    const result = await previewHomeStorageTransfer(transferSide.value, item.id, transferQuantity.value);
    if (props.active && result.quote.side === transferSide.value && result.quote.itemId === item.id) {
      quoteReceivedAt.value = performance.now();
      quoteTick.value++;
      transferQuote.value = result;
    }
  } catch (cause) {
    if (props.active) { await refresh(); transferError.value = userFacingErrorMessage(cause); }
  } finally { transferPending.value = false; }
}
async function confirmTransfer() {
  const quote = transferQuote.value;
  if (!props.active || !quote || transferPending.value) return;
  if (quoteExpired.value && !confirmUncertain.value) {
    transferQuote.value = null;
    transferError.value = '报价已过期，请重新查看实际数量和容量。';
    return;
  }
  transferPending.value = true;
  transferError.value = '';
  transferNotice.value = '';
  try {
    const response = await confirmHomeStorageTransfer(quote.quote.side, quote.token, quote.idempotencyKey);
    transferQuote.value = null;
    confirmUncertain.value = false;
    selectedStorageItem.value = null;
    transferNotice.value = `已${transferName(response.result.side)}【${response.result.name}】×${response.result.quantity}。`;
    emit('updated');
    if (props.active) await refresh();
  } catch (cause) {
    if (props.active) {
      const message = userFacingErrorMessage(cause);
      const uncertain = /网络连接异常|暂时不可用|服务器返回内容异常|操作未完成|请求超时|状态码 408/.test(message);
      confirmUncertain.value = uncertain;
      if (!uncertain) transferQuote.value = null;
      await refresh();
      transferError.value = uncertain ? `${message} 原确认凭据已保留，请用原凭据核对结果。`
        : `${message} 已重新读取储物状态，请重新预览。`;
    }
  } finally { transferPending.value = false; }
}

async function loadFloor(number: number) {
  if (!props.active || !home.value) return;
  const version = ++floorVersion;
  floorLoading.value = true;
  floorError.value = '';
  try {
    const result = await homeFloor(number);
    if (version !== floorVersion || number !== selectedFloorNumber.value || !props.active) return;
    floor.value = result.floor;
  } catch (cause) {
    if (version === floorVersion) floorError.value = userFacingErrorMessage(cause);
  } finally {
    if (version === floorVersion) floorLoading.value = false;
  }
}

async function refresh() {
  if (!props.active) return;
  const version = ++overviewVersion;
  ++floorVersion;
  loading.value = true;
  floorLoading.value = false;
  error.value = '';
  floorError.value = '';
  try {
    const result = await homeOverview();
    if (version !== overviewVersion || !props.active) return;
    overview.value = result;
    if (result.home) {
      const selected = result.home.floors.find(item => item.number === selectedFloorNumber.value)
        ?? result.home.floors[0] ?? null;
      selectedFloorNumber.value = selected?.number ?? 1;
      floor.value = selected;
      if (selected) void loadFloor(selected.number);
      await loadStorage();
    } else {
      floor.value = null;
      storageList.value = null;
    }
  } catch (cause) {
    if (version === overviewVersion) error.value = userFacingErrorMessage(cause);
  } finally {
    if (version === overviewVersion) loading.value = false;
  }
}

function selectFloor(number: number) {
  if (number === selectedFloorNumber.value) return;
  selectedFloorNumber.value = number;
  floor.value = floorChoices.value.find(item => item.number === number) ?? null;
  void loadFloor(number);
}

watch(() => props.active, (active, _previous, onCleanup) => {
  if (active) {
    const interval = window.setInterval(() => { quoteTick.value++; }, 1000);
    onCleanup(() => window.clearInterval(interval));
    void refresh();
  } else {
    ++overviewVersion;
    ++floorVersion;
    ++storageVersion;
    loading.value = false;
    floorLoading.value = false;
    storageLoading.value = false;
  }
}, { immediate: true });

defineExpose({ refresh });
</script>

<template>
  <section v-if="active" class="home-panel" aria-label="家园总览">
    <header class="home-heading">
      <span class="home-muted">楼层 · 储物</span>
      <button type="button" class="home-refresh" :disabled="loading || transferPending" @click="refresh">{{ loading ? '加载中…' : '刷新' }}</button>
    </header>

    <p v-if="error" class="home-error" role="alert">{{ error }}</p>
    <p v-if="loading && !overview" class="home-empty">正在读取家园…</p>

    <template v-if="overview && !overview.owned">
      <div class="home-unowned">
        <div class="home-unowned-mark" aria-hidden="true">⌂</div>
        <div>
          <h3>尚未拥有小屋</h3>
          <p>购置地点标识：{{ overview.purchase.siteCode }}</p>
          <p>购置费用：{{ amount(overview.purchase.copper) }} 铜币<span v-if="overview.purchase.locationRequired"> · 需抵达地点</span></p>
          <button type="button" class="home-refresh" @click="emit('purchase')">查看购置地点</button>
        </div>
      </div>
    </template>

    <template v-else-if="home">
      <div class="home-summary">
        <div class="home-title-row">
          <div>
            <h3>{{ home.name }}</h3>
            <p class="home-location">{{ locationText() }}</p>
          </div>
          <div class="home-badges">
            <span>等级 {{ home.level }}</span>
            <span>{{ home.floorCount }} 层</span>
            <span>{{ home.furnitureCount }} 件家具</span>
          </div>
        </div>
        <div class="home-state-row">
          <span v-if="home.inHome">当前在小屋内</span>
          <span v-else-if="home.atPlot">当前在小屋地块</span>
          <span v-else>当前不在小屋地块</span>
        </div>
      </div>

      <div class="home-content-grid">
        <section class="home-card home-floor-card" aria-label="楼层布局">
          <div class="home-section-head">
            <div>
              <h3>楼层布局</h3>
            </div>
            <span v-if="floorLoading" class="home-muted">同步中…</span>
          </div>
          <div class="home-floor-tabs" role="group" aria-label="选择楼层">
            <button v-for="choice in floorChoices" :key="choice.number" type="button"
              :class="{ selected: selectedFloorNumber === choice.number }"
              :aria-pressed="selectedFloorNumber === choice.number" @click="selectFloor(choice.number)">
              {{ choice.number }}F <small>{{ choice.slotsUsed }}/{{ choice.slotsTotal }} 槽</small>
            </button>
          </div>
          <p v-if="floorError" class="home-error" role="alert">{{ floorError }}</p>
          <template v-if="currentFloor && room">
            <div class="home-room-meta">
              <span>{{ room.columns }} × {{ room.rows }} 格</span>
              <span>家具槽 {{ currentFloor.slotsUsed }}/{{ currentFloor.slotsTotal }}</span>
            </div>
            <div class="home-grid-scroll">
              <div class="home-room-grid" :style="{ '--cols': room.columns, '--rows': room.rows }">
                <span v-for="cell in cells" :key="cell" class="home-room-cell" aria-hidden="true"
                  :style="{ gridColumn: String(cell % room.columns + 1), gridRow: String(Math.floor(cell / room.columns) + 1) }"></span>
                <div v-for="item in placedFurniture" :key="item.id" class="home-room-furniture"
                  :style="furnitureStyle(item)" :title="`${item.name} · (${item.gridX}, ${item.gridY}) · ${item.width}×${item.height} 格`"
                  :aria-label="`${item.name}，位置 ${item.gridX}, ${item.gridY}，占 ${item.width} × ${item.height} 格`">
                  <span>{{ item.name }}</span>
                </div>
              </div>
            </div>
            <p class="home-grid-note">格子位置以服务端记录为准；家具坐标见下方列表。</p>
            <p v-if="currentFloor.layoutPending" class="home-layout-notice">部分旧家具尚无格子位置，已列在下方，未绘入房间。</p>
            <div v-if="currentFloor.furniture.length" class="home-furniture-list">
              <h4>本层家具 <span>{{ currentFloor.furniture.length }} 件</span></h4>
              <ul>
                <li v-for="item in currentFloor.furniture" :key="item.id">
                  <span class="home-furniture-symbol" aria-hidden="true">▦</span>
                  <span class="home-furniture-name">{{ item.name }}</span>
                  <small v-if="canDraw(item, currentFloor)">({{ item.gridX }}, {{ item.gridY }}) · {{ item.width }}×{{ item.height }} 格</small>
                  <small v-else>{{ item.gridX == null || item.gridY == null ? '位置未记录' : '坐标无法绘制' }}</small>
                </li>
              </ul>
            </div>
            <p v-else class="home-empty">这一层还没有摆放家具。</p>
          </template>
        </section>

        <section class="home-card home-storage-card" aria-label="家园储物">
          <div class="home-section-head">
            <div>
              <h3>家园储物</h3>
            </div>
            <span class="home-storage-remote">可远程管理</span>
          </div>
          <div class="home-storage-amount"><strong>{{ kilograms(storageList?.usedKg ?? home.storage.usedKg) }}</strong><span> / {{ kilograms(storageList?.capacityKg ?? home.storage.capacityKg) }}</span></div>
          <div class="home-storage-track" role="progressbar" :aria-valuenow="Math.min(storageList?.usedKg ?? home.storage.usedKg, storageList?.capacityKg ?? home.storage.capacityKg)" :aria-valuemax="storageList?.capacityKg ?? home.storage.capacityKg" aria-valuemin="0" aria-label="储物重量">
            <span :style="{ width: `${Math.min(100, (storageList?.capacityKg ?? home.storage.capacityKg) > 0 ? (storageList?.usedKg ?? home.storage.usedKg) / (storageList?.capacityKg ?? home.storage.capacityKg) * 100 : 0)}%` }"></span>
          </div>
          <p v-if="(storageList?.capacityKg ?? home.storage.capacityKg) === 0" class="home-layout-notice">尚未摆放储物箱，暂不能放入；仓储中已有的物品仍可查看和取出。</p>
          <div class="home-storage-stats">
            <div><strong>{{ amount(home.storage.stackedKinds) }}</strong><span>堆叠种类</span></div>
            <div><strong>{{ amount(home.storage.stackedQuantity) }}</strong><span>堆叠数量</span></div>
            <div><strong>{{ amount(home.storage.instanceCount) }}</strong><span>独立物品</span></div>
          </div>
          <div class="home-storage-scope" role="group" aria-label="查看储物来源">
            <button type="button" :class="{ selected: storageScope === 'storage' }" :disabled="transferBusy" @click="selectStorageScope('storage')">仓储</button>
            <button type="button" :class="{ selected: storageScope === 'backpack' }" :disabled="transferBusy" @click="selectStorageScope('backpack')">可放入</button>
          </div>
          <div class="home-storage-categories" role="group" aria-label="储物分类">
            <button v-for="category in storageCategories" :key="category" type="button" :class="{ selected: storageCategory === category }" :disabled="transferBusy" @click="selectStorageCategory(category)">{{ category }}</button>
          </div>
          <form class="home-storage-search" @submit.prevent="searchStorage">
            <input v-model="storageKeywordInput" type="search" maxlength="80" placeholder="搜索物品名称" aria-label="搜索储物物品" :disabled="transferBusy" />
            <button type="submit" :disabled="transferBusy || storageLoading">搜索</button>
          </form>
          <p v-if="storageError" class="home-error" role="alert">{{ storageError }} <button type="button" class="home-text-button" :disabled="storageLoading" @click="loadStorage">重试</button></p>
          <p v-if="storageLoading" class="home-empty">正在读取{{ storageScope === 'storage' ? '仓储' : '可放入' }}物品…</p>
          <template v-if="storageList">
            <p class="home-storage-count">{{ storageScope === 'storage' ? '仓储' : '可放入物品' }} · 共 {{ storageList.count }} 项 · 第 {{ storageList.page }}/{{ storageList.pages }} 页</p>
            <div v-if="storageList.items.length" class="home-storage-items">
              <button v-for="item in storageList.items" :key="`${item.kind}:${item.id}`" type="button" class="home-storage-item"
                :class="{ selected: selectedStorageItem?.kind === item.kind && selectedStorageItem?.id === item.id }" :disabled="transferBusy || storageLoading" @click="selectStorageItem(item)">
                <InventoryItemIcon :name="item.name" :code="item.code" :codex-id="item.codexId" :item-category="item.itemCategory" :instance="item.kind === 'instance'" />
                <span class="home-storage-item-copy"><strong>{{ item.name }}</strong><small>{{ item.itemCategory }} · {{ item.kind === 'stacked' ? `×${item.quantity}` : `品质 ${item.quality}% · 仅查看` }}</small></span>
                <span class="home-storage-item-weight">{{ kilograms(item.weight) }}{{ item.kind === 'stacked' ? '/个' : '' }}</span>
              </button>
            </div>
            <p v-else-if="!storageLoading" class="home-empty">当前筛选没有物品。</p>
            <div class="home-storage-pager"><button type="button" :disabled="transferBusy || storageLoading || storageList.page <= 1" @click="turnStoragePage(storageList.page - 1)">上一页</button><span>{{ storageList.page }} / {{ storageList.pages }}</span><button type="button" :disabled="transferBusy || storageLoading || storageList.page >= storageList.pages" @click="turnStoragePage(storageList.page + 1)">下一页</button></div>
          </template>
          <div v-if="selectedStorageItem" class="home-storage-selection">
            <strong>{{ selectedStorageItem.name }}</strong>
            <p v-if="selectedStorageItem.description">{{ selectedStorageItem.description }}</p>
            <template v-if="selectedStorageItem.kind === 'stacked'">
              <p>当前{{ storageScope === 'storage' ? '仓储' : '可放入' }} {{ selectedStorageItem.quantity }} 个 · {{ bindingText(selectedStorageItem.binding) }}</p>
              <div class="home-storage-transfer"><label>数量 <input v-model.number="transferQuantity" type="number" min="1" :max="selectedStorageItem.quantity" step="1" inputmode="numeric" :disabled="transferBusy || Boolean(transferQuote)" /></label><button type="button" :disabled="transferBusy || Boolean(transferQuote) || !transferAllowed(selectedStorageItem)" @click="previewTransfer">查看{{ transferName(transferSide) }}报价</button></div>
              <small v-if="storageScope === 'backpack' && !transferAllowed(selectedStorageItem)">摆放储物箱后才能放入。</small>
            </template>
            <p v-else>独立物品仅供查看，当前不支持在网页存取。</p>
          </div>
          <p v-if="transferNotice" class="home-storage-success" role="status">{{ transferNotice }}</p>
          <p v-if="transferError" class="home-error" role="alert">{{ transferError }}</p>
          <div v-if="transferQuote" class="home-storage-quote" aria-label="储物转移确认">
            <h4>{{ transferName(transferQuote.quote.side) }}预览 · {{ transferQuote.quote.name }} × {{ transferQuote.quote.quantity }}</h4>
            <p>当前 {{ kilograms(transferQuote.quote.usedWeightBefore) }} → 操作后 {{ kilograms(transferQuote.quote.usedWeightAfter) }} / 容量 {{ kilograms(transferQuote.quote.capacity) }}</p>
            <p>本次{{ transferName(transferQuote.quote.side) }}重量 {{ kilograms(transferQuote.quote.weightEach * transferQuote.quote.quantity) }}；来源现有 {{ transferQuote.quote.ownedBefore }} 个。</p>
            <p v-if="transferQuote.quote.side === 'deposit'">扣除：{{ bindingText(transferQuote.quote.bindingUsed) }}</p>
            <p v-else>返还背包：{{ bindingText(transferQuote.quote.bindingReturned) }}</p>
            <small>报价有效至 {{ new Date(transferQuote.expiresAt).toLocaleString('zh-CN') }}；确认时服务端会重新核对数量、绑定和容量。</small>
            <p v-if="confirmUncertain" class="home-storage-warning">确认响应尚未明确，已保留原凭据。请用原凭据核对结果，完成前不要离开此页。</p>
            <p v-else-if="quoteExpired" class="home-storage-warning">报价已过期，请重新预览。</p>
            <div class="home-storage-quote-actions"><button type="button" :disabled="transferBusy" @click="transferQuote = null">返回修改</button><button type="button" class="home-storage-confirm" :disabled="transferPending || (quoteExpired && !confirmUncertain)" @click="confirmTransfer">{{ confirmUncertain ? '用原凭据核对结果' : `确认${transferName(transferQuote.quote.side)}` }}</button></div>
          </div>
        </section>
      </div>
    </template>
  </section>
</template>

<style scoped>
.home-panel { color: #3b3446; max-width: 1200px; margin: 0 auto; padding: 16px clamp(12px, 2.5vw, 28px) 32px; }
.home-heading, .home-title-row, .home-section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.home-heading { align-items: center; margin-bottom: 12px; }
.home-heading h2 { font-size: 18px; margin: 0 0 3px; color: #372944; }
.home-subtitle, .home-location, .home-muted { color: #847b8d; }
.home-subtitle, .home-location { margin: 0; font-size: 13px; }
.home-eyebrow, .home-kicker { margin: 0; color: #a786a3; font-size: 10px; font-weight: 800; letter-spacing: .16em; }
.home-refresh { flex: none; border: 1px solid #d8cadd; border-radius: 999px; padding: 8px 17px; background: #fff; color: #705775; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
.home-refresh:hover:not(:disabled) { background: #faf2fc; }
.home-refresh:disabled { opacity: .6; cursor: default; }
.home-error { background: #fff0ed; color: #aa4f44; border: 1px solid #efd2c9; border-radius: 10px; padding: 10px 12px; font-size: 13px; }
.home-unowned, .home-summary, .home-card { border: 1px solid #e9e0e9; border-radius: 18px; background: #fffdfd; box-shadow: 0 8px 28px #6d4e7910; }
.home-unowned { display: flex; align-items: center; gap: 18px; padding: 26px; }
.home-unowned-mark { display: grid; place-items: center; width: 76px; height: 76px; flex: none; background: #f7eef7; color: #a878aa; font-size: 47px; border-radius: 19px; }
.home-unowned h3 { margin: 0 0 8px; font-size: 20px; }
.home-unowned p { margin: 4px 0; color: #766d7d; font-size: 13px; overflow-wrap: anywhere; }
.home-summary { padding: 20px 24px 16px; margin-bottom: 16px; background: linear-gradient(120deg, #fffdfd, #fbf4fc); }
.home-summary h3 { margin: 4px 0 6px; font-size: clamp(19px, 2.4vw, 26px); color: #3c2949; }
.home-badges { display: flex; flex-wrap: wrap; gap: 6px; justify-content: flex-end; }
.home-badges span, .home-state-row span { display: inline-block; border-radius: 999px; background: #f3e8f4; color: #7c5b82; padding: 5px 10px; font-size: 12px; white-space: nowrap; }
.home-state-row { margin-top: 13px; }
.home-state-row span { background: #f7f4f8; color: #80718a; }
.home-content-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; gap: 16px; }
.home-card { min-width: 0; padding: 18px; }
.home-section-head h3 { margin: 4px 0 0; color: #412e4d; font-size: 18px; }
.home-muted { font-size: 12px; }
.home-floor-tabs { display: flex; gap: 7px; flex-wrap: wrap; margin: 18px 0 14px; }
.home-floor-tabs button { background: #f7f2f8; border: 1px solid #ebdfef; border-radius: 10px; color: #78657e; cursor: pointer; font: inherit; font-weight: 800; padding: 8px 12px; min-width: 76px; }
.home-floor-tabs button.selected { background: #866492; color: white; border-color: #866492; }
.home-floor-tabs small { display: block; font-size: 10px; font-weight: 500; }
.home-room-meta { display: flex; justify-content: space-between; gap: 10px; color: #867a8c; font-size: 12px; margin-bottom: 7px; }
.home-grid-scroll { overflow-x: auto; border: 1px solid #e7d9e6; border-radius: 12px; background: #fdf9fc; padding: 8px; }
.home-room-grid { display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); grid-template-rows: repeat(var(--rows), minmax(0, 1fr)); width: 100%; aspect-ratio: var(--cols) / var(--rows); position: relative; overflow: hidden; background: #fffaf6; border: 2px solid #bfadb6; border-radius: 4px; }
.home-room-cell { min-width: 0; min-height: 0; border-right: 1px solid #eadfe4; border-bottom: 1px solid #eadfe4; }
.home-room-furniture { display: grid; place-items: center; min-width: 0; min-height: 0; margin: 1px; padding: 1px 2px; background: #dbb9d4; border: 1px solid #b381b1; border-radius: 3px; color: #573a59; font-size: clamp(8px, 1.1vw, 11px); font-weight: 800; text-align: center; cursor: help; overflow: hidden; }
.home-room-furniture span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.home-grid-note, .home-layout-notice { font-size: 11px; line-height: 1.5; color: #8b818e; margin: 8px 1px 0; }
.home-layout-notice { color: #956b51; background: #fff6e9; border-radius: 7px; padding: 7px 9px; }
.home-furniture-list { margin-top: 17px; }
.home-furniture-list h4 { margin: 0 0 9px; font-size: 13px; color: #54445d; }
.home-furniture-list h4 span { font-weight: 500; color: #978b9e; }
.home-furniture-list ul { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
.home-furniture-list li { display: flex; align-items: center; gap: 7px; min-width: 0; padding: 7px 9px; background: #faf7fb; border-radius: 8px; font-size: 12px; }
.home-furniture-symbol { color: #b187b1; }
.home-furniture-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.home-furniture-list small { flex: none; color: #93899b; }
.home-empty { color: #8b818e; font-size: 13px; }
.home-storage-amount { margin-top: 25px; white-space: nowrap; }
.home-storage-amount strong { font-size: 22px; color: #4a3455; }
.home-storage-amount span { font-size: 12px; color: #958999; }
.home-storage-track { height: 9px; margin-top: 10px; border-radius: 999px; background: #eee7ef; overflow: hidden; }
.home-storage-track span { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #b38ec0, #d6a0bd); }
.home-storage-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; margin-top: 22px; }
.home-storage-stats div { display: flex; flex-direction: column; gap: 4px; min-width: 0; background: #faf5fa; border-radius: 9px; padding: 9px 5px; text-align: center; }
.home-storage-stats strong { font-size: 15px; color: #5d4564; }
.home-storage-stats span { font-size: 10px; color: #948797; }
.home-storage-remote { flex: none; padding: 5px 8px; border-radius: 999px; color: #568574; background: #eaf7ee; font-size: 10px; font-weight: 800; }
.home-storage-scope, .home-storage-categories { display: flex; gap: 6px; margin-top: 14px; overflow-x: auto; }
.home-storage-categories { margin-top: 8px; }
.home-storage-scope button, .home-storage-categories button { flex: none; min-height: 34px; padding: 6px 13px; border: 1px solid #e9dce9; border-radius: 9px; background: #faf6fb; color: #806d88; font: inherit; font-size: 12px; cursor: pointer; }
.home-storage-scope button.selected, .home-storage-categories button.selected { color: #fff; background: #866492; border-color: #866492; font-weight: 800; }
.home-storage-scope button:disabled, .home-storage-categories button:disabled { opacity: .55; cursor: default; }
.home-storage-search { display: flex; gap: 7px; margin-top: 11px; }
.home-storage-search input { flex: 1; min-width: 0; min-height: 35px; padding: 7px 10px; border: 1px solid #e4d7e5; border-radius: 9px; background: white; color: #59465f; font: inherit; font-size: 12px; }
.home-storage-search button, .home-storage-pager button, .home-text-button { flex: none; min-height: 35px; padding: 7px 11px; border: 1px solid #e3d4e5; border-radius: 9px; background: #f7f0f8; color: #755d7d; font: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.home-text-button { min-height: 25px; padding: 3px 8px; margin-left: 4px; }
.home-storage-search button:disabled, .home-storage-pager button:disabled, .home-text-button:disabled { opacity: .48; cursor: default; }
.home-storage-count { margin: 12px 0 8px; color: #8c7f90; font-size: 11px; }
.home-storage-items { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 7px; }
.home-storage-item { display: grid; grid-template-columns: 42px minmax(0, 1fr); align-items: center; gap: 3px 7px; min-width: 0; min-height: 61px; padding: 7px; border: 1px solid #ece3ed; border-radius: 10px; background: #fdfafd; color: #58495f; text-align: left; font: inherit; cursor: pointer; }
.home-storage-item.selected { border-color: #ae84b7; background: #f9f0fb; box-shadow: inset 0 0 0 1px #d5b6d9; }
.home-storage-item:disabled { opacity: .62; cursor: default; }
.home-storage-item :deep(.inventory-art-wrap) { grid-row: span 2; width: 40px; height: 40px; margin: 0; }
.home-storage-item :deep(.inventory-item-image) { width: 40px; height: 40px; }
.home-storage-item-copy { min-width: 0; display: grid; gap: 3px; }
.home-storage-item-copy strong, .home-storage-item-copy small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.home-storage-item-copy strong { font-size: 12px; }
.home-storage-item-copy small, .home-storage-item-weight { color: #9b8d9e; font-size: 10px; }
.home-storage-item-weight { grid-column: 2; }
.home-storage-pager { display: flex; justify-content: center; align-items: center; gap: 9px; margin-top: 11px; color: #8c7f90; font-size: 11px; }
.home-storage-selection, .home-storage-quote { margin-top: 14px; padding: 12px; border: 1px solid #e7d8e7; border-radius: 11px; background: #fcf7fc; }
.home-storage-selection > strong { color: #624e6a; font-size: 13px; }
.home-storage-selection p, .home-storage-quote p { margin: 6px 0; color: #837489; font-size: 11px; line-height: 1.5; }
.home-storage-selection small, .home-storage-quote small { color: #9a7e89; font-size: 11px; line-height: 1.5; }
.home-storage-transfer { display: flex; align-items: end; gap: 7px; margin-top: 10px; }
.home-storage-transfer label { display: grid; gap: 4px; min-width: 86px; color: #806f87; font-size: 11px; }
.home-storage-transfer input { width: 94px; min-height: 36px; padding: 6px 8px; border: 1px solid #dfd0e2; border-radius: 8px; background: white; color: #58465e; font: inherit; }
.home-storage-transfer button, .home-storage-quote-actions button { min-height: 36px; padding: 7px 11px; border: 0; border-radius: 8px; background: #8a69a0; color: white; font: inherit; font-size: 11px; font-weight: 800; cursor: pointer; }
.home-storage-transfer button:disabled, .home-storage-quote-actions button:disabled { opacity: .5; cursor: default; }
.home-storage-quote { border-color: #d7bbdc; background: #f8eff9; }
.home-storage-quote h4 { margin: 0 0 9px; color: #654b70; font-size: 13px; }
.home-storage-quote .home-storage-warning { color: #a5584c; font-weight: 800; }
.home-storage-quote-actions { display: flex; justify-content: flex-end; gap: 7px; margin-top: 12px; }
.home-storage-quote-actions button:first-child { color: #795f81; background: white; border: 1px solid #e0cfe4; }
.home-storage-success { padding: 9px 10px; border-radius: 8px; color: #4f7c5e; background: #eaf7ed; font-size: 12px; }
@media (max-width: 760px) { .home-panel { padding: 12px 10px 24px; } .home-content-grid { grid-template-columns: minmax(0, 1fr); } .home-summary { padding: 17px; } .home-title-row { display: block; } .home-badges { justify-content: flex-start; margin-top: 12px; } .home-card { padding: 14px; } .home-room-furniture { font-size: 8px; } }
@media (max-width: 400px) { .home-unowned { padding: 16px; gap: 11px; } .home-unowned-mark { width: 55px; height: 55px; font-size: 34px; } .home-furniture-list li { flex-wrap: wrap; } .home-furniture-list small { margin-left: 20px; } .home-storage-item { grid-template-columns: 34px minmax(0, 1fr); padding: 6px; gap: 3px 5px; }.home-storage-item :deep(.inventory-art-wrap), .home-storage-item :deep(.inventory-item-image) { width: 33px; height: 33px; } .home-storage-transfer { flex-wrap: wrap; } }
</style>
