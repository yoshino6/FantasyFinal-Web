<script lang="ts">
export type NotificationInboxCategory = 'system' | 'command' | 'quest' | 'achievement' | 'battle' | 'party' | 'friend' | 'mail' | 'world';
export type NotificationInboxFormatNode = { type?: string; value?: unknown; options?: Record<string, unknown> };
export type NotificationInboxMessageButton = { label: string; command: string };
export type NotificationInboxMessage = { text?: string; markdown?: string; format?: NotificationInboxFormatNode[]; buttons?: NotificationInboxMessageButton[] };
export type NotificationInboxItem = {
  id: number;
  category: NotificationInboxCategory;
  title: string;
  messages: NotificationInboxMessage[];
  isRead: boolean;
  createdAt: string;
  readAt: string | null;
};
export type NotificationInboxMailFilter = 'all' | 'unread' | 'attachments';
export type NotificationInboxMailItem = {
  id: number;
  title: string;
  senderName: string;
  createdAt: string;
  isRead: boolean;
  hasAttachments: boolean;
  claimedAt: string | null;
  preview: string;
};
export type NotificationInboxMailAttachment = {
  itemId: number;
  code: string;
  name: string;
  quantity: number;
  rarity: string;
  itemType: string;
};
export type NotificationInboxMailDetail = NotificationInboxMailItem & {
  body: string;
  readAt: string | null;
  attachments: NotificationInboxMailAttachment[];
};
</script>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import InventoryItemIcon from './InventoryItemIcon.vue';

type NotificationCategory = NotificationInboxCategory;
type FormatNode = NotificationInboxFormatNode;
type MessageButton = NotificationInboxMessageButton;
type InboxItem = NotificationInboxItem;
type RenderedMessage = { text: string; images: string[]; buttons: MessageButton[] };
type InboxTab = 'notice' | 'mail';

const props = withDefaults(defineProps<{
  open: boolean;
  items: InboxItem[];
  unreadCount: number;
  loading?: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  error?: string;
  markingReadId?: number | null;
  mailItems?: NotificationInboxMailItem[];
  mailUnreadCount?: number;
  mailFilter?: NotificationInboxMailFilter;
  mailLoading?: boolean;
  mailLoadingMore?: boolean;
  mailHasMore?: boolean;
  mailError?: string;
  mailDetail?: NotificationInboxMailDetail | null;
  mailDetailLoading?: boolean;
  mailActionBusy?: boolean;
}>(), {
  loading: false,
  loadingMore: false,
  hasMore: false,
  error: '',
  markingReadId: null,
  mailItems: () => [],
  mailUnreadCount: 0,
  mailFilter: 'all',
  mailLoading: false,
  mailLoadingMore: false,
  mailHasMore: false,
  mailError: '',
  mailDetail: null,
  mailDetailLoading: false,
  mailActionBusy: false
});

const emit = defineEmits<{
  close: [];
  refresh: [];
  'load-more': [];
  'mark-read': [id: number];
  'open-command': [command: string];
  'mail-filter-change': [filter: NotificationInboxMailFilter];
  'mail-refresh': [];
  'mail-load-more': [];
  'open-mail': [id: number];
  'claim-mail': [id: number];
  'delete-mail': [id: number];
  'claim-all-mail': [];
}>();

const activeTab = ref<InboxTab>('notice');
const selectedId = ref<number | null>(null);
const selectedMailId = ref<number | null>(null);
const deleteConfirmMailId = ref<number | null>(null);
const claimAllConfirm = ref(false);
const closeButton = ref<HTMLButtonElement | null>(null);
const renderedMessages = ref<RenderedMessage[]>([]);
const selected = computed(() => props.items.find(item => item.id === selectedId.value) ?? null);
const selectedMail = computed(() => props.mailDetail?.id === selectedMailId.value ? props.mailDetail : null);
const visibleItems = computed(() => props.items);
const totalUnreadCount = computed(() => Math.max(0, props.unreadCount) + Math.max(0, props.mailUnreadCount));
const unreadLabel = computed(() => totalUnreadCount.value > 99 ? '99+' : String(totalUnreadCount.value));

const categoryNames: Record<NotificationCategory, string> = {
  system: '系统', command: '操作', quest: '任务', achievement: '足迹', battle: '战斗',
  party: '队伍', friend: '好友', mail: '邮件', world: '世界'
};
const mailFilters: { id: NotificationInboxMailFilter; label: string }[] = [
  { id: 'all', label: '全部' }, { id: 'unread', label: '未读' }, { id: 'attachments', label: '附件' }
];

function formatDate(value: string, full = false): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('zh-CN', full
    ? { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function plainFormatText(nodes: FormatNode[] | undefined): string {
  const pieces: string[] = [];
  const visit = (value: FormatNode[] | undefined) => {
    for (const node of value ?? []) {
      if (Array.isArray(node.value)) { visit(node.value as FormatNode[]); continue; }
      if (node.type === 'MD.newline') { pieces.push('\n'); continue; }
      if (node.type === 'MD.divider') { pieces.push('\n────────\n'); continue; }
      if (node.type === 'MD.link' && node.value && typeof node.value === 'object') {
        pieces.push(String((node.value as { text?: unknown }).text ?? '')); continue;
      }
      if (node.type === 'Text' || node.type === 'MarkdownOriginal' || node.type?.startsWith('MD.') && node.type !== 'MD.image') {
        pieces.push(String(node.value ?? ''));
      }
    }
  };
  visit(nodes);
  return pieces.join('').trim();
}

function imageValues(nodes: FormatNode[] | undefined): unknown[] {
  const values: unknown[] = [];
  const visit = (items: FormatNode[] | undefined) => {
    for (const node of items ?? []) {
      if (node.type === 'Image' || node.type === 'MD.image') values.push(node.value);
      if (Array.isArray(node.value)) visit(node.value as FormatNode[]);
    }
  };
  visit(nodes);
  return values;
}

function safeBitmapUrl(value: unknown, objectUrls: string[]): string | null {
  if (typeof value === 'string') {
    const source = value.trim();
    if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/i.test(source) && source.length <= 12_000_000) return source;
    if (!source || /[\u0000-\u001f]/.test(source)) return null;
    try {
      const url = new URL(source, window.location.href);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !/\.(?:png|jpe?g|gif|webp)$/i.test(url.pathname)) return null;
      return url.href;
    } catch { return null; }
  }
  if (!value || typeof value !== 'object') return null;
  const image = value as { type?: unknown; data?: unknown; url?: unknown };
  if (typeof image.url === 'string') return safeBitmapUrl(image.url, objectUrls);
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

function openItem(item: InboxItem) {
  selectedId.value = item.id;
  if (!item.isRead && props.markingReadId !== item.id) emit('mark-read', item.id);
}

function openMail(item: NotificationInboxMailItem) {
  selectedMailId.value = item.id;
  deleteConfirmMailId.value = null;
  emit('open-mail', item.id);
}

function closeDetail() {
  selectedId.value = null;
  selectedMailId.value = null;
  deleteConfirmMailId.value = null;
}

function requestDeleteMail(id: number) {
  if (deleteConfirmMailId.value !== id) { deleteConfirmMailId.value = id; return; }
  deleteConfirmMailId.value = null;
  emit('delete-mail', id);
}

function requestClaimAllMail() {
  if (!claimAllConfirm.value) { claimAllConfirm.value = true; return; }
  claimAllConfirm.value = false;
  emit('claim-all-mail');
}

function changeTab(tab: InboxTab) {
  activeTab.value = tab;
  claimAllConfirm.value = false;
  closeDetail();
}

function changeMailFilter(filter: NotificationInboxMailFilter) {
  if (filter === props.mailFilter) return;
  closeDetail();
  claimAllConfirm.value = false;
  emit('mail-filter-change', filter);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  if (selectedId.value !== null || selectedMailId.value !== null) closeDetail();
  else emit('close');
}

watch(() => props.open, async (open, _previous, onCleanup) => {
  if (!open) { closeDetail(); claimAllConfirm.value = false; return; }
  activeTab.value = 'notice';
  window.addEventListener('keydown', onKeydown);
  onCleanup(() => window.removeEventListener('keydown', onKeydown));
  await nextTick();
  closeButton.value?.focus();
}, { immediate: true });

watch(() => props.mailItems, items => {
  if (selectedMailId.value !== null && !items.some(item => item.id === selectedMailId.value) && !props.mailLoading) closeDetail();
});

watch(selected, (item, _previous, onCleanup) => {
  const objectUrls: string[] = [];
  renderedMessages.value = (item?.messages ?? []).map(message => {
    const images = imageValues(message.format).map(value => safeBitmapUrl(value, objectUrls)).filter((url): url is string => Boolean(url));
    const rawText = String(message.text || message.markdown || plainFormatText(message.format)).trim();
    return {
      text: images.length ? rawText.replace(/\[图片\]/g, '').trim() : rawText,
      images,
      buttons: Array.isArray(message.buttons)
        ? message.buttons.filter(button => typeof button?.label === 'string' && typeof button?.command === 'string')
        : []
    };
  });
  onCleanup(() => objectUrls.forEach(url => URL.revokeObjectURL(url)));
});
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="inbox-backdrop" role="presentation" @click.self="emit('close')">
      <section class="inbox-dialog" role="dialog" aria-modal="true" aria-labelledby="inbox-heading">
        <header class="inbox-header">
          <div class="inbox-heading-group">
            <span class="inbox-envelope" aria-hidden="true">✉</span>
            <h2 id="inbox-heading">消息信箱</h2>
            <span v-if="totalUnreadCount > 0" class="inbox-unread" :aria-label="`${totalUnreadCount} 条未读`">{{ unreadLabel }}</span>
          </div>
          <button ref="closeButton" type="button" class="inbox-close" aria-label="关闭消息信箱" @click="emit('close')">×</button>
        </header>

        <div class="inbox-tabs" role="tablist" aria-label="消息类别">
          <button type="button" role="tab" :aria-selected="activeTab === 'notice'" :class="{ active: activeTab === 'notice' }" @click="changeTab('notice')">通知<span v-if="unreadCount > 0" class="inbox-tab-count">{{ unreadCount > 99 ? '99+' : unreadCount }}</span></button>
          <button type="button" role="tab" :aria-selected="activeTab === 'mail'" :class="{ active: activeTab === 'mail' }" @click="changeTab('mail')">邮件<span v-if="mailUnreadCount > 0" class="inbox-tab-count">{{ mailUnreadCount > 99 ? '99+' : mailUnreadCount }}</span></button>
          <button type="button" class="inbox-refresh" aria-label="刷新消息" :disabled="activeTab === 'mail' ? mailLoading : loading" @click="activeTab === 'mail' ? emit('mail-refresh') : emit('refresh')">刷新</button>
        </div>

        <div v-if="activeTab === 'notice'" class="inbox-body">
          <div class="inbox-list" role="tabpanel" aria-label="通知列表">
            <p v-if="error" class="inbox-error" role="alert">{{ error }} <button type="button" @click="emit('refresh')">重试</button></p>
            <p v-if="loading && !items.length" class="inbox-state" role="status">正在读取消息…</p>
            <template v-else>
              <button v-for="item in visibleItems" :key="item.id" type="button" class="inbox-row" :class="{ unread: !item.isRead, selected: selectedId === item.id }" @click="openItem(item)">
                <span class="inbox-row-icon" :class="`category-${item.category}`" aria-hidden="true">{{ item.category === 'mail' ? '✉' : item.category === 'battle' ? '⚔' : item.category === 'quest' ? '✦' : '•' }}</span>
                <span class="inbox-row-main"><span class="inbox-row-title">{{ item.title || categoryNames[item.category] }}</span><span class="inbox-row-preview">{{ item.messages?.[0]?.text || item.messages?.[0]?.markdown || '点击查看详情' }}</span></span>
                <span class="inbox-row-meta"><time :datetime="item.createdAt">{{ formatDate(item.createdAt) }}</time><i v-if="!item.isRead" class="inbox-unread-dot" aria-label="未读" /></span>
              </button>
              <p v-if="!visibleItems.length && !loading && !error" class="inbox-state">还没有通知</p>
              <button v-if="hasMore" type="button" class="inbox-load-more" :disabled="loadingMore || loading" @click="emit('load-more')">{{ loadingMore ? '正在加载…' : '查看更早的消息' }}</button>
            </template>
          </div>

          <article v-if="selected" class="inbox-detail" :aria-label="selected.title || '消息详情'">
            <div class="inbox-detail-top"><button type="button" class="inbox-back" @click="closeDetail">‹ 返回</button><span>{{ categoryNames[selected.category] }}</span></div>
            <h3>{{ selected.title || categoryNames[selected.category] }}</h3>
            <time :datetime="selected.createdAt">{{ formatDate(selected.createdAt, true) }}</time>
            <div class="inbox-detail-messages">
              <div v-for="(message, index) in renderedMessages" :key="index" class="inbox-message">
                <p v-if="message.text" class="inbox-message-text">{{ message.text }}</p>
                <img v-for="(src, imageIndex) in message.images" :key="imageIndex" class="inbox-message-image" :src="src" alt="消息图片" loading="lazy" />
                <div v-if="message.buttons.length" class="inbox-message-actions"><button v-for="button in message.buttons" :key="`${button.command}:${button.label}`" type="button" @click="emit('open-command', button.command)">{{ button.label }}</button></div>
              </div>
              <p v-if="!renderedMessages.length" class="inbox-state">这条消息没有正文。</p>
            </div>
            <button v-if="!selected.isRead" type="button" class="inbox-mark-read" :disabled="markingReadId === selected.id" @click="emit('mark-read', selected.id)">{{ markingReadId === selected.id ? '标记中…' : '标为已读' }}</button>
          </article>
          <div v-else class="inbox-detail-placeholder" aria-hidden="true"><span>✉</span><p>选择一条消息查看完整内容</p></div>
        </div>

        <div v-else class="inbox-body" role="tabpanel" aria-label="游戏邮件">
          <div class="inbox-list inbox-mail-list">
            <div class="inbox-mail-filters" role="group" aria-label="邮件筛选">
              <button v-for="filter in mailFilters" :key="filter.id" type="button" :class="{ active: mailFilter === filter.id }" :aria-pressed="mailFilter === filter.id" @click="changeMailFilter(filter.id)">{{ filter.label }}</button>
            </div>
            <div class="inbox-mail-scroll">
              <p v-if="mailError" class="inbox-error" role="alert">{{ mailError }} <button type="button" @click="emit('mail-refresh')">重试</button></p>
              <p v-if="mailLoading && !mailItems.length" class="inbox-state" role="status">正在读取邮件…</p>
              <template v-else>
                <button v-for="mail in mailItems" :key="mail.id" type="button" class="inbox-row" :class="{ unread: !mail.isRead, selected: selectedMailId === mail.id }" @click="openMail(mail)">
                  <span class="inbox-row-icon category-mail" aria-hidden="true">✉</span>
                  <span class="inbox-row-main"><span class="inbox-row-title">{{ mail.title }}</span><span class="inbox-row-preview">{{ mail.preview || mail.senderName }}</span><span v-if="mail.hasAttachments" class="inbox-mail-attachment-label">{{ mail.claimedAt ? '附件已领取' : '有附件' }}</span></span>
                  <span class="inbox-row-meta"><time :datetime="mail.createdAt">{{ formatDate(mail.createdAt) }}</time><i v-if="!mail.isRead" class="inbox-unread-dot" aria-label="未读" /></span>
                </button>
                <p v-if="!mailItems.length && !mailLoading && !mailError" class="inbox-state">{{ mailFilter === 'unread' ? '没有未读邮件' : mailFilter === 'attachments' ? '没有带附件的邮件' : '邮箱空空如也' }}</p>
                <button v-if="mailHasMore" type="button" class="inbox-load-more" :disabled="mailLoadingMore || mailLoading" @click="emit('mail-load-more')">{{ mailLoadingMore ? '正在加载…' : '查看更早的邮件' }}</button>
              </template>
            </div>
            <div class="inbox-mail-footer"><button type="button" :disabled="mailActionBusy || mailLoading" @click="requestClaimAllMail">{{ claimAllConfirm ? '确认领取所有邮件附件' : '全部领取附件' }}</button></div>
          </div>

          <article v-if="selectedMailId !== null" class="inbox-detail" :aria-label="selectedMail?.title || '邮件详情'">
            <div class="inbox-detail-top"><button type="button" class="inbox-back" @click="closeDetail">‹ 返回</button><span>游戏邮件</span></div>
            <p v-if="mailDetailLoading || (!selectedMail && !mailError)" class="inbox-state" role="status">正在读取邮件…</p>
            <p v-else-if="!selectedMail && mailError" class="inbox-error" role="alert">{{ mailError }} <button type="button" @click="emit('open-mail', selectedMailId)">重试</button></p>
            <template v-else-if="selectedMail">
              <h3>{{ selectedMail.title }}</h3>
              <time :datetime="selectedMail.createdAt">{{ formatDate(selectedMail.createdAt, true) }}</time>
              <p class="inbox-mail-sender">来自：{{ selectedMail.senderName }}</p>
              <div class="inbox-message inbox-mail-body"><p class="inbox-message-text">{{ selectedMail.body || '这封邮件没有正文。' }}</p></div>
              <div v-if="selectedMail.attachments.length" class="inbox-mail-attachments">
                <h4>附件</h4>
                <div v-for="attachment in selectedMail.attachments" :key="attachment.itemId" class="inbox-mail-attachment">
                  <InventoryItemIcon :name="attachment.name" :code="attachment.code" :item-type="attachment.itemType" />
                  <span><strong>{{ attachment.name }}</strong><small>{{ attachment.rarity }}</small></span><b>×{{ attachment.quantity }}</b>
                </div>
              </div>
              <div class="inbox-mail-actions">
                <button v-if="selectedMail.hasAttachments && !selectedMail.claimedAt" type="button" class="inbox-mail-claim" :disabled="mailActionBusy" @click="emit('claim-mail', selectedMail.id)">{{ mailActionBusy ? '处理中…' : '领取附件' }}</button>
                <button type="button" class="inbox-mail-delete" :disabled="mailActionBusy || (selectedMail.hasAttachments && !selectedMail.claimedAt)" :title="selectedMail.hasAttachments && !selectedMail.claimedAt ? '请先领取附件' : '删除邮件'" @click="requestDeleteMail(selectedMail.id)">{{ deleteConfirmMailId === selectedMail.id ? '确认删除' : '删除邮件' }}</button>
              </div>
            </template>
          </article>
          <div v-else class="inbox-detail-placeholder" aria-hidden="true"><span>✉</span><p>选择一封邮件查看正文与附件</p></div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.inbox-backdrop { position: fixed; z-index: 90; inset: 0; display: grid; place-items: center; padding: 20px; background: rgba(43, 36, 54, .42); backdrop-filter: blur(4px); }
.inbox-dialog { display: flex; flex-direction: column; width: min(780px, calc(100vw - 40px)); height: min(620px, calc(100dvh - 40px)); min-height: 0; overflow: hidden; color: #51465a; background: #fffaf6; border: 1px solid rgba(255,255,255,.9); border-radius: 22px; box-shadow: 0 24px 68px rgba(55, 41, 65, .28); }
.inbox-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 15px 17px 11px; }
.inbox-heading-group { display: flex; align-items: center; gap: 8px; min-width: 0; }
.inbox-envelope { display: grid; place-items: center; width: 29px; height: 29px; color: #795d9d; background: #eee6fb; border-radius: 9px; font-size: 18px; }
.inbox-heading-group h2 { margin: 0; font-size: 17px; line-height: 1.3; }
.inbox-unread { min-width: 19px; padding: 2px 5px; color: #fff; background: #e36f76; border-radius: 10px; font-size: 10px; font-weight: 700; text-align: center; }
.inbox-close { width: 29px; height: 29px; padding: 0; color: #a36d74; background: #ffebeb; border-radius: 9px; font-size: 22px; line-height: 1; }
.inbox-tabs { display: flex; gap: 5px; padding: 0 17px 10px; border-bottom: 1px solid #ebdfde; }
.inbox-tabs button { min-width: 62px; padding: 6px 10px; color: #85798e; background: transparent; border-radius: 9px; font-size: 12px; }
.inbox-tabs button.active { color: #674b96; background: #eee6fa; font-weight: 700; }
.inbox-tab-count { display: inline-block; min-width: 15px; margin-left: 5px; padding: 1px 3px; color: #fff; background: #e58383; border-radius: 8px; font-size: 9px; line-height: 1.3; }
.inbox-tabs .inbox-refresh { min-width: 0; margin-left: auto; color: #846a94; }
.inbox-tabs button:disabled, .inbox-load-more:disabled, .inbox-mark-read:disabled, .inbox-mail-footer button:disabled, .inbox-mail-actions button:disabled { opacity: .55; cursor: wait; }
.inbox-body { display: grid; grid-template-columns: minmax(220px, 42%) minmax(0, 1fr); min-height: 0; flex: 1; }
.inbox-list { min-height: 0; overflow-y: auto; overscroll-behavior: contain; border-right: 1px solid #ebdfde; }
.inbox-mail-list { display: flex; flex-direction: column; overflow: hidden; }
.inbox-mail-filters { display: flex; gap: 3px; padding: 9px 10px; border-bottom: 1px solid #f0e5e0; }
.inbox-mail-filters button { flex: 1; min-width: 0; padding: 6px 2px; color: #8d7d94; background: transparent; border-radius: 8px; font-size: 11px; }
.inbox-mail-filters button.active { color: #715697; background: #eee7f8; font-weight: 700; }
.inbox-mail-scroll { min-height: 0; flex: 1; overflow-y: auto; overscroll-behavior: contain; }
.inbox-mail-footer { padding: 9px 10px; border-top: 1px solid #eee3df; background: #fffaf6; }
.inbox-mail-footer button { width: 100%; padding: 9px; color: #fff; background: #9679b7; border-radius: 9px; font-size: 11px; }
.inbox-row { display: flex; align-items: center; gap: 9px; width: 100%; min-height: 67px; padding: 10px 12px; color: inherit; background: transparent; border-bottom: 1px solid #f1e8e4; border-radius: 0; text-align: left; }
.inbox-row:hover, .inbox-row.selected { background: #f5edf9; }
.inbox-row.unread { background: #fff4ef; }
.inbox-row.unread:hover, .inbox-row.unread.selected { background: #f9e8ee; }
.inbox-row-icon { display: grid; place-items: center; flex: 0 0 31px; width: 31px; height: 31px; color: #9675aa; background: #f0e9fa; border-radius: 10px; font-size: 15px; }
.inbox-row-icon.category-mail { color: #bb805b; background: #fff0dd; }
.inbox-row-icon.category-battle { color: #b96372; background: #ffeced; }
.inbox-row-main { display: grid; min-width: 0; gap: 4px; flex: 1; }
.inbox-row-title, .inbox-row-preview { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.inbox-row-title { font-size: 12px; font-weight: 700; }
.inbox-row-preview { color: #9c909d; font-size: 10px; }
.inbox-mail-attachment-label { width: fit-content; padding: 2px 5px; color: #aa764e; background: #fff0d9; border-radius: 5px; font-size: 9px; }
.inbox-row-meta { display: grid; align-self: stretch; align-content: space-between; justify-items: end; flex: 0 0 auto; color: #a699aa; font-size: 9px; white-space: nowrap; }
.inbox-unread-dot { width: 7px; height: 7px; background: #ec7e78; border-radius: 50%; }
.inbox-state { margin: 0; padding: 25px 12px; color: #9a8a9a; font-size: 12px; text-align: center; }
.inbox-error { margin: 8px; padding: 9px 10px; color: #ad4e5b; background: #fff0ed; border-radius: 9px; font-size: 11px; }
.inbox-error button { margin-left: 5px; padding: 0; color: #79519c; background: transparent; text-decoration: underline; }
.inbox-load-more { display: block; width: calc(100% - 20px); margin: 10px; padding: 9px; color: #765e93; background: #f0e9f9; border-radius: 10px; font-size: 11px; }
.inbox-detail { min-width: 0; min-height: 0; overflow-y: auto; padding: 17px 20px 22px; overscroll-behavior: contain; }
.inbox-detail-top { display: flex; align-items: center; justify-content: space-between; color: #97899b; font-size: 10px; }
.inbox-back { padding: 0; color: #8064a1; background: transparent; font-size: 11px; }
.inbox-detail h3 { margin: 13px 0 5px; font-size: 18px; line-height: 1.4; overflow-wrap: anywhere; }
.inbox-detail time { color: #aa9aab; font-size: 10px; }
.inbox-mail-sender { margin: 7px 0 0; color: #928398; font-size: 11px; }
.inbox-mail-body { margin-top: 18px; }
.inbox-mail-attachments { display: grid; gap: 7px; margin-top: 16px; }
.inbox-mail-attachments h4 { margin: 0; font-size: 12px; }
.inbox-mail-attachment { display: flex; align-items: center; gap: 9px; min-width: 0; padding: 7px; background: #fff; border: 1px solid #eee5df; border-radius: 10px; }
.inbox-mail-attachment :deep(.inventory-art-wrap) { flex: 0 0 38px; width: 38px; height: 38px; margin: 0; }
.inbox-mail-attachment span:not(.inventory-art-wrap) { display: grid; min-width: 0; gap: 2px; flex: 1; }
.inbox-mail-attachment strong { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.inbox-mail-attachment small { color: #a094a3; font-size: 9px; }
.inbox-mail-attachment b { font-size: 11px; }
.inbox-mail-actions { display: flex; gap: 8px; margin-top: 18px; }
.inbox-mail-actions button { flex: 1; padding: 9px 8px; border-radius: 9px; font-size: 11px; }
.inbox-mail-claim { color: #fff; background: #9272b8; }
.inbox-mail-delete { color: #a65b61; background: #ffe9e8; }
.inbox-detail-messages { display: grid; gap: 12px; margin-top: 18px; }
.inbox-message { min-width: 0; padding: 11px 12px; background: #fff; border: 1px solid #f0e5e0; border-radius: 11px; }
.inbox-message-text { margin: 0; color: #594e60; font-size: 12px; line-height: 1.7; overflow-wrap: anywhere; white-space: pre-wrap; }
.inbox-message-image { display: block; max-width: 100%; max-height: 340px; margin: 9px auto 0; object-fit: contain; border-radius: 8px; }
.inbox-message-actions { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.inbox-message-actions button { padding: 6px 10px; color: #71548e; background: #eee7f9; border-radius: 8px; font-size: 11px; }
.inbox-mark-read { margin-top: 14px; padding: 8px 11px; color: #fff; background: #8d70b5; border-radius: 9px; font-size: 11px; }
.inbox-detail-placeholder { display: grid; place-content: center; justify-items: center; gap: 7px; min-height: 0; color: #aa9aaa; font-size: 12px; text-align: center; }
.inbox-detail-placeholder span { font-size: 40px; color: #d6c6df; }
.inbox-detail-placeholder p { margin: 0; }
@media (max-width: 600px) {
  .inbox-dialog { height: min(650px, calc(100dvh - 40px)); }
  .inbox-body { display: block; position: relative; }
  .inbox-list { height: 100%; border-right: 0; }
  .inbox-detail { position: absolute; inset: 0; background: #fffaf6; }
  .inbox-detail-placeholder { display: none; }
}
</style>
