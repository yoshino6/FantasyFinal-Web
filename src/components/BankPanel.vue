<script setup lang="ts">
import '../anime-growth-commerce.css';
import '../game-ui-shops.css';
import AnimeIcon from './AnimeIcon.vue';
import GameUiFeedbackArt from './GameUiFeedbackArt.vue';
import { computed, nextTick, ref, watch } from 'vue';
import { userFacingErrorMessage } from '../api';
import * as bankApi from '../bank-api';
import type {
  BankActionInput, BankDeposit, BankOverview, BankPreview, BankProductCode,
  BankQuote, BankSettlementQuote, BankTermQuote, BankTransferQuote
} from '../bank-api';

type Tab = 'overview' | 'deposits' | 'products';
const props = withDefaults(defineProps<{ open: boolean; targetId?: string }>(), { targetId: bankApi.BANK_TARGET_ID });
const emit = defineEmits<{ close: []; updated: [] }>();
const tab = ref<Tab>('overview');
const overview = ref<BankOverview | null>(null);
const gateOpen = ref(false);
const loading = ref(false);
const pending = ref(false);
const error = ref('');
const notice = ref('');
const transferAction = ref<'deposit' | 'withdraw'>('deposit');
const transferAmount = ref<number | null>(null);
const productCode = ref<BankProductCode>('seven');
const termAmount = ref<number | null>(null);
const selectedDeposit = ref<BankDeposit | null>(null);
const depositLoading = ref(false);
const depositError = ref('');
const preview = ref<BankPreview | null>(null);
const previewInput = ref<BankActionInput | null>(null);
const uncertainConfirmToken = ref<string | null>(null);
const now = ref(Date.now());
const closeButton = ref<HTMLButtonElement | null>(null);
const quoteCard = ref<HTMLElement | null>(null);
let overviewVersion = 0;
let depositVersion = 0;

const summary = computed(() => overview.value?.summary ?? null);
const chosenProduct = computed(() => overview.value?.products.find(item => item.code === productCode.value) ?? null);
const quoteExpired = computed(() => preview.value ? now.value >= new Date(preview.value.expiresAt).getTime() : false);
const canRetryConfirmation = computed(() => Boolean(preview.value && uncertainConfirmToken.value === preview.value.token));
function requestClose() { if (!pending.value && !canRetryConfirmation.value) emit('close'); }
const openDeposits = computed(() => summary.value?.deposits.filter(item => item.status === 'open') ?? []);
const recentDeposits = computed(() => summary.value?.deposits.filter(item => item.status !== 'open') ?? []);

function coins(value: number | null | undefined) { return value == null ? '—' : `${value.toLocaleString('zh-CN')} 铜币`; }
function dateText(value: number | string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('zh-CN');
}
function statusText(value: string) {
  return ({ open: '进行中', matured: '已到期兑付', early: '已提前支取' } as Record<string, string>)[value] ?? value;
}
function locationError(message: string) { return /建筑入口|安全区|旅行途中|战斗中|无法办理/.test(message); }

async function loadOverview() {
  if (!props.open) return;
  const version = ++overviewVersion;
  if (props.targetId !== bankApi.BANK_TARGET_ID) {
    gateOpen.value = false;
    loading.value = false;
    error.value = '请从银铃钱庄建筑点位进入。';
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    const result = await bankApi.bankOverview();
    if (version !== overviewVersion) return;
    overview.value = result;
    gateOpen.value = true;
    if (!result.products.some(item => item.code === productCode.value) && result.products[0]) productCode.value = result.products[0].code;
  } catch (cause) {
    if (version === overviewVersion) {
      gateOpen.value = false;
      error.value = userFacingErrorMessage(cause);
    }
  } finally {
    if (version === overviewVersion) loading.value = false;
  }
}

async function loadDeposit(id: number) {
  if (!gateOpen.value) return;
  const version = ++depositVersion;
  depositLoading.value = true;
  depositError.value = '';
  try {
    const result = await bankApi.bankDeposit(id);
    if (version === depositVersion) selectedDeposit.value = result;
  } catch (cause) {
    if (version === depositVersion) {
      const message = userFacingErrorMessage(cause);
      depositError.value = message;
      if (locationError(message)) { gateOpen.value = false; error.value = message; }
    }
  } finally {
    if (version === depositVersion) depositLoading.value = false;
  }
}

async function refreshState() {
  const actionError = error.value;
  await loadOverview();
  if (gateOpen.value && actionError) error.value = actionError;
  if (gateOpen.value && selectedDeposit.value) await loadDeposit(selectedDeposit.value.id);
}

watch(() => props.open, async (open, _previous, onCleanup) => {
  ++overviewVersion; ++depositVersion;
  if (!open) {
    preview.value = null; previewInput.value = null;
    return;
  }
  now.value = Date.now();
  const timer = window.setInterval(() => { now.value = Date.now(); }, 1000);
  onCleanup(() => window.clearInterval(timer));
  await nextTick(); closeButton.value?.focus();
  void loadOverview();
}, { immediate: true });
watch(() => props.targetId, () => { if (props.open) void loadOverview(); });
watch([tab, transferAction, transferAmount, productCode, termAmount, () => selectedDeposit.value?.id], () => {
  preview.value = null; previewInput.value = null;
});

function switchTab(next: Tab) {
  if (pending.value || tab.value === next) return;
  tab.value = next; notice.value = '';
  preview.value = null; previewInput.value = null;
}
function selectDeposit(id: number) {
  selectedDeposit.value = null;
  void loadDeposit(id);
}
function closeDeposit() {
  if (pending.value) return;
  ++depositVersion;
  selectedDeposit.value = null; depositError.value = ''; depositLoading.value = false;
  preview.value = null; previewInput.value = null;
}
function validAmount(value: number | null, label: string) {
  if (!Number.isSafeInteger(value) || Number(value) < 1 || Number(value) > 99_999_999) throw new Error(`${label}须为 1 至 99999999 的整数铜币。`);
  return Number(value);
}
function actionLabel(input: BankActionInput | null, quote?: BankQuote) {
  if (!input) return '钱庄操作';
  if (input.action === 'deposit') return '存入活期';
  if (input.action === 'withdraw') return '取出活期';
  if (input.action === 'term_open') return '开立定存';
  return quote && 'matured' in quote && quote.matured ? '到期兑付' : input.action === 'early_settle' ? '提前支取' : '到期兑付';
}

async function requestPreview(input: BankActionInput) {
  if (pending.value || canRetryConfirmation.value || !gateOpen.value) return;
  pending.value = true; error.value = ''; depositError.value = ''; notice.value = '';
  preview.value = null; previewInput.value = null;
  try {
    preview.value = await bankApi.previewBankAction(input);
    previewInput.value = input;
    await nextTick(); quoteCard.value?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } catch (cause) {
    error.value = userFacingErrorMessage(cause);
    await refreshState();
  } finally { pending.value = false; }
}
function previewTransfer() {
  try { void requestPreview({ action: transferAction.value, amount: validAmount(transferAmount.value, '金额') }); }
  catch (cause) { error.value = userFacingErrorMessage(cause); }
}
function previewTerm() {
  try {
    const amount = validAmount(termAmount.value, '本金');
    if (chosenProduct.value && amount < chosenProduct.value.minCopper) throw new Error(`${chosenProduct.value.name}最低本金为 ${coins(chosenProduct.value.minCopper)}。`);
    void requestPreview({ action: 'term_open', amount, productCode: productCode.value });
  } catch (cause) { error.value = userFacingErrorMessage(cause); }
}
function previewSettlement(action: 'settle' | 'early_settle') {
  if (!selectedDeposit.value?.availableActions.includes(action)) return;
  void requestPreview({ action, depositId: selectedDeposit.value.id });
}

async function confirm() {
  const quote = preview.value;
  if (!quote || !previewInput.value || pending.value) return;
  if (Date.now() >= new Date(quote.expiresAt).getTime() && !canRetryConfirmation.value) {
    error.value = '钱庄报价已过期，请重新预览。'; preview.value = null; previewInput.value = null; return;
  }
  const input = previewInput.value;
  pending.value = true; error.value = '';
  try {
    const response = await bankApi.confirmBankAction(quote.token, quote.idempotencyKey);
    uncertainConfirmToken.value = null;
    preview.value = null; previewInput.value = null;
    notice.value = `${actionLabel(input, response.result)}已完成。`;
    emit('updated');
    await refreshState();
    if (input.action === 'term_open' && 'id' in response.result && typeof response.result.id === 'number') {
      tab.value = 'deposits';
      await loadDeposit(response.result.id);
    }
  } catch (cause) {
    const message = userFacingErrorMessage(cause);
    const uncertain = /网络连接异常|暂时不可用|服务器返回内容异常|操作未完成|请求超时|状态码 408/.test(message);
    uncertainConfirmToken.value = uncertain ? quote.token : null;
    error.value = uncertain ? `${message} 请先核对钱庄余额和存单；可用原凭据安全核对结果。` : message;
    if (!uncertain) { preview.value = null; previewInput.value = null; }
    await refreshState();
  } finally { pending.value = false; }
}

function quoteLines(quote: BankQuote): string[] {
  if ('direction' in quote) {
    const transfer = quote as BankTransferQuote;
    return [
      `办理金额：${coins(transfer.copper)}`,
      `随身余额：${coins(transfer.pocketBefore)} → ${coins(transfer.pocketAfter)}`,
      `活期余额：${coins(transfer.demandBefore)} → ${coins(transfer.demandAfter)}`
    ];
  }
  if ('depositId' in quote) {
    const settlement = quote as BankSettlementQuote;
    return [
      `存单 #${settlement.depositId} · 本金 ${coins(settlement.principal)}`,
      `实际到账：${coins(settlement.credit)}${settlement.penalty ? ` · 提前支取扣减 ${coins(settlement.penalty)}` : ''}`,
      `结算利息：${coins(settlement.interest)}`,
      `活期余额：${coins(settlement.demandBefore)} → ${coins(settlement.demandAfter)}`
    ];
  }
  const term = quote as BankTermQuote;
  return [
    `${term.name} · 本金 ${coins(term.copper)}`,
    `实际预留利息：${coins(term.interest)} · 到期 ${dateText(term.due)}`,
    `活期余额：${coins(term.demandBefore)} → ${coins(term.demandAfter)}`
  ];
}
</script>

<template>
  <Teleport to="body"><div v-if="open" class="bank-backdrop" role="presentation" @click.self="requestClose"><section class="bank-dialog anime-growth-commerce shop-ledger-painted" role="dialog" aria-modal="true" aria-label="银铃钱庄" @keydown.esc="requestClose"><header class="bank-header"><span class="bank-mark"><AnimeIcon name="coin" :size="36" /></span><div><small>资金总览 · 存单账簿</small><h2>{{ overview?.target.name ?? '银铃钱庄' }}</h2></div><span class="location-tag">建筑入口办理</span><button ref="closeButton" type="button" aria-label="关闭银铃钱庄" :disabled="pending || canRetryConfirmation" @click="requestClose"><AnimeIcon name="close" :size="25" /></button></header>
    <nav class="bank-tabs" aria-label="钱庄栏目"><button type="button" :class="{ active: tab === 'overview' }" :disabled="pending" @click="switchTab('overview')">概览</button><button type="button" :class="{ active: tab === 'deposits' }" :disabled="pending" @click="switchTab('deposits')">存单</button><button type="button" :class="{ active: tab === 'products' }" :disabled="pending" @click="switchTab('products')">定存产品</button></nav>
    <div class="bank-body"><p v-if="notice" class="notice" role="status">{{ notice }}</p><p v-if="error" class="error" role="alert">{{ error }}</p><p v-if="canRetryConfirmation" class="error" role="status">确认结果尚未确定，请用原凭据核对。核对完成前暂不能关闭或修改报价；网络持续不可用时请保持页面打开，稍后重试。</p><p v-if="loading" class="state game-ui-empty-message" role="status"><GameUiFeedbackArt name="loading" :size="36" /><span>正在核对钱庄与位置…</span></p><div v-if="!gateOpen && !loading" class="gate-state"><span class="shop-gate-art" aria-hidden="true"><AnimeIcon name="home" :size="40" /></span><h3>暂不能办理</h3><p>{{ error || '请站在银铃钱庄建筑入口，并保持可办理业务的状态。' }}</p><button type="button" :disabled="pending" @click="loadOverview">重新核对</button></div>
      <template v-if="gateOpen && summary"><div class="balances"><div><AnimeIcon name="coin" :size="35" /><small>随身铜币</small><strong>{{ coins(summary.pocket) }}</strong></div><div><AnimeIcon name="coin" :size="35" /><small>活期余额</small><strong>{{ coins(summary.demand) }}</strong></div><div><AnimeIcon name="scroll" :size="35" /><small>未结定存</small><strong>{{ summary.openCount }} / 3 张</strong></div></div>
        <template v-if="tab === 'overview'"><p class="intro">存入与取出均在银铃钱庄入口办理，确认前会展示随身与活期余额变化。</p><div class="transfer-card"><div class="segment"><button type="button" :class="{ active: transferAction === 'deposit' }" :disabled="pending" @click="transferAction = 'deposit'">存入活期</button><button type="button" :class="{ active: transferAction === 'withdraw' }" :disabled="pending" @click="transferAction = 'withdraw'">取出活期</button></div><label>金额（铜币）<input v-model.number="transferAmount" type="number" min="1" max="99999999" step="1" inputmode="numeric" placeholder="输入整数金额" /></label><p class="quiet">{{ transferAction === 'deposit' ? `当前随身 ${coins(summary.pocket)}` : `当前活期 ${coins(summary.demand)}` }}</p><button class="primary-button" type="button" :disabled="pending || canRetryConfirmation" @click="previewTransfer">预览{{ transferAction === 'deposit' ? '存入' : '取出' }}</button></div><div class="shortcuts"><h3>存单概况</h3><p>{{ openDeposits.length ? `还有 ${openDeposits.length} 张未结定存。到期后在「存单」查看兑付。` : '目前没有未结定存，可在「定存产品」开立。' }}</p><button type="button" @click="switchTab(openDeposits.length ? 'deposits' : 'products')">{{ openDeposits.length ? '查看存单' : '查看产品' }}</button></div></template>
        <template v-else-if="tab === 'deposits'"><p class="intro">存单到期时可兑付本金与实际预留利息；提前支取权限以存单详情为准。</p><div class="deposit-groups"><section><h3>未结存单</h3><div v-if="openDeposits.length" class="deposit-list"><button v-for="entry in openDeposits" :key="entry.id" type="button" :class="{ selected: selectedDeposit?.id === entry.id }" @click="selectDeposit(entry.id)"><span class="deposit-symbol"><AnimeIcon name="scroll" :size="38" /></span><span><strong>{{ entry.product }}</strong><small>#{{ entry.id }} · 本金 {{ coins(entry.principal) }} · 预留利息 {{ coins(entry.interest) }}</small><small>到期 {{ dateText(entry.due) }}</small></span><b aria-hidden="true"><AnimeIcon name="arrow" :size="19" /></b></button></div><p v-else class="quiet game-ui-empty-message"><GameUiFeedbackArt name="empty" :size="36" /><span>目前没有未结存单。</span></p></section><section v-if="recentDeposits.length"><h3>最近已结</h3><div class="deposit-list"><button v-for="entry in recentDeposits" :key="entry.id" type="button" @click="selectDeposit(entry.id)"><span class="deposit-symbol settled"><AnimeIcon name="check" :size="36" /></span><span><strong>{{ entry.product }}</strong><small>#{{ entry.id }} · {{ statusText(entry.status) }} · 本金 {{ coins(entry.principal) }}</small></span><b aria-hidden="true"><AnimeIcon name="arrow" :size="19" /></b></button></div></section></div><article v-if="depositLoading || depositError || selectedDeposit" class="deposit-detail"><button type="button" class="detail-close" :disabled="pending" @click="closeDeposit">收起详情 <AnimeIcon name="close" :size="16" /></button><p v-if="depositLoading" class="state game-ui-empty-message"><GameUiFeedbackArt name="loading" :size="36" /><span>正在读取存单…</span></p><p v-if="depositError" class="error">{{ depositError }}</p><template v-if="selectedDeposit"><h3>{{ selectedDeposit.productName }} · #{{ selectedDeposit.id }}</h3><div class="facts"><span>状态 <strong>{{ statusText(selectedDeposit.status) }}</strong></span><span>本金 <strong>{{ coins(selectedDeposit.principalCopper) }}</strong></span><span>预留利息 <strong>{{ coins(selectedDeposit.reservedInterestCopper) }}</strong></span><span>到期 <strong>{{ dateText(selectedDeposit.maturesMs) }}</strong></span></div><div v-if="selectedDeposit.availableActions.length" class="detail-actions"><button v-for="action in selectedDeposit.availableActions" :key="action" class="primary-button" type="button" :disabled="pending || canRetryConfirmation" @click="previewSettlement(action)">预览{{ action === 'settle' ? '到期兑付' : '提前支取' }}</button></div><p v-else class="quiet">{{ selectedDeposit.status !== 'open' ? '此存单已经结算。' : selectedDeposit.productCode === 'hundred' ? '百日定存未到期，不可提前支取。' : '当前没有可办理的存单动作，请刷新状态。' }}</p></template></article></template>
        <template v-else><p class="intro">产品基点仅作理论上限说明。实际预留利息受利息池限制，以服务端报价为准；本金从活期扣除。</p><div class="product-list"><button v-for="product in overview?.products ?? []" :key="product.code" type="button" :class="{ selected: productCode === product.code }" :disabled="pending" @click="productCode = product.code"><span class="product-icon"><AnimeIcon name="coin" :size="55" /></span><span><strong>{{ product.name }}</strong><small>{{ product.days }} 日 · {{ product.basisPoints }} 基点（理论 {{ (product.basisPoints / 100).toFixed(2) }}%）</small><small>最低本金 {{ coins(product.minCopper) }}</small></span><b aria-hidden="true"><AnimeIcon :name="productCode === product.code ? 'check' : 'arrow'" :size="20" /></b></button></div><div v-if="chosenProduct" class="transfer-card"><h3>开立 {{ chosenProduct.name }}</h3><label>本金（铜币）<input v-model.number="termAmount" type="number" :min="chosenProduct.minCopper" max="99999999" step="1" inputmode="numeric" :placeholder="`至少 ${chosenProduct.minCopper} 铜币`" /></label><p class="quiet">当前活期 {{ coins(summary.demand) }} · 最多同时 3 张未结定存</p><button class="primary-button" type="button" :disabled="pending || canRetryConfirmation || summary.openCount >= 3" @click="previewTerm">预览开立</button><p v-if="summary.openCount >= 3" class="limit-text">已有 3 张未结定存，先结算一张后再开立。</p></div></template>
        <section v-if="preview && previewInput" ref="quoteCard" class="quote-card" aria-label="钱庄报价确认"><h3>{{ actionLabel(previewInput, preview.quote) }} · 服务端报价</h3><p v-for="line in quoteLines(preview.quote)" :key="line">{{ line }}</p><small>有效至 {{ dateText(preview.expiresAt) }}。确认时钱庄会重新核对位置、余额和存单状态。</small><div class="confirm-actions"><button type="button" :disabled="pending || canRetryConfirmation" @click="preview = null; previewInput = null">修改或返回</button><button class="primary-button" type="button" :disabled="pending || (quoteExpired && !canRetryConfirmation)" @click="confirm">{{ canRetryConfirmation ? '用原凭据核对结果' : `确认${actionLabel(previewInput, preview.quote)}` }}</button></div><p v-if="quoteExpired" class="error">{{ canRetryConfirmation ? '报价已过期；原确认凭据仅能回读已完成结果。' : '报价已过期，请重新预览。' }}</p></section>
      </template>
      <section v-if="!gateOpen && canRetryConfirmation && preview && previewInput" class="quote-card" aria-label="钱庄原确认结果核对">
        <h3>{{ actionLabel(previewInput, preview.quote) }} · 结果待核对</h3>
        <p>原确认请求已发出。可用同一凭据核对结果；未完成的过期请求不会执行。</p>
        <button class="primary-button" type="button" :disabled="pending" @click="confirm">用原凭据核对结果</button>
      </section>
    </div></section></div></Teleport>
</template>

<style scoped>
.bank-backdrop { position: fixed; z-index: 96; inset: 0; display: grid; place-items: center; padding: max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left)); background: #393746a6; backdrop-filter: blur(4px); }.bank-dialog { display: flex; flex-direction: column; width: min(760px, 100%); max-height: min(85dvh, 780px); min-height: 0; overflow: hidden; color: #554f60; background: #fffaf6; border: 1px solid #fff; border-radius: 19px; box-shadow: 0 24px 68px #302d3b4d; }.bank-header { display: flex; align-items: center; gap: 11px; flex: 0 0 auto; padding: 13px 17px; background: linear-gradient(110deg, #f7eff9, #fff5e9); border-bottom: 1px solid #ede0e6; }.bank-mark { display: grid; place-items: center; flex: 0 0 40px; width: 40px; height: 40px; color: white; background: linear-gradient(140deg, #aa91bc, #d5ad82); border-radius: 12px; font-size: 23px; }.bank-header > div { min-width: 0; flex: 1; }.bank-header small { color: #ad96ae; font-size: 9px; letter-spacing: .12em; }.bank-header h2 { margin: 2px 0 0; font-size: 18px; }.location-tag { padding: 6px 8px; color: #997e6a; background: #fff5df; border-radius: 7px; font-size: 10px; white-space: nowrap; }.bank-header button { width: 33px; height: 33px; color: #a37a94; background: #fff; border-radius: 8px; font-size: 22px; line-height: 1; }.bank-tabs { display: grid; grid-template-columns: repeat(3, 1fr); flex: 0 0 auto; padding: 0 13px; background: white; border-bottom: 1px solid #eae0e4; }.bank-tabs button { min-height: 43px; color: #978899; background: none; border-bottom: 3px solid transparent; font-size: 12px; }.bank-tabs button.active { color: #855e99; border-bottom-color: #b693c4; font-weight: 700; }.bank-body { min-height: 0; overflow-y: auto; padding: 15px 17px max(20px, env(safe-area-inset-bottom)); overscroll-behavior: contain; }.balances { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 15px; }.balances > div { display: grid; gap: 4px; min-width: 0; padding: 11px; background: #fff; border: 1px solid #efe2e6; border-radius: 11px; }.balances small { color: #a290a4; font-size: 10px; }.balances strong { color: #6b5877; font-size: 13px; overflow-wrap: anywhere; }.intro { margin: 0 0 13px; color: #8d8190; font-size: 11px; line-height: 1.6; }.notice, .error { margin: 8px 0; padding: 9px 11px; border-radius: 8px; font-size: 11px; line-height: 1.5; }.notice { color: #537d68; background: #ecf8f0; }.error { color: #aa5b69; background: #fff0ee; }.state { padding: 24px 8px; color: #a69aaa; font-size: 12px; text-align: center; }.gate-state { padding: 20px 12px 30px; text-align: center; }.gate-state span { color: #c4a4b5; font-size: 27px; }.gate-state h3 { margin: 5px 0; font-size: 15px; }.gate-state p { color: #8e8092; font-size: 12px; line-height: 1.6; }.gate-state button { min-height: 37px; padding: 7px 12px; color: #79588e; background: #f0e8f6; border-radius: 8px; font-size: 12px; }
.transfer-card, .shortcuts, .deposit-detail { padding: 13px; background: #fff; border: 1px solid #eddee5; border-radius: 12px; box-shadow: 0 3px 12px #6a526910; }.transfer-card { display: grid; gap: 9px; max-width: 510px; }.transfer-card h3, .shortcuts h3 { margin: 0; color: #705d7c; font-size: 13px; }.segment { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }.segment button { min-height: 39px; color: #8f7995; background: #f6f1f5; border-radius: 8px; font-size: 12px; }.segment button.active { color: #744c8e; background: #efe5f6; font-weight: 700; }.transfer-card label { display: grid; gap: 5px; color: #74677e; font-size: 11px; }.transfer-card input { width: 100%; min-height: 41px; padding: 8px 10px; color: #52495a; background: #fff; border: 1px solid #dfd1df; border-radius: 8px; font: inherit; font-size: 13px; }.quiet { margin: 0; color: #9e91a0; font-size: 11px; line-height: 1.55; }.primary-button { min-height: 42px; padding: 9px 13px; color: #fff; background: #9978ae; border-radius: 8px; font-size: 12px; font-weight: 700; }.transfer-card .primary-button { justify-self: start; }.shortcuts { margin-top: 13px; max-width: 510px; }.shortcuts p { color: #897d8f; font-size: 11px; line-height: 1.6; }.shortcuts button { min-height: 36px; padding: 7px 10px; color: #826596; background: #f1eafa; border-radius: 7px; font-size: 11px; }
.deposit-groups { display: grid; gap: 15px; }.deposit-groups h3 { margin: 0 0 8px; color: #765d80; font-size: 12px; }.deposit-list { display: grid; gap: 7px; }.deposit-list button { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 62px; padding: 9px 10px; color: inherit; text-align: left; background: #fff; border: 1px solid #ebdfe6; border-radius: 10px; }.deposit-list button.selected { background: #fdf8ff; border-color: #d1b6dc; }.deposit-symbol { display: grid; place-items: center; flex: 0 0 33px; width: 33px; height: 33px; color: #9d77ae; background: #f2eafa; border-radius: 9px; font-size: 19px; }.deposit-symbol.settled { color: #73a182; background: #ebf6ee; }.deposit-list button > span:nth-child(2) { display: grid; gap: 3px; flex: 1; min-width: 0; overflow-wrap: anywhere; }.deposit-list strong { font-size: 12px; }.deposit-list small { color: #96899b; font-size: 10px; }.deposit-list b { color: #b49bb8; font-size: 20px; }.deposit-detail { margin-top: 13px; }.detail-close { float: right; padding: 3px 5px; color: #997ba3; background: none; font-size: 10px; }.deposit-detail h3 { margin: 3px 0 11px; font-size: 14px; }.facts { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; }.facts span { display: grid; gap: 3px; padding: 8px; color: #9c8c9d; background: #faf4fa; border-radius: 7px; font-size: 10px; }.facts strong { color: #65556b; font-size: 11px; }.detail-actions { display: flex; gap: 7px; margin-top: 11px; }.product-list { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 13px; }.product-list button { display: flex; align-items: center; gap: 7px; min-width: 0; padding: 9px; color: inherit; text-align: left; background: white; border: 1px solid #ebdfe6; border-radius: 10px; }.product-list button.selected { background: #fcf6fe; border-color: #b696c9; }.product-icon { display: grid; place-items: center; flex: 0 0 31px; width: 31px; height: 31px; color: #a685b5; background: #f2eafa; border-radius: 8px; font-size: 18px; }.product-list button > span:nth-child(2) { display: grid; gap: 3px; flex: 1; min-width: 0; }.product-list strong { font-size: 11px; }.product-list small { color: #988c9a; font-size: 9px; }.product-list b { color: #ac8fb7; }.limit-text { margin: 0; color: #ae7375; font-size: 11px; }
.quote-card { margin-top: 14px; padding: 14px; background: #f5ecfa; border: 1px solid #dbc7e8; border-radius: 11px; }.quote-card h3 { margin: 0 0 9px; color: #715185; font-size: 13px; }.quote-card p { margin: 5px 0; color: #63566e; font-size: 11px; line-height: 1.55; }.quote-card small { color: #92839c; font-size: 10px; }.confirm-actions { display: flex; justify-content: end; gap: 7px; margin-top: 12px; }.confirm-actions button:not(.primary-button) { min-height: 39px; padding: 8px 11px; color: #795e8b; background: #fff; border-radius: 8px; font-size: 11px; }
button { border: 0; cursor: pointer; font: inherit; }button:disabled { opacity: .48; cursor: not-allowed; }button:focus-visible, input:focus-visible { outline: 3px solid #9b75b7; outline-offset: 2px; }
@media (max-width: 600px) { .bank-dialog { width: 100%; max-height: 85dvh; }.bank-header { gap: 8px; padding: 11px 12px; }.bank-header h2 { font-size: 15px; }.bank-mark { flex-basis: 34px; width: 34px; height: 34px; }.bank-body { padding: 12px; }.balances { gap: 5px; }.balances > div { padding: 8px; }.balances strong { font-size: 10px; }.product-list { grid-template-columns: 1fr; }.product-list button { min-height: 53px; }.facts { grid-template-columns: 1fr 1fr; } }
@media (max-width: 350px) { .location-tag { display: none; }.balances { grid-template-columns: 1fr 1fr; }.balances > div:last-child { grid-column: 1 / -1; }.facts { grid-template-columns: 1fr; } }
</style>
