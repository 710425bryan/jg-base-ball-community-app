/// <reference types="C:/Users/BryanChen/.gemini/antigravity/scratch/jg-base-ball-community-app/node_modules/.pnpm/@vue+language-core@3.2.5/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/BryanChen/.gemini/antigravity/scratch/jg-base-ball-community-app/node_modules/.pnpm/@vue+language-core@3.2.5/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { onMounted } from 'vue';
import { useAuthStore } from '@/stores/auth';
const authStore = useAuthStore();
onMounted(async () => {
    await authStore.initializeAuth();
});
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
if (__VLS_ctx.authStore.isInitializing) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "min-h-screen bg-background flex flex-col items-center justify-center safe-area-padding" },
    });
    /** @type {__VLS_StyleScopedClasses['min-h-screen']} */ ;
    /** @type {__VLS_StyleScopedClasses['bg-background']} */ ;
    /** @type {__VLS_StyleScopedClasses['flex']} */ ;
    /** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
    /** @type {__VLS_StyleScopedClasses['items-center']} */ ;
    /** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
    /** @type {__VLS_StyleScopedClasses['safe-area-padding']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "animate-pulse flex flex-col items-center" },
    });
    /** @type {__VLS_StyleScopedClasses['animate-pulse']} */ ;
    /** @type {__VLS_StyleScopedClasses['flex']} */ ;
    /** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
    /** @type {__VLS_StyleScopedClasses['items-center']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" },
    });
    /** @type {__VLS_StyleScopedClasses['w-12']} */ ;
    /** @type {__VLS_StyleScopedClasses['h-12']} */ ;
    /** @type {__VLS_StyleScopedClasses['border-4']} */ ;
    /** @type {__VLS_StyleScopedClasses['border-primary']} */ ;
    /** @type {__VLS_StyleScopedClasses['border-t-transparent']} */ ;
    /** @type {__VLS_StyleScopedClasses['rounded-full']} */ ;
    /** @type {__VLS_StyleScopedClasses['animate-spin']} */ ;
    /** @type {__VLS_StyleScopedClasses['mb-4']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "text-text-muted font-medium" },
    });
    /** @type {__VLS_StyleScopedClasses['text-text-muted']} */ ;
    /** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
}
else {
    let __VLS_0;
    /** @ts-ignore @type {typeof __VLS_components.routerView | typeof __VLS_components.RouterView} */
    routerView;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({}));
    const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
    var __VLS_5 = {};
    var __VLS_3;
}
// @ts-ignore
[authStore,];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
