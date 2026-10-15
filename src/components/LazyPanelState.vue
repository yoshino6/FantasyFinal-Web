<script setup lang="ts">
import { gameAssetUrl } from '../game-assets';

withDefaults(defineProps<{ failed?: boolean; overlay?: boolean }>(), { failed: false, overlay: false });
defineEmits<{ reload: []; close: [] }>();
</script>

<template>
  <div class="lazy-panel-container" :class="{ 'is-overlay': overlay }">
    <section class="lazy-panel-state card-surface" :class="{ 'has-error': failed }" :role="failed ? 'alert' : 'status'" aria-live="polite" :aria-busy="!failed">
      <img :src="gameAssetUrl('/assets/light-anime/auth-v4/fantasy-logo.webp')" width="1942" height="809" alt="" aria-hidden="true" />
      <p>{{ failed ? '界面加载中断。重新加载页面后，请再次打开此界面。' : '正在打开界面…' }}</p>
      <button v-if="failed" type="button" class="primary-button" @click="$emit('reload')">重新加载页面</button>
      <button v-if="overlay" type="button" class="ghost-button" @click="$emit('close')">关闭</button>
    </section>
  </div>
</template>

<style scoped>
.lazy-panel-container { width: 100%; }
.lazy-panel-container.is-overlay { position: fixed; z-index: 130; inset: 0; display: grid; place-items: center; padding: 20px; background: #29453666; backdrop-filter: blur(3px); }
.lazy-panel-state { box-sizing: border-box; display: grid; justify-items: center; align-content: center; gap: 14px; min-height: 180px; width: min(100%, 540px); margin: 20px auto; padding: 28px 20px; border: 1px solid #d6bc8a; border-radius: 12px; background: linear-gradient(150deg, #fffdf2, #f4f1d9); color: #415947; box-shadow: 0 5px 18px #3958381c, inset 0 0 0 3px #fffdf6; text-align: center; }
.lazy-panel-state img { display: block; width: min(180px, 65%); height: auto; }
.lazy-panel-state p { margin: 0; font-size: 14px; line-height: 1.6; }
.lazy-panel-state.has-error { color: #79523c; }
.lazy-panel-state button { min-height: 44px; padding: 9px 20px; }
</style>
