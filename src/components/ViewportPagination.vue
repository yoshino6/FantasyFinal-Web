<script setup lang="ts">
import { ref, watch } from 'vue';
const props = withDefaults(defineProps<{ page: number; totalPages: number; total?: number; disabled?: boolean; label?: string; editable?: boolean }>(), { label: '翻页', editable: false });
const emit = defineEmits<{ 'update:page': [page: number] }>();
const pageInput = ref(String(props.page));
let submittedPage: number | undefined;
watch(() => props.page, page => { pageInput.value = String(page); submittedPage = undefined; });
const commitPage = () => {
  if (props.disabled || !/^\d+$/.test(pageInput.value.trim())) { pageInput.value = String(props.page); return; }
  const page = Math.max(1, Math.min(props.totalPages, Number(pageInput.value.trim())));
  pageInput.value = String(page);
  if (page === props.page || page === submittedPage) return;
  submittedPage = page;
  emit('update:page', page);
};
</script>

<template>
  <nav class="viewport-pagination" :class="{ 'is-editable': editable }" :aria-label="label">
    <button type="button" :disabled="disabled || page <= 1" :aria-label="`${label}：上一页`" @click="emit('update:page', page - 1)">‹ 上一页</button>
    <label><span class="sr-only">{{ label }}页码</span><template v-if="editable"><input v-model="pageInput" type="text" inputmode="numeric" pattern="[0-9]*" :aria-label="`${label}页码`" :disabled="disabled || totalPages <= 1" @keydown.enter.prevent="commitPage" @blur="commitPage" /><small class="viewport-page-total">共 {{ totalPages }} 页</small></template><template v-else><select :value="page" :disabled="disabled || totalPages <= 1" @change="emit('update:page', Number(($event.target as HTMLSelectElement).value))"><option v-for="number in totalPages" :key="number" :value="number">{{ number }} / {{ totalPages }}</option></select><small v-if="total !== undefined">共 {{ total }} 项</small></template></label>
    <button type="button" :disabled="disabled || page >= totalPages" :aria-label="`${label}：下一页`" @click="emit('update:page', page + 1)">下一页 ›</button>
  </nav>
</template>

<style>
.viewport-pagination{display:flex;flex:none;align-items:center;justify-content:center;gap:8px;min-height:34px;padding:3px 0;color:#654d3a;font-size:13px}
.viewport-pagination button,.viewport-pagination select,.viewport-pagination input{min-height:30px;border:1px solid #b8a07a;border-radius:7px;background:#fff8e9;color:#58412d;padding:3px 10px;font:inherit}
.viewport-pagination input{width:3.5em;text-align:center;padding:3px 5px}
.viewport-pagination .viewport-page-total{display:inline}
.viewport-pagination button:disabled{opacity:.45;cursor:default}
.viewport-pagination label{display:flex;align-items:center;gap:6px;white-space:nowrap}
.viewport-pagination small{font-size:11px}
@media(max-height:450px){.viewport-pagination{min-height:28px;padding:0;gap:5px}.viewport-pagination button,.viewport-pagination select,.viewport-pagination input{min-height:26px;padding:1px 8px}}
@media(max-width:360px){.viewport-pagination{gap:4px;font-size:12px}.viewport-pagination small{display:none}}
</style>
