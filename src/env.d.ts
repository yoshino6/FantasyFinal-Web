/// <reference types="vite/client" />

declare const __FF_BOOT_ASSET_REVISION__: string;
declare const __FF_BOOT_ASSETS__: ReadonlyArray<{ path: string; hash: string; bytes: number }>;

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, any>;
  export default component;
}
