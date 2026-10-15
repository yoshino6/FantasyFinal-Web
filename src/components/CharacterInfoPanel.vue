<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { Panel, PanelEquippedItem, PanelPortrait } from '../api';
import CharacterPortrait from './CharacterPortrait.vue';
import '../profile-layout.css';
import '../game-ui-profile.css';

export type CharacterInfoEntry = { key: string; label: string; value: string | number; help?: string };
export type CharacterInfoGroup = { id: string; label: string; entries: CharacterInfoEntry[]; help?: string };
const props = defineProps<{
  summary?: Panel['summary']; gameId?: string; portrait?: PanelPortrait;
  equipment?: Array<Partial<PanelEquippedItem> & { slot?: string; name?: string; instanceId?: number | null }>;
  groups: CharacterInfoGroup[];
}>();
const selected = ref('base'), help = ref<CharacterInfoEntry | null>(null);
const profilePanel = ref<HTMLElement | null>(null);
const profileSize = ref({ width: 0, height: 0 });
let profileObserver: ResizeObserver | undefined;
onMounted(() => {
  profileObserver = new ResizeObserver(([entry]) => { if (entry) profileSize.value = { width: entry.contentRect.width, height: entry.contentRect.height }; });
  if (profilePanel.value) profileObserver.observe(profilePanel.value);
});
onBeforeUnmount(() => profileObserver?.disconnect());
const identity = computed<CharacterInfoGroup>(() => ({ id: 'identity', label: '资料', entries: [
  { key: 'gameId', label: 'Game ID', value: props.gameId || '未生成' },
  { key: 'gender', label: '性别', value: props.summary?.gender || '未设定' },
  { key: 'experience', label: '经验', value: `${props.summary?.experience ?? 0} / ${props.summary?.experienceRequired ?? '—'}` },
  { key: 'gift', label: '天赋', value: props.summary?.giftName || '无' },
  { key: 'region', label: '所在区域', value: props.summary?.region || '未进入地图' },
  { key: 'position', label: '当前坐标', value: props.summary?.position ? `(${props.summary.position.x}, ${props.summary.position.y}, ${props.summary.position.z})` : '—' },
  { key: 'buffs', label: '增益效果', value: props.summary?.activeBuffs?.length ? props.summary.activeBuffs.join('、') : '暂无' },
  { key: 'hp', label: '生命', value: `${props.summary?.hp.current ?? 0} / ${props.summary?.hp.max ?? 0}` },
  { key: 'mp', label: '魔力', value: `${props.summary?.mp.current ?? 0} / ${props.summary?.mp.max ?? 0}` },
  { key: 'stamina', label: '体力', value: `${props.summary?.stamina.current ?? 0} / ${props.summary?.stamina.max ?? 0}` }
] }));
const identitySummary = computed(() => `${props.summary?.name ?? '待登记旅人'}\n${props.summary?.profession ?? '尚未选择职业'} · Lv.${props.summary?.level ?? 1}\n${identity.value.entries.map(entry => `${entry.label}：${entry.value}`).join('\n')}`);
const identityResourcePercent = (key: string) => {
  const resource = key === 'hp' ? props.summary?.hp : key === 'mp' ? props.summary?.mp : key === 'stamina' ? props.summary?.stamina : undefined;
  return resource ? Math.min(100, Math.max(0, resource.current / Math.max(1, resource.max) * 100)) : 0;
};
const tabs = computed<CharacterInfoGroup[]>(() => {
  const mastery = props.groups.find(item => item.id === 'mastery');
  const resistance = props.groups.find(item => item.id === 'resistance');
  const names = [...new Set([...(mastery?.entries ?? []), ...(resistance?.entries ?? [])].map(entry => entry.label))];
  const elements = names.flatMap(name => [
    ...(mastery?.entries.filter(entry => entry.label === name).map(entry => ({ ...entry, label: `${entry.label}精通` })) ?? []),
    ...(resistance?.entries.filter(entry => entry.label === name).map(entry => ({ ...entry, label: `${entry.label}抗性` })) ?? [])
  ]);
  return [
    props.groups.find(item => item.id === 'base') ?? { id: 'base', label: '六维', entries: [] },
    props.groups.find(item => item.id === 'attributes') ?? { id: 'attributes', label: '属性', entries: [] },
    { id: 'elements', label: '元素', entries: elements }
  ];
});
const group = computed<CharacterInfoGroup>(() => tabs.value.find(item => item.id === selected.value) ?? tabs.value[0] ?? { id: 'base', label: '六维', entries: [] });
const profileLayoutStyle = computed(() => {
  const height = profileSize.value.height || Math.max(260, window.innerHeight - 200);
  const width = profileSize.value.width || window.innerWidth;
  const compact = height < 320, narrow = width < 600;
  const font = compact ? 9 : height < 450 ? 10 : 13;
  const tabHeight = compact ? 18 : height < 450 ? 25 : 30;
  const padding = compact ? 3 : height < 450 ? 4 : 6;
  const maximumRows = Math.max(3, ...tabs.value.map(item => Math.ceil(item.entries.length / 2)));
  const paperMinimum = maximumRows * (font + 1) + tabHeight + padding * 2;
  const identityFont = compact ? 9 : height < 450 ? 10 : 12;
  const minimumHero = (narrow ? 10 : 5) * (identityFont + 1.5) + (compact ? 26 : 30);
  const hero = Math.max(minimumHero, Math.min(height * .5, height - paperMinimum));
  const rows = Math.max(1, Math.ceil(group.value.entries.length / 2));
  const rowHeight = Math.max(font + 1, Math.min(font + 7, Math.max(1, height - hero - tabHeight - padding * 2) / rows));
  return {
    '--profile-hero-height': `${hero}px`, '--profile-entry-font': `${font}px`, '--profile-entry-line': `${font + 1}px`,
    '--profile-row-height': `${rowHeight}px`, '--profile-tab-height': `${tabHeight}px`,
    '--profile-paper-padding-y': `${padding}px`, '--profile-identity-font': `${identityFont}px`,
    '--profile-identity-columns': narrow ? '1' : '2', '--profile-identity-rows': narrow ? '10' : '5'
  };
});
const identityLabels: Record<string, string> = { gameId: 'Game ID', region: '区域', position: '坐标', buffs: '增益' };
const compactIdentityLabel = (entry: CharacterInfoEntry) => identityLabels[entry.key] ?? entry.label;
const compactAttributeLabel = (entry: CharacterInfoEntry) => entry.label.replace(/^额外\s*·\s*/, '');
watch(selected, () => { help.value = null; });
</script>

<template>
  <section ref="profilePanel" class="profile-viewport-panel" :data-profile-tab="selected" :style="profileLayoutStyle" aria-label="角色资料与属性">
    <header class="profile-viewport-hero">
      <CharacterPortrait class="profile-viewport-portrait character-profile-portrait" variant="profile" :portrait="portrait" :equipment="equipment" alt="当前角色立绘" />
      <section class="profile-viewport-identity" aria-label="个人信息">
        <button type="button" class="profile-viewport-identity-heading" aria-label="查看角色身份完整资料" @click="help = { key: 'identity-summary', label: '角色身份', value: identitySummary }"><h1>{{ summary?.name ?? '待登记旅人' }}</h1><p>{{ summary?.profession ?? '尚未选择职业' }} · Lv.{{ summary?.level ?? 1 }}</p></button>
        <div class="profile-viewport-identity-fields"><button v-for="entry in identity.entries" :key="entry.key" type="button" :data-identity-key="entry.key" :class="{ 'is-resource': ['hp', 'mp', 'stamina'].includes(entry.key) }" :aria-label="`${entry.label} ${entry.value}，查看完整信息`" @click="help = entry"><span>{{ compactIdentityLabel(entry) }}</span><strong>{{ entry.value }}</strong><i v-if="['hp', 'mp', 'stamina'].includes(entry.key)" :class="`resource-${entry.key}`" aria-hidden="true"><b :style="{ width: `${identityResourcePercent(entry.key)}%` }" /></i></button></div>
      </section>
    </header>
    <div class="profile-viewport-paper">
    <nav class="profile-viewport-tabs" role="tablist" aria-label="角色资料分类"><button v-for="item in tabs" :key="item.id" type="button" role="tab" :aria-selected="selected === item.id" :class="{ active: selected === item.id }" @click="selected = item.id">{{ item.label }}</button></nav>
    <div class="profile-viewport-list" role="tabpanel" :aria-label="group.label">
      <button v-for="entry in group.entries" :key="entry.key" type="button" class="profile-viewport-entry" :data-attribute-key="entry.key" :aria-label="`${entry.label} ${entry.value}，查看完整信息`" @click="help = entry"><span>{{ compactAttributeLabel(entry) }}</span><strong>{{ entry.value }}</strong></button>
      <p v-if="!group.entries.length" class="profile-viewport-empty">暂无额外属性。</p>
    </div>
    </div>
    <Teleport to="body"><div v-if="help" class="profile-viewport-backdrop" role="presentation" @click.self="help = null"><section class="profile-viewport-help" role="dialog" aria-modal="true" :aria-label="`${help.label}说明`" @keydown.esc="help = null"><header><h2>{{ help.label }}</h2><button type="button" aria-label="关闭属性说明" @click="help = null">×</button></header><div><strong v-if="help.value !== ''">{{ help.value }}</strong><p v-if="help.help">{{ help.help }}</p></div></section></div></Teleport>
  </section>
</template>

<style scoped>
.profile-viewport-panel{height:100%;min-height:0;min-width:0;display:grid;grid-template-rows:minmax(0,65fr) minmax(150px,35fr);gap:0;box-sizing:border-box;padding:0;border:0;background:transparent;color:#493e36;overflow:hidden}
.profile-viewport-paper{display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;gap:7px;min-height:0;min-width:0;box-sizing:border-box;padding:9px;border:1px solid #c9ae86;border-radius:7px;background:#fff7e8cc;overflow:hidden}
.profile-viewport-hero{position:relative;display:grid;grid-template-columns:minmax(0,47fr) minmax(0,53fr);grid-template-rows:minmax(0,1fr);gap:5px;min-height:0;min-width:0;overflow:hidden;background:transparent}
.profile-viewport-hero>div{min-width:0}.profile-viewport-hero h1{font:700 clamp(18px,3vw,28px)/1.2 'KaiTi','STKaiti',serif;margin:3px 0}.profile-viewport-hero p{margin:5px 0;font-size:13px;overflow-wrap:anywhere}.profile-viewport-hero small{font-size:11px;color:#8d765c}
.profile-viewport-identity{position:relative;z-index:2;grid-column:2;align-self:start;display:grid;grid-template-rows:auto minmax(0,1fr);gap:3px;box-sizing:border-box;width:100%;height:min(100%,330px);min-width:0;min-height:0;padding:7px 9px;overflow:hidden;text-align:left;color:inherit;border:1px solid #c9ae86;background:#fff7e8cc;border-radius:6px;font:inherit}
.profile-viewport-panel .profile-viewport-identity-heading{display:block;min-width:0;min-height:0;margin:0;padding:0;border:0;border-radius:0;background:none;box-shadow:none;color:inherit;text-align:left;font:inherit}.profile-viewport-identity h1,.profile-viewport-identity p{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.profile-viewport-identity h1{font-size:clamp(17px,2.2vw,25px);margin:0}.profile-viewport-identity p{font-size:11px;margin:3px 0}
.profile-viewport-identity-fields{display:grid;grid-template-rows:repeat(10,minmax(0,1fr));gap:0;min-height:0;min-width:0}.profile-viewport-panel .profile-viewport-identity-fields>button{position:relative;display:grid;grid-template-columns:minmax(0,43%) minmax(0,1fr);align-items:center;gap:3px;min-height:0;min-width:0;margin:0;padding:2px 0;border:0;border-bottom:1px solid #c7b69b70;border-radius:0;background:none;box-shadow:none;color:inherit;font:inherit;text-align:left}.profile-viewport-identity-fields>button>span,.profile-viewport-identity-fields>button>strong{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px;line-height:1.25}.profile-viewport-identity-fields>button>strong{text-align:right}.profile-viewport-identity-fields i{position:absolute;right:0;bottom:0;width:55%;height:3px;overflow:hidden;border-radius:3px;background:#d8cbb8}.profile-viewport-identity-fields i b{display:block;height:100%;background:#ef6156}.profile-viewport-identity-fields .resource-mp b{background:#3daef6}.profile-viewport-identity-fields .resource-stamina b{background:#58c695}
.profile-viewport-portrait{height:100%;min-height:0;overflow:hidden}.profile-viewport-portrait :deep(.character-portrait-stage){height:100%;width:100%;min-height:0;aspect-ratio:auto;background:transparent;box-shadow:none;border-radius:0}.profile-viewport-portrait :deep(.character-portrait-loadout),.profile-viewport-portrait :deep(.character-portrait-empty){display:none}
.profile-viewport-panel .profile-viewport-hero>.profile-viewport-portrait.character-profile-portrait{display:block;position:relative;grid-column:1;inset:auto;container-type:size;width:100%;height:100%;min-width:0;min-height:0;margin:0;padding:0;overflow:hidden;pointer-events:none}
.profile-viewport-panel .profile-viewport-hero .profile-viewport-portrait :deep(.character-portrait-stage){width:100%;height:100%;min-height:0;max-height:100%;aspect-ratio:auto;margin:0;padding:0;background:transparent;border:0;border-radius:0;box-shadow:none}
.profile-viewport-tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:3px}.profile-viewport-tabs button{min-width:0;min-height:34px;padding:5px 2px;font-size:12px;border:1px solid #c8af88;background:#f2e6ce;color:#765e45;border-radius:5px}.profile-viewport-tabs button.active{background:#198b91;color:#fff9e9;border-color:#21777b}
.profile-viewport-heading{display:flex;align-items:center;gap:8px;min-height:22px}.profile-viewport-heading h2{font-size:14px;margin:0}.profile-viewport-heading button{border:1px solid #c4a985;border-radius:50%;width:22px;height:22px;background:#fff7e5;color:#796143}
.profile-viewport-panel .profile-viewport-paper :deep(.viewport-pagination){min-height:32px;padding:0;border:0;border-image:none;background:transparent;box-shadow:none}.profile-viewport-panel .profile-viewport-paper :deep(.viewport-pagination :is(button,select)){min-height:28px;padding:2px 6px;font-size:11px}
.profile-viewport-panel .profile-viewport-paper :deep(.viewport-pagination label){margin:0;padding:0}
.profile-viewport-list{min-height:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:48px;align-content:start;gap:6px;overflow:hidden}.profile-viewport-entry{min-width:0;min-height:0;height:100%;display:flex;align-items:center;justify-content:space-between;gap:5px;padding:7px 8px;border:1px solid #dbc7a7;background:#fffaf0;color:inherit;border-radius:4px;font:inherit;text-align:left}.profile-viewport-entry>span{min-width:0;font-size:12px;flex:1}.profile-viewport-entry i{font-style:normal;border:1px solid #c7b28e;border-radius:50%;display:inline-grid;place-items:center;width:16px;height:16px;margin-left:4px;font-size:11px;color:#897252}.profile-viewport-entry strong{max-width:56%;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px;text-align:right}.profile-viewport-empty{grid-column:1/-1;color:#8b7b68;font-size:12px}
.profile-viewport-backdrop{position:fixed;inset:0;z-index:160;display:grid;place-items:center;background:#1f29398c;padding:16px}.profile-viewport-help{width:min(480px,100%);max-height:85dvh;display:flex;flex-direction:column;min-height:0;background:#fff8e8;border:3px solid #c9ad82;border-radius:10px;color:#493c31}.profile-viewport-help header{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px;border-bottom:1px solid #d7c19d}.profile-viewport-help h2{font-size:18px;margin:0}.profile-viewport-help header button{min-width:34px;min-height:34px;border:0;background:#f0e1c7;color:inherit;font-size:24px}.profile-viewport-help>div{overflow:auto;min-height:0;padding:14px;overflow-wrap:anywhere}.profile-viewport-help p{font-size:14px;line-height:1.7;margin:10px 0}.profile-viewport-panel button{cursor:pointer}.profile-viewport-panel button:focus-visible{outline:3px solid #32a7ac;outline-offset:1px}
@media(min-width:760px){.profile-viewport-identity{height:min(100%,290px)}.profile-viewport-identity-fields{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(5,minmax(0,1fr));column-gap:12px}.profile-viewport-identity-fields>button>span,.profile-viewport-identity-fields>button>strong{font-size:12px}}
@media(max-height:580px){.profile-viewport-paper{padding:5px;gap:4px}.profile-viewport-identity h1{font-size:17px}.profile-viewport-identity p{font-size:10px;margin:2px 0}.profile-viewport-identity{padding:4px 6px}.profile-viewport-identity-fields>button>span,.profile-viewport-identity-fields>button>strong{font-size:10px}.profile-viewport-tabs button{min-height:29px;font-size:11px}.profile-viewport-heading{min-height:18px}.profile-viewport-list{grid-auto-rows:44px}.profile-viewport-entry{padding:5px 7px}}
@media(max-height:450px){.profile-viewport-panel{grid-template-rows:minmax(0,65fr) minmax(124px,35fr)}.profile-viewport-paper{padding:4px;gap:3px}.profile-viewport-tabs button{min-height:25px;padding:2px}.profile-viewport-list{grid-auto-rows:32px}.profile-viewport-entry{padding:3px 6px}.profile-viewport-entry>span{font-size:11px}.profile-viewport-entry strong{font-size:12px}.profile-viewport-panel .profile-viewport-paper :deep(.viewport-pagination){min-height:26px}.profile-viewport-panel .profile-viewport-paper :deep(.viewport-pagination :is(button,select)){min-height:24px}}
@media(min-width:760px) and (max-height:580px){.profile-viewport-panel .profile-viewport-identity-heading{display:flex;align-items:baseline;gap:8px}.profile-viewport-identity-heading h1{min-width:0;flex:1}.profile-viewport-identity-heading p{flex:none;max-width:50%}}
</style>
