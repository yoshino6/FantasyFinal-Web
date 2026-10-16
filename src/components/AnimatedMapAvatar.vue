<script setup lang="ts">
import {computed,onBeforeUnmount,onMounted,ref,watch} from 'vue';
import type {PanelPortrait} from '../api';
import {mapAvatarAtlas,mapTargetArt,mapTargetSpriteStyle} from '../exploration-assets';
const props=withDefaults(defineProps<{portrait?:PanelPortrait;identityKey?:string;running?:boolean;direction?:'up'|'down'|'left'|'right';movementSpeed?:number;label?:string;grounded?:boolean}>(),{running:false,label:'冒险者',grounded:false});
const emit=defineEmits<{(event:'frame-change',frame:number):void}>();
const atlas=computed(()=>mapAvatarAtlas(props.portrait));
const fallback=computed(()=>mapTargetArt({type:'玩家'}).src);
const fallbackStyle=computed(()=>props.grounded?mapTargetSpriteStyle({type:'玩家'}):undefined);
const frame=ref(0), reduced=ref(false);
watch(frame,value=>emit('frame-change',value),{immediate:true});
const facing=ref(props.direction??'down');
let hasRun=props.running;
watch([()=>atlas.value.key,()=>props.identityKey],()=>{facing.value=props.direction??'down';hasRun=props.running;});
watch([()=>props.direction,()=>props.running],([direction,running])=>{if(running){hasRun=true;if(direction)facing.value=direction;}else if(!hasRun&&direction)facing.value=direction;});
const mirrored=computed(()=>atlas.value.nativeLeftFrames.includes(frame.value)!==(facing.value==='left'));
// Keep the gait phase across turns and speed changes. Only the beginning/end
// of a run (or changing the portrait) resets its phase.
const frameRate=computed(()=>props.movementSpeed===undefined||!Number.isFinite(props.movementSpeed)?1000/110:Math.max(0,props.movementSpeed)*2.5);
let animation:number|undefined,media:MediaQueryList|undefined,phase=0,lastTime=0;
function stop(){if(animation!==undefined)cancelAnimationFrame(animation);animation=undefined;phase=0;lastTime=0;frame.value=atlas.value.idleFrame;}
function tick(time:number){
  phase+=(time-lastTime)*frameRate.value/1000;lastTime=time;
  const frames=atlas.value.runFrames;
  frame.value=frameRate.value>0?(frames[Math.floor(phase)%frames.length]??atlas.value.idleFrame):atlas.value.idleFrame;
  animation=requestAnimationFrame(tick);
}
function sync(){stop();if(props.running&&!reduced.value&&atlas.value.src){frame.value=atlas.value.runFrames[0]??0;lastTime=performance.now();animation=requestAnimationFrame(tick);}}
const frameX=computed(()=>-(frame.value%atlas.value.columns)*256);
const frameY=computed(()=>-Math.floor(frame.value/atlas.value.columns)*320);
const onMotion=()=>{reduced.value=media?.matches??false;sync();};
watch([()=>props.running,()=>atlas.value.src,()=>props.identityKey],sync);
onMounted(()=>{media=window.matchMedia('(prefers-reduced-motion: reduce)');media.addEventListener('change',onMotion);onMotion();});
onBeforeUnmount(()=>{stop();media?.removeEventListener('change',onMotion);});
</script>
<template><span class="animated-map-avatar" role="img" :aria-label="label" :data-avatar-key="atlas.key" :data-running="running&&!reduced&&!!atlas.src&&frameRate>0" :data-direction="facing" :data-frame="frame" :data-frame-rate="frameRate" :data-mirrored="mirrored" :class="{'is-left':mirrored,'is-unreleased':!atlas.src,'is-grounded':grounded}"><svg v-if="atlas.src" class="avatar-sprite" viewBox="0 0 256 320" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><image :href="atlas.src" :x="frameX" :y="frameY" :width="atlas.columns*256" :height="atlas.rows*320" /></svg><img v-else-if="fallback" class="avatar-fallback" :style="fallbackStyle" :src="fallback" alt="" /></span></template>
<style scoped>
.animated-map-avatar{display:inline-block;width:64px;aspect-ratio:4/5;flex:none;background-repeat:no-repeat;transform-origin:50% 93%;filter:drop-shadow(0 3px 2px #29412c45);vertical-align:bottom}
.animated-map-avatar.is-left{transform:scaleX(-1)}
.animated-map-avatar:where(.is-grounded){position:relative}
.avatar-sprite{display:block;width:100%;height:100%;overflow:hidden}
.avatar-fallback{width:100%;height:100%;object-fit:contain}
.is-grounded>.avatar-fallback{position:absolute}
@media(prefers-reduced-motion:reduce){.animated-map-avatar{transition:none}}
</style>
