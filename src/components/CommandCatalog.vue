<script setup lang="ts">
import '../anime-growth-commerce.css';
import '../game-ui-catalog.css';
import AnimeIcon from './AnimeIcon.vue';
import ViewportPagination from './ViewportPagination.vue';
import { useViewportPagination } from '../useViewportPagination';
import { computed, nextTick, ref, watch } from 'vue';
import { commandAction, userFacingErrorMessage } from '../api';
import type {
  CommandActionMode,
  CommandActionPayload,
  CommandActionResult,
  CommandCatalogItem,
  CommandFieldOption,
  CommandFieldSchema,
  GameActionButton,
  IssuedActionButton
} from '../api';

type FormValue = string | number;
type ExecuteCommand = (payload: CommandActionPayload) => Promise<CommandActionResult>;
type CatalogCommand = CommandCatalogItem & { command?: string; aliases?: string[] };
type MessageButton = GameActionButton;
type FormatNode = { type?: string; value?: unknown };
type CommandMessage = { text?: string; markdown?: string; format?: FormatNode[]; buttons?: MessageButton[] };
type RenderedMessage = { text: string; images: string[]; buttons: MessageButton[] };

const props = withDefaults(defineProps<{
  commands: CommandCatalogItem[];
  busy?: boolean;
  execute?: ExecuteCommand;
  initialCommandId?: string;
  compact?: boolean;
}>(), {
  busy: false,
  execute: undefined,
  initialCommandId: '',
  compact: false
});

const emit = defineEmits<{
  (event: 'executed', result: CommandActionResult, command: CommandCatalogItem): void;
  (event: 'refresh', regions: string[], result: CommandActionResult, command: CommandCatalogItem): void;
  (event: 'error', error: Error, command?: CommandCatalogItem): void;
  (event: 'interaction-action', payload: { actionId: string; revision: string }): void;
}>();

const query = ref('');
const workbenchOpen = ref(false);
const commandViewport = ref<HTMLElement | null>(null);
const category = ref('全部');
const selectedId = ref('');
const args = ref<Record<string, FormValue>>({});
const hiddenRevision = ref<string | number | undefined>();
const hiddenToken = ref<string | undefined>();
const lastResult = ref<CommandActionResult | null>(null);
const previewResult = ref<CommandActionResult | null>(null);
const notice = ref('');
const localBusy = ref(false);
const renderedMessages = ref<RenderedMessage[]>([]);
const resultFromInteraction = ref(false);

const categoryNames: Record<string, string> = {
  system: '系统', story: '剧情', explore: '探索', battle: '战斗', character: '角色',
  inventory: '背包', social: '社交', quest: '任务', shop: '商店', home: '家园', other: '其他'
};
const categoryLabel = (value?: string) => categoryNames[value ?? ''] ?? value ?? '其他';

const categories = computed(() => ['全部', ...new Set(props.commands.map(item => item.category).filter((item): item is string => Boolean(item)))].sort((a, b) => a === '全部' ? -1 : b === '全部' ? 1 : a.localeCompare(b, 'zh-CN')));
const filteredCommands = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase();
  return props.commands.filter(item => {
    if (category.value !== '全部' && item.category !== category.value) return false;
    if (!needle) return true;
    return [item.id, item.title, item.description, item.usage].filter(Boolean).join(' ').toLocaleLowerCase().includes(needle);
  });
});
const selected = computed(() => props.commands.find(item => item.id === selectedId.value) ?? filteredCommands.value[0] ?? null);
const commandPaging = useViewportPagination(() => filteredCommands.value, {container:commandViewport,rowHeight:64,gap:6});
watch([query,category], commandPaging.reset);
const selectedFields = computed<CommandFieldSchema[]>(() => {
  const schema = selected.value?.schema;
  if (Array.isArray(schema)) return schema;
  if (schema?.fields) return schema.fields;
  return selected.value?.fields ?? selected.value?.args ?? [];
});
const visibleFields = computed(() => selectedFields.value.filter(field => field.type !== 'revision' && field.type !== 'token'));
const needsPreview = computed(() => Boolean(selected.value && !selected.value.readOnly && selected.value.risk !== 'read'));
const isBusy = computed(() => props.busy || localBusy.value);
const canConfirm = computed(() => Boolean(previewResult.value && !isBusy.value));
const validationError = computed(() => {
  for (const field of visibleFields.value) {
    const value = args.value[field.key];
    if (field.required && (value === undefined || value === null || String(value).trim() === '')) return `请填写${field.label ?? field.key}`;
    if (value === undefined || value === null || String(value) === '') continue;
    if (field.type === 'number') {
      const numberValue = Number(value);
      if (!Number.isFinite(numberValue)) return `${field.label ?? field.key}必须是数字`;
      if (field.min !== undefined && numberValue < field.min) return `${field.label ?? field.key}不能小于 ${field.min}`;
      if (field.max !== undefined && numberValue > field.max) return `${field.label ?? field.key}不能大于 ${field.max}`;
    }
  }
  return '';
});
const previewText = computed(() => {
  const result = previewResult.value;
  if (!result) return '';
  if (typeof result.text === 'string' && result.text.trim()) return result.text;
  if (result.preview !== undefined) return typeof result.preview === 'string' ? result.preview : JSON.stringify(result.preview, null, 2);
  return '服务器已返回预览，请确认后继续。';
});
const refreshRegions = computed(() => {
  const result = lastResult.value;
  const value = result?.refresh;
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.regions)) return value.regions;
  return resultFromInteraction.value ? [] : selected.value?.refresh ?? [];
});

function normalizedOptions(field: CommandFieldSchema): CommandFieldOption[] {
  return (field.options ?? []).map(option => typeof option === 'object' ? option : { label: String(option), value: option });
}

function setSelection(id: string) {
  selectedId.value = id;
  workbenchOpen.value = true;
}

function initializeForm(command: CommandCatalogItem | null) {
  const next: Record<string, FormValue> = {};
  for (const field of command ? fieldsFor(command) : []) {
    if (field.type === 'revision' || field.type === 'token') continue;
    if (field.default !== undefined) next[field.key] = field.default;
    else if (field.type === 'enum') next[field.key] = normalizedOptions(field)[0]?.value ?? '';
    else next[field.key] = '';
  }
  args.value = next;
  hiddenRevision.value = undefined;
  hiddenToken.value = undefined;
  previewResult.value = null;
  lastResult.value = null;
  resultFromInteraction.value = false;
  notice.value = '';
}

function fieldsFor(command: CommandCatalogItem): CommandFieldSchema[] {
  if (Array.isArray(command.schema)) return command.schema;
  if (command.schema?.fields) return command.schema.fields;
  return command.fields ?? command.args ?? [];
}

function selectFirstAvailable() {
  if (!selectedId.value || !filteredCommands.value.some(item => item.id === selectedId.value)) selectedId.value = props.initialCommandId && filteredCommands.value.some(item => item.id === props.initialCommandId)
    ? props.initialCommandId
    : filteredCommands.value[0]?.id || props.commands[0]?.id || '';
}

function extractRefresh(result: CommandActionResult, command: CommandCatalogItem) {
  if (Array.isArray(result.refresh)) return result.refresh;
  if (result.refresh && Array.isArray(result.refresh.regions)) return result.refresh.regions;
  return command.refresh ?? [];
}

function safeImageUrl(value: unknown, objectUrls: string[]): string | null {
  if (typeof value === 'string') {
    const source = value.trim();
    if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(source) && source.length <= 12_000_000) return source;
    if (!source || /[\u0000-\u001f]/.test(source)) return null;
    try {
      const url = new URL(source, window.location.href);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
      return url.href;
    } catch { return null; }
  }
  if (!value || typeof value !== 'object') return null;
  const image = value as { type?: unknown; data?: unknown; url?: unknown };
  if (typeof image.url === 'string') return safeImageUrl(image.url, objectUrls);
  if (image.type !== 'Buffer' || !Array.isArray(image.data) || image.data.length < 8 || image.data.length > 8_000_000) return null;
  if (!image.data.every(byte => Number.isInteger(byte) && byte >= 0 && byte <= 255)) return null;
  const bytes = Uint8Array.from(image.data);
  const isPng = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isGif = bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38;
  const isWebp = String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  const mime = isPng ? 'image/png' : isJpeg ? 'image/jpeg' : isGif ? 'image/gif' : isWebp ? 'image/webp' : '';
  if (!mime) return null;
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  objectUrls.push(url);
  return url;
}

function imageValues(format: FormatNode[] | undefined): unknown[] {
  const images: unknown[] = [];
  const visit = (nodes: FormatNode[] | undefined) => {
    for (const node of nodes ?? []) {
      if (node.type === 'Image' || node.type === 'MD.image') images.push(node.value);
      if (Array.isArray(node.value)) visit(node.value as FormatNode[]);
    }
  };
  visit(format);
  return images;
}

function resultMessages(result: CommandActionResult): CommandMessage[] {
  const messages = result.messages;
  if (Array.isArray(messages) && messages.length) {
    return messages.flatMap(message => {
      if (typeof message === 'string') return [{ text: message }];
      return message && typeof message === 'object' ? [message as CommandMessage] : [];
    });
  }
  return [result as CommandMessage];
}

function isUsableButton(button: MessageButton): boolean {
  if (!button || typeof button.label !== 'string') return false;
  if ('actionId' in button) return typeof button.actionId === 'string' && Boolean(button.actionId.trim())
    && typeof button.revision === 'string' && Boolean(button.revision.trim());
  return typeof button.command === 'string' && Boolean(button.command.trim());
}

function isIssuedButton(button: MessageButton): button is IssuedActionButton {
  return 'actionId' in button;
}

watch(lastResult, (result, _old, onCleanup) => {
  const objectUrls: string[] = [];
  renderedMessages.value = result ? resultMessages(result).map(message => {
    const images = imageValues(message.format).map(value => safeImageUrl(value, objectUrls)).filter((url): url is string => Boolean(url));
    const text = String(message.text || message.markdown || '').trim();
    return {
      text: images.length ? text.replace(/\[图片\]/g, '').trim() : text,
      images,
      buttons: Array.isArray(message.buttons) ? message.buttons.filter(isUsableButton) : []
    };
  }) : [];
  onCleanup(() => objectUrls.forEach(url => URL.revokeObjectURL(url)));
});

function followUpCommand(raw: string): { command: CatalogCommand; rest: string } | null {
  const value = raw.trim().replace(/^\/+/, '');
  const matches = props.commands.flatMap(item => {
    const command = item as CatalogCommand;
    return [command.command, ...(command.aliases ?? [])]
      .filter((head): head is string => typeof head === 'string' && Boolean(head.trim()))
      .map(head => ({ command, head: head.trim() }));
  }).filter(item => value === item.head || value.startsWith(`${item.head} `));
  matches.sort((a, b) => b.head.length - a.head.length);
  const match = matches[0];
  return match ? { command: match.command, rest: value.slice(match.head.length).trim() } : null;
}

async function openFollowUp(command: string) {
  workbenchOpen.value = true;
  const target = followUpCommand(command);
  if (!target) {
    notice.value = '此操作尚未接入网页命令目录。';
    return;
  }
  if (target.command.enabled === false) {
    notice.value = target.command.reason || '当前还不能使用这项操作。';
    return;
  }
  query.value = '';
  category.value = '全部';
  selectedId.value = target.command.id;
  await nextTick();
  initializeForm(target.command);
  const parts = target.rest.match(/\S+/g) ?? [];
  const fields = fieldsFor(target.command).filter(field => field.type !== 'revision' && field.type !== 'token');
  let offset = 0;
  for (const field of fields) {
    const value = field.type === 'rest' ? parts.slice(offset).join(' ') : parts[offset] ?? '';
    if (value) args.value[field.key] = field.type === 'number' ? Number(value) : value;
    offset += field.type === 'rest' ? parts.length : 1;
  }
  if (validationError.value) {
    notice.value = '请补全操作参数后继续。';
    return;
  }
  await submit(target.command.readOnly ? 'execute' : 'preview');
}

function activateMessageButton(button: MessageButton) {
  if (isBusy.value || !isUsableButton(button)) return;
  if (isIssuedButton(button)) {
    emit('interaction-action', { actionId: button.actionId, revision: button.revision });
    return;
  }
  void openFollowUp(button.command);
}

// The parent calls these after handling an issued action so its full response uses the same renderer.
function showInteractionResult(result: CommandActionResult) {
  workbenchOpen.value = true;
  resultFromInteraction.value = true;
  previewResult.value = null;
  lastResult.value = result;
  notice.value = '';
}

function showInteractionError(error: unknown) {
  notice.value = userFacingErrorMessage(error);
}

defineExpose({ showInteractionResult, showInteractionError });

async function submit(mode: CommandActionMode) {
  const command = selected.value;
  if (!command || isBusy.value) return;
  if (command.enabled === false) {
    notice.value = command.reason || '当前还不能使用这项操作。';
    return;
  }
  if (mode !== 'confirm' && validationError.value) {
    notice.value = validationError.value;
    return;
  }
  if (mode === 'confirm' && !previewResult.value) {
    notice.value = '请先获取预览。';
    return;
  }
  const payload: CommandActionPayload = {
    commandId: command.id,
    args: { ...args.value },
    mode,
    revision: hiddenRevision.value,
    token: hiddenToken.value
  };
  localBusy.value = true;
  notice.value = '';
  try {
    const result = await (props.execute ?? commandAction)(payload);
    resultFromInteraction.value = false;
    lastResult.value = result;
    if (mode === 'preview') {
      previewResult.value = result;
      if (result.revision !== undefined) hiddenRevision.value = result.revision;
      if (result.confirmToken) hiddenToken.value = result.confirmToken;
      notice.value = '预览已生成，请检查结果后确认执行。';
      return;
    }
    previewResult.value = null;
    hiddenRevision.value = result.revision;
    hiddenToken.value = result.confirmToken;
    const regions = extractRefresh(result, command);
    if (regions.length) emit('refresh', regions, result, command);
    emit('executed', result, command);
  } catch (error) {
    const normalized = new Error(userFacingErrorMessage(error));
    notice.value = normalized.message;
    emit('error', normalized, command);
  } finally {
    localBusy.value = false;
  }
}

watch(() => props.commands, selectFirstAvailable, { immediate: true });
watch([selectedId, () => props.initialCommandId], () => {
  if (!selectedId.value && props.initialCommandId) selectedId.value = props.initialCommandId;
  initializeForm(selected.value);
}, { immediate: true });
watch([query, category], selectFirstAvailable);
</script>

<template>
  <section class="command-catalog anime-growth-commerce catalog-painted" :class="{ compact }">
    <aside class="command-catalog-list card-surface">
      <div class="command-catalog-heading">
        <div><h3><AnimeIcon name="book" :size="26" />冒险操作</h3></div>
        <span class="muted">{{ filteredCommands.length }} 项</span>
      </div>
      <div class="catalog-search-wrap"><AnimeIcon name="search" :size="20" class="catalog-search-art" /><input v-model="query" class="command-search" type="search" aria-label="搜索命令" placeholder="搜索操作或指令" /></div>
      <label class="command-category-select">分类 <select v-model="category" aria-label="命令分类"><option v-for="item in categories" :key="item" :value="item">{{ categoryLabel(item) }}</option></select></label>
      <div ref="commandViewport" class="command-viewport">
      <div class="command-items">
        <button v-for="item in commandPaging.visibleItems.value" :key="item.id" :data-command-id="item.id" type="button" class="command-item" :class="{ active: selected?.id === item.id, disabled: item.enabled === false }" @click="setSelection(item.id)">
          <AnimeIcon :name="item.category === 'battle' ? 'sword' : item.category === 'social' ? 'party' : item.category === 'home' ? 'home' : item.category === 'shop' ? 'coin' : 'scroll'" :size="32" /><span><strong :title="item.title">{{ item.title }}</strong><small>{{ categoryLabel(item.category) }}<template v-if="item.readOnly"> · 查看</template></small></span>
          <span v-if="item.enabled === false" class="command-readonly locked">未解锁</span><span v-else-if="item.readOnly" class="command-readonly">只读</span>
        </button>
        <p v-if="!filteredCommands.length" class="empty-state">没有找到匹配的操作。</p>
      </div>
      </div>
      <ViewportPagination :page="commandPaging.page.value" :total-pages="commandPaging.totalPages.value" :total="filteredCommands.length" label="操作目录翻页" :disabled="isBusy" @update:page="commandPaging.setPage" />
    </aside>

    <div v-if="selected && (compact || workbenchOpen)" class="command-workbench-backdrop" @click.self="!isBusy && (workbenchOpen = false)">
    <section class="command-workbench card-surface" role="dialog" aria-modal="true" :aria-label="selected.title">
      <button v-if="!compact" type="button" class="dialog-close command-workbench-close" aria-label="关闭操作详情" :disabled="isBusy" @click="workbenchOpen = false"><AnimeIcon name="close" :size="22" /></button>
      <div class="command-workbench-heading">
        <div><p class="eyebrow">{{ categoryLabel(selected.category) }}</p><h2>{{ selected.title }}</h2></div>
        <span class="command-risk" :class="selected.readOnly ? 'safe' : selected.risk === 'danger' ? 'danger' : 'write'">{{ selected.readOnly ? '只读' : selected.risk === 'danger' ? '确认操作' : '可操作' }}</span>
      </div>
      <p v-if="selected.description" class="command-description">{{ selected.description }}</p>
      <div v-if="selected.enabled === false" class="command-notice">{{ selected.reason || '请先完成角色注册。' }}</div>
      <code v-if="selected.usage" class="command-usage">{{ selected.usage }}</code>

      <form class="command-form" @submit.prevent="submit(needsPreview ? 'preview' : 'execute')">
        <label v-for="field in visibleFields" :key="field.key" class="command-field">
          <span>{{ field.label || field.key }}<em v-if="field.required">必填</em></span>
          <select v-if="field.type === 'enum'" v-model="args[field.key]">
            <option v-for="option in normalizedOptions(field)" :key="String(option.value)" :value="option.value">{{ option.label }}</option>
          </select>
          <input v-else-if="field.type === 'number'" v-model.number="args[field.key]" type="number" :min="field.min" :max="field.max" :step="field.step || 1" :placeholder="field.placeholder" />
          <textarea v-else-if="field.type === 'rest'" v-model="args[field.key]" rows="3" :placeholder="field.placeholder" />
          <input v-else v-model="args[field.key]" type="text" :placeholder="field.placeholder" />
          <small v-if="field.description">{{ field.description }}</small>
        </label>
        <p v-if="validationError" class="command-validation">{{ validationError }}</p>
        <div class="command-actions">
          <button v-if="needsPreview" type="submit" class="primary-button" :disabled="isBusy || selected.enabled === false">{{ isBusy ? '处理中…' : '获取预览' }}</button>
          <button v-else type="submit" class="primary-button" :disabled="isBusy || selected.enabled === false">{{ isBusy ? '读取中…' : '立即查看' }}</button>
          <button v-if="needsPreview && previewResult" type="button" class="soft-button" :disabled="!canConfirm" @click="submit('confirm')">{{ isBusy ? '确认中…' : '确认执行' }}</button>
        </div>
      </form>

      <div v-if="notice" class="command-notice" role="status">{{ notice }}</div>
      <div v-if="previewResult" class="command-preview">
        <div class="section-heading"><h3><AnimeIcon name="scroll" :size="24" />操作预览</h3><span class="muted">确认后才会产生变更</span></div>
        <pre>{{ previewText }}</pre>
      </div>
      <div v-else-if="renderedMessages.some(message => message.text || message.images.length || message.buttons.length)" class="command-result">
        <div class="section-heading"><h3><AnimeIcon name="check" :size="24" />返回结果</h3><span v-if="refreshRegions.length" class="muted">将刷新：{{ refreshRegions.join('、') }}</span></div>
        <div v-for="(message, index) in renderedMessages" :key="index" class="command-result-message">
          <pre v-if="message.text">{{ message.text }}</pre>
          <img v-for="(src, imageIndex) in message.images" :key="imageIndex" class="command-result-image" :src="src" alt="命令返回的图片" loading="lazy" />
          <div v-if="message.buttons.length" class="command-result-buttons">
            <button v-for="(button, buttonIndex) in message.buttons" :key="buttonIndex" type="button" class="soft-button" :disabled="isBusy" @click="activateMessageButton(button)">{{ button.label }}</button>
          </div>
        </div>
      </div>
    </section>
    </div>
    <section v-else-if="!selected" class="command-workbench card-surface empty-state">暂无可用命令。</section>
  </section>
</template>

<style scoped>
.command-catalog { display: grid; grid-template-columns: minmax(235px, .72fr) minmax(0, 1.45fr); gap: 15px; align-items: start; }
.command-catalog-list, .command-workbench { padding: 22px; }
.command-catalog-heading, .command-workbench-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.command-catalog-heading { margin-bottom: 15px; }
.command-catalog-heading h3, .command-workbench-heading h2 { margin: 0; }
.command-search { margin: 0 0 11px; }
.command-categories { display: flex; gap: 6px; overflow-x: auto; margin-bottom: 13px; padding-bottom: 2px; }
.command-categories button { flex: 0 0 auto; padding: 7px 10px; color: var(--muted); background: #f6efeb; border-radius: 10px; font-size: 12px; }
.command-categories button.active { color: #665197; background: #eee9ff; }
.command-items { display: grid; gap: 7px; max-height: 590px; overflow-y: auto; padding-right: 2px; }
.command-item { display: flex; align-items: center; justify-content: space-between; gap: 8px; width: 100%; padding: 11px 12px; text-align: left; color: var(--ink); background: #faf3ee; border: 1px solid transparent; border-radius: 13px; }
.command-item.active { background: #f1ecff; border-color: rgba(143, 125, 215, .22); }
.command-item strong, .command-item small { display: block; }
.command-item strong { font-size: 13px; }
.command-item small { margin-top: 4px; color: var(--muted); font-size: 10px; }
.command-item.disabled { color: var(--muted); background: #f7f2ef; }
.command-item.disabled strong { color: #8f8592; }
.command-readonly { flex: 0 0 auto; color: #4d987a; font-size: 10px; }
.command-description { margin: 14px 0 10px; color: var(--muted); line-height: 1.6; }
.command-usage { display: block; overflow-x: auto; padding: 10px 12px; color: #665197; background: #f7f1ff; border-radius: 11px; white-space: pre-wrap; }
.command-risk { flex: 0 0 auto; padding: 5px 9px; border-radius: 9px; color: #786777; background: #f7f0ed; font-size: 11px; }
.command-risk.safe { color: #4d987a; background: #e8f5ef; }
.command-risk.write { color: #a26a4d; background: #fff0e7; }
.command-risk.danger { color: #b44e4e; background: #ffebeb; }
.command-form { display: grid; gap: 12px; margin-top: 18px; }
.command-field { display: grid; gap: 6px; margin: 0; color: var(--ink); }
.command-field > span { display: flex; align-items: center; gap: 7px; color: var(--ink); font-size: 13px; }
.command-field em { color: var(--coral); font-size: 10px; font-style: normal; }
.command-field input, .command-field select, .command-field textarea { margin: 0; }
.command-field select { width: 100%; padding: 13px 14px; color: var(--ink); background: rgba(255, 255, 255, .8); border: 1px solid var(--line); border-radius: 13px; outline: none; }
.command-field small { color: var(--muted); font-size: 11px; line-height: 1.5; }
.command-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 3px; }
.command-validation { margin: 0; color: #b44e4e; font-size: 12px; }
.command-notice { margin-top: 16px; padding: 10px 12px; color: #665197; background: #f3eeff; border-radius: 11px; font-size: 12px; line-height: 1.5; }
.command-preview, .command-result { margin-top: 17px; padding-top: 16px; border-top: 1px solid var(--line); }
.command-preview .section-heading, .command-result .section-heading { margin-bottom: 9px; }
.command-preview .section-heading h3, .command-result .section-heading h3 { margin: 0; font-size: 15px; }
.command-preview pre, .command-result pre { max-height: 300px; overflow: auto; margin: 0; padding: 13px; color: var(--ink); background: #faf5f0; border-radius: 12px; white-space: pre-wrap; font: inherit; line-height: 1.65; }
.command-result-message + .command-result-message { margin-top: 11px; }
.command-result-image { display: block; max-width: 100%; max-height: 480px; width: auto; height: auto; margin-top: 8px; border-radius: 12px; object-fit: contain; }
.command-result-buttons { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 8px; }
.compact .command-items { max-height: 350px; }
@media (max-width: 760px) { .command-catalog { grid-template-columns: 1fr; } .command-items { max-height: 270px; } }
</style>
