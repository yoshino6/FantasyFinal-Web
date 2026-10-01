<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

export type RegionMapPosition = {
  x: number;
  y: number;
  z?: number;
};

export type RegionOverview = {
  code: string;
  name: string;
  danger?: string | number;
  isCurrent?: boolean;
  current?: RegionMapPosition;
};

export type PartyMapMember = RegionMapPosition & {
  id: string;
  name: string;
  regionName?: string;
  regionCode?: string;
  icon?: string;
  isCurrent?: boolean;
};

export type MapLandmark = RegionMapPosition & {
  id: string;
  name: string;
  regionName?: string;
  regionCode?: string;
  type?: string;
  icon?: string;
  description?: string;
};

export type RegionTravelRequest = RegionMapPosition & {
  targetId: string;
  targetName: string;
  targetKind: 'member' | 'landmark';
  regionCode?: string;
  regionName?: string;
};

const props = withDefaults(defineProps<{
  regions?: RegionOverview[];
  members?: PartyMapMember[];
  landmarks?: MapLandmark[];
  currentRegionCode?: string;
  disabled?: boolean;
  loading?: boolean;
}>(), {
  regions: () => [],
  members: () => [],
  landmarks: () => [],
  currentRegionCode: '',
  disabled: false,
  loading: false,
});

const emit = defineEmits<{
  (event: 'travel', request: RegionTravelRequest): void;
  (event: 'update:open', open: boolean): void;
  (event: 'selected-region', region: RegionOverview | undefined): void;
}>();

const open = ref(false);
const selectedRegionCode = ref('');
const pendingDestination = ref<RegionTravelRequest | null>(null);

const currentRegion = computed(() => {
  const code = selectedRegionCode.value || props.currentRegionCode;
  return props.regions.find((region) => region.code === code) ?? props.regions.find((region) => region.isCurrent) ?? props.regions[0];
});

const activeRegionCode = computed(() => currentRegion.value?.code || selectedRegionCode.value || props.currentRegionCode || '');
// A few server snapshots only include a region code on the region itself. Keep
// unscoped entries visible in that case instead of silently dropping markers.
const activeMembers = computed(() => props.members.filter((member) => !activeRegionCode.value || !member.regionCode || member.regionCode === activeRegionCode.value));
const activeLandmarks = computed(() => props.landmarks.filter((landmark) => !activeRegionCode.value || !landmark.regionCode || landmark.regionCode === activeRegionCode.value));

type MapMarker = {
  key: string;
  id: string;
  name: string;
  x: number;
  y: number;
  z?: number;
  kind: 'member' | 'landmark';
  icon: string;
  regionCode?: string;
  regionName?: string;
  type?: string;
};

const mapMarkers = computed<MapMarker[]>(() => [
  ...activeMembers.value.map((member) => ({
    key: `member:${member.id}`,
    id: member.id,
    name: member.name,
    x: member.x,
    y: member.y,
    z: member.z,
    kind: 'member' as const,
    icon: member.icon || '●',
    regionCode: member.regionCode || activeRegionCode.value,
    regionName: member.regionName || currentRegion.value?.name,
  })),
  ...activeLandmarks.value.map((landmark) => ({
    key: `landmark:${landmark.id}`,
    id: landmark.id,
    name: landmark.name,
    x: landmark.x,
    y: landmark.y,
    z: landmark.z,
    kind: 'landmark' as const,
    icon: landmark.icon || '✦',
    regionCode: landmark.regionCode || activeRegionCode.value,
    regionName: landmark.regionName || currentRegion.value?.name,
    type: landmark.type,
  })),
]);

const bounds = computed(() => {
  const values = mapMarkers.value.length
    ? mapMarkers.value
    : currentRegion.value?.current
      ? [{ x: currentRegion.value.current.x, y: currentRegion.value.current.y }]
      : [{ x: 0, y: 0 }];
  const xs = values.map((item) => item.x);
  const ys = values.map((item) => item.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
});

const markerStyle = (marker: MapMarker) => {
  const xSpan = Math.max(1, bounds.value.maxX - bounds.value.minX);
  const ySpan = Math.max(1, bounds.value.maxY - bounds.value.minY);
  return {
    left: `${8 + ((marker.x - bounds.value.minX) / xSpan) * 84}%`,
    top: `${92 - ((marker.y - bounds.value.minY) / ySpan) * 84}%`,
  };
};

const formatCoordinate = (position: RegionMapPosition) => `(${position.x}, ${position.y}${position.z === undefined ? '' : `, ${position.z}`})`;

const selectRegion = (region: RegionOverview) => {
  selectedRegionCode.value = region.code;
  emit('selected-region', region);
};

const openSidebar = (regionCode?: string) => {
  if (props.disabled) return;
  if (regionCode && props.regions.some(region => region.code === regionCode)) selectedRegionCode.value = regionCode;
  else if (!selectedRegionCode.value) selectedRegionCode.value = props.currentRegionCode || props.regions.find((region) => region.isCurrent)?.code || props.regions[0]?.code || '';
  open.value = true;
  emit('update:open', true);
};

const closeSidebar = () => {
  open.value = false;
  pendingDestination.value = null;
  emit('update:open', false);
};

const requestTravel = (marker: MapMarker) => {
  if (props.disabled || props.loading) return;
  pendingDestination.value = {
    targetId: marker.id,
    targetName: marker.name,
    targetKind: marker.kind,
    x: marker.x,
    y: marker.y,
    z: marker.z,
    regionCode: marker.regionCode,
    regionName: marker.regionName,
  };
};

const confirmTravel = () => {
  if (!pendingDestination.value || props.disabled || props.loading) return;
  const request = pendingDestination.value;
  pendingDestination.value = null;
  emit('travel', request);
  closeSidebar();
};

const cancelTravel = () => { pendingDestination.value = null; };

const onKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && pendingDestination.value) {
    cancelTravel();
  } else if (event.key === 'Escape' && open.value) {
    closeSidebar();
  }
};

// The exploration grid owns the visible map button. Keep the drawer controls
// here so the parent can open it without duplicating a floating toggle.
defineExpose({ openSidebar, closeSidebar });

watch(() => props.currentRegionCode, (code) => {
  if (code && !open.value) selectedRegionCode.value = code;
});

onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
</script>

<template>
  <div class="region-map-sidebar-shell">
    <Transition name="region-map-fade">
      <div v-if="open" class="region-map-backdrop" aria-hidden="true" @click="closeSidebar" />
    </Transition>

    <Transition name="region-map-slide">
      <aside v-if="open" id="region-map-drawer" class="region-map-drawer" role="dialog" aria-modal="true" aria-label="世界地图">
        <header class="drawer-header">
          <div>
            <p class="drawer-kicker">WORLD MAP</p>
            <h2>世界地图</h2>
          </div>
          <button type="button" class="drawer-close" aria-label="收起地图" @click="closeSidebar">×</button>
        </header>

        <div v-if="regions.length" class="region-tabs" aria-label="区域选择">
          <button
            v-for="region in regions"
            :key="region.code"
            type="button"
            class="region-tab"
            :class="{ active: region.code === activeRegionCode }"
            @click="selectRegion(region)"
          >
            <span>{{ region.name }}</span>
            <small v-if="region.danger !== undefined">危险 {{ region.danger }}</small>
          </button>
        </div>

        <div class="drawer-content">
          <section class="region-map-card" aria-label="区域坐标地图">
            <div class="region-map-card-heading">
              <div>
                <strong>{{ currentRegion?.name || '未知区域' }}</strong>
                <small v-if="currentRegion?.code">{{ currentRegion.code }}</small>
              </div>
              <span v-if="loading" class="drawer-loading">更新中</span>
            </div>
            <div class="region-mini-map" role="img" :aria-label="`${currentRegion?.name || '当前区域'}的队员与关键坐标`">
              <button
                v-for="marker in mapMarkers"
                :key="marker.key"
                type="button"
                class="region-map-marker"
                :class="`marker-${marker.kind}`"
                :style="markerStyle(marker)"
                :aria-label="`${marker.name} ${formatCoordinate(marker)}`"
                @click="requestTravel(marker)"
              >
                <span class="region-map-marker-icon">{{ marker.icon }}</span>
                <span class="region-map-marker-name">{{ marker.name }}</span>
              </button>
              <span class="map-axis map-axis-x" aria-hidden="true" />
              <span class="map-axis map-axis-y" aria-hidden="true" />
              <small class="map-axis-label map-axis-label-x">东西</small>
              <small class="map-axis-label map-axis-label-y">南北</small>
            </div>
            <p class="region-map-hint">点击队员或关键坐标，确认后前往。</p>
          </section>

          <section v-if="activeMembers.length" class="drawer-section">
            <div class="drawer-section-heading"><strong>队员位置</strong><small>{{ activeMembers.length }} 人</small></div>
            <button v-for="member in activeMembers" :key="member.id" type="button" class="destination-row" @click="requestTravel({ ...member, kind: 'member', icon: member.icon || '●', regionCode: member.regionCode || activeRegionCode, regionName: member.regionName || currentRegion?.name, id: member.id, name: member.name, key: `member:${member.id}` })">
              <span class="destination-icon member-icon">{{ member.icon || '●' }}</span>
              <span class="destination-copy"><strong>{{ member.name }}</strong><small>{{ member.regionName || currentRegion?.name || '未知区域' }} · {{ formatCoordinate(member) }}</small></span>
              <span class="destination-arrow" aria-hidden="true">›</span>
            </button>
          </section>

          <section v-if="activeLandmarks.length" class="drawer-section">
            <div class="drawer-section-heading"><strong>关键坐标</strong><small>{{ activeLandmarks.length }} 处</small></div>
            <button v-for="landmark in activeLandmarks" :key="landmark.id" type="button" class="destination-row" @click="requestTravel({ ...landmark, kind: 'landmark', icon: landmark.icon || '✦', regionCode: landmark.regionCode || activeRegionCode, regionName: landmark.regionName || currentRegion?.name, id: landmark.id, name: landmark.name, key: `landmark:${landmark.id}` })">
              <span class="destination-icon landmark-icon">{{ landmark.icon || '✦' }}</span>
              <span class="destination-copy"><strong>{{ landmark.name }}</strong><small>{{ landmark.type || '地点' }} · {{ formatCoordinate(landmark) }}</small></span>
              <span class="destination-arrow" aria-hidden="true">›</span>
            </button>
          </section>

          <p v-if="!activeMembers.length && !activeLandmarks.length" class="drawer-empty">当前区域还没有可标记的队员或坐标。</p>
        </div>

        <Transition name="region-map-dialog">
          <div v-if="pendingDestination" class="travel-confirm-wrap" role="presentation" @click.self="cancelTravel">
            <div class="travel-confirm" role="dialog" aria-modal="true" aria-labelledby="travel-confirm-title">
              <span class="confirm-icon">{{ pendingDestination.targetKind === 'member' ? '●' : '✦' }}</span>
              <p class="drawer-kicker">确认前往</p>
              <h3 id="travel-confirm-title">{{ pendingDestination.targetName }}</h3>
              <p>{{ pendingDestination.regionName || '未知区域' }} · {{ formatCoordinate(pendingDestination) }}</p>
              <div class="confirm-actions">
                <button type="button" class="confirm-button secondary" @click="cancelTravel">取消</button>
                <button type="button" class="confirm-button primary" :disabled="loading" @click="confirmTravel">{{ loading ? '处理中…' : '确认前往' }}</button>
              </div>
            </div>
          </div>
        </Transition>
      </aside>
    </Transition>
  </div>
</template>

<style scoped>
.region-map-sidebar-shell { position: relative; z-index: 30; }
.region-map-toggle { position: fixed; right: 12px; bottom: calc(76px + env(safe-area-inset-bottom, 0px)); z-index: 32; display: grid; place-items: center; width: 48px; height: 48px; padding: 4px; color: #66596f; background: rgba(255,250,244,.96); border: 1px solid rgba(255,255,255,.95); border-radius: 16px; box-shadow: 0 8px 22px rgba(65, 49, 72, .17); backdrop-filter: blur(8px); transition: transform .15s ease, color .15s ease, background .15s ease; }
.region-map-toggle:hover, .region-map-toggle.is-open { color: #fff; background: linear-gradient(135deg, #8170ba, #ac91d0); transform: translateY(-2px); }
.region-map-toggle:disabled { cursor: not-allowed; opacity: .45; }
.region-map-toggle span { font-size: 20px; line-height: 1; }
.region-map-toggle small { margin-top: 2px; font-size: 8px; line-height: 1; }
.region-map-backdrop { position: fixed; z-index: 30; inset: 0; background: rgba(48, 38, 58, .24); backdrop-filter: blur(2px); }
.region-map-drawer { position: fixed; z-index: 31; top: 50%; left: 50%; display: flex; flex-direction: column; width: min(94vw, 960px); height: min(88dvh, 820px); max-height: calc(100dvh - 24px); overflow: hidden; color: var(--ink, #4d4354); background: #fffaf4; border: 1px solid rgba(255,255,255,.94); border-radius: 22px; box-shadow: 0 24px 70px rgba(58, 45, 69, .28); transform: translate(-50%, -50%); }
.drawer-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: max(16px, env(safe-area-inset-top, 0px)) 17px 12px; border-bottom: 1px solid #f0e5de; }
.drawer-kicker { margin: 0 0 3px; color: #a28eb5; font-size: 9px; letter-spacing: .14em; }
.drawer-header h2 { margin: 0; font-size: 19px; }
.drawer-close { width: 31px; height: 31px; padding: 0; color: #85748d; background: #f7eee9; border-radius: 10px; font-size: 20px; line-height: 1; }
.region-tabs { display: flex; gap: 6px; overflow-x: auto; padding: 9px 13px; border-bottom: 1px solid #f2e9e3; scrollbar-width: none; }
.region-tabs::-webkit-scrollbar { display: none; }
.region-tab { display: grid; flex: 0 0 auto; gap: 2px; min-width: 84px; padding: 7px 9px; color: #796b83; background: #f8f1ed; border: 1px solid transparent; border-radius: 11px; text-align: left; }
.region-tab span { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.region-tab small { color: #ad9696; font-size: 8px; }
.region-tab.active { color: #655283; background: #f0eaff; border-color: #d4c5ef; }
.drawer-content { flex: 1; overflow-y: auto; padding: 12px 13px calc(18px + env(safe-area-inset-bottom, 0px)); overscroll-behavior: contain; }
.region-map-card { padding: 11px; background: #faf4ef; border: 1px solid #f1e5de; border-radius: 15px; }
.region-map-card-heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
.region-map-card-heading div { display: grid; gap: 2px; min-width: 0; }
.region-map-card-heading strong { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.region-map-card-heading small { color: #a08c98; font-size: 9px; }
.drawer-loading { color: #977db8; font-size: 9px; }
.region-mini-map { position: relative; height: clamp(320px, 56vh, 560px); min-height: 320px; overflow: hidden; background: radial-gradient(circle at 50% 46%, rgba(255,255,255,.8), rgba(236,229,248,.64)); border: 1px solid #e3d8ee; border-radius: 15px; }
.region-mini-map::before { content: ''; position: absolute; inset: 0; background-image: linear-gradient(rgba(170,153,196,.14) 1px, transparent 1px), linear-gradient(90deg, rgba(170,153,196,.14) 1px, transparent 1px); background-size: 20% 20%; }
.map-axis { position: absolute; z-index: 1; opacity: .45; background: #bda9cc; }
.map-axis-x { top: 50%; left: 7%; width: 86%; height: 1px; }
.map-axis-y { top: 7%; left: 50%; width: 1px; height: 86%; }
.map-axis-label { position: absolute; z-index: 1; color: #a993ad; font-size: 8px; }
.map-axis-label-x { right: 6px; top: calc(50% + 3px); }
.map-axis-label-y { left: calc(50% + 4px); top: 5px; }
.region-map-marker { position: absolute; z-index: 2; display: grid; place-items: center; width: 34px; height: 34px; padding: 0; border: 2px solid rgba(255,255,255,.95); border-radius: 50%; box-shadow: 0 3px 8px rgba(71, 52, 86, .18); transform: translate(-50%, -50%); transition: transform .15s ease, filter .15s ease; }
.region-map-marker:hover { z-index: 3; filter: brightness(1.04); transform: translate(-50%, -50%) scale(1.1); }
.region-map-marker-icon { display: grid; place-items: center; font-size: 14px; line-height: 1; }
.region-map-marker-name { position: absolute; bottom: calc(100% + 5px); left: 50%; max-width: 150px; padding: 3px 6px; overflow: hidden; color: #5e5168; background: rgba(255,250,245,.94); border: 1px solid rgba(226,214,230,.9); border-radius: 7px; box-shadow: 0 2px 7px rgba(71, 52, 86, .12); font-size: 10px; font-weight: 600; line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; pointer-events: none; transform: translateX(-50%); }
.marker-member { color: #fff; background: linear-gradient(145deg, #e98778, #ce6f82); }
.marker-landmark { color: #fff9e9; background: linear-gradient(145deg, #b995d2, #8e78b6); }
.region-map-hint { margin: 7px 1px 0; color: #9a8a96; font-size: 9px; line-height: 1.4; }
.drawer-section { display: grid; gap: 6px; margin-top: 13px; }
.drawer-section-heading { display: flex; align-items: baseline; justify-content: space-between; padding: 0 2px; color: #66596f; font-size: 12px; }
.drawer-section-heading small { color: #a6949f; font-size: 9px; }
.destination-row { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 8px 9px; color: #5f526b; background: #fcf7f2; border: 1px solid transparent; border-radius: 11px; text-align: left; }
.destination-row:hover { background: #f5efff; border-color: #dfd3f1; }
.destination-icon { display: grid; place-items: center; flex: 0 0 27px; width: 27px; height: 27px; color: #fff; border-radius: 9px; font-size: 12px; }
.member-icon { background: #de847a; }
.landmark-icon { background: #a58ac2; }
.destination-copy { display: grid; flex: 1; min-width: 0; gap: 2px; }
.destination-copy strong { overflow: hidden; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.destination-copy small { overflow: hidden; color: #9b8b98; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.destination-arrow { color: #b49fc8; font-size: 19px; line-height: 1; }
.drawer-empty { margin: 17px 2px; color: #a1929c; font-size: 11px; line-height: 1.55; text-align: center; }
.travel-confirm-wrap { position: absolute; z-index: 4; inset: 0; display: grid; place-items: center; padding: 16px; background: rgba(63, 50, 72, .27); backdrop-filter: blur(3px); }
.travel-confirm { width: min(300px, 100%); padding: 21px 17px 15px; color: #554965; background: #fffaf5; border: 1px solid rgba(255,255,255,.95); border-radius: 17px; box-shadow: 0 16px 35px rgba(57, 43, 68, .22); text-align: center; }
.confirm-icon { display: grid; place-items: center; width: 38px; height: 38px; margin: 0 auto 7px; color: #fff; background: #9b82bf; border-radius: 13px; font-size: 15px; }
.travel-confirm h3 { margin: 0 0 5px; font-size: 17px; }
.travel-confirm > p:not(.drawer-kicker) { margin: 0; color: #998b99; font-size: 10px; }
.confirm-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 7px; margin-top: 16px; }
.confirm-button { padding: 9px 8px; border-radius: 10px; font-size: 11px; }
.confirm-button.secondary { color: #766982; background: #f4eee9; }
.confirm-button.primary { color: #fff; background: linear-gradient(135deg, #8170ba, #ab8fcf); }
.confirm-button:disabled { opacity: .5; }
.region-map-fade-enter-active, .region-map-fade-leave-active, .region-map-dialog-enter-active, .region-map-dialog-leave-active { transition: opacity .18s ease; }
.region-map-fade-enter-from, .region-map-fade-leave-to, .region-map-dialog-enter-from, .region-map-dialog-leave-to { opacity: 0; }
.region-map-slide-enter-active, .region-map-slide-leave-active { transition: opacity .22s ease, transform .22s ease; }
.region-map-slide-enter-from, .region-map-slide-leave-to { opacity: 0; transform: translate(-50%, -50%) scale(.96) translateY(10px); }
@media (max-width: 640px) {
  .region-map-drawer { width: calc(100vw - 24px); height: min(88dvh, 760px); border-radius: 18px; }
  .drawer-header { padding-inline: 14px; }
  .drawer-content { padding-inline: 10px; }
  .region-mini-map { height: clamp(270px, 54vh, 460px); min-height: 270px; }
  .region-map-marker-name { max-width: 120px; font-size: 9px; }
}
</style>
