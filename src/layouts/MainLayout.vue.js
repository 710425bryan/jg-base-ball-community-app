/// <reference types="C:/Users/BryanChen/.gemini/antigravity/scratch/jg-base-ball-community-app/node_modules/.pnpm/@vue+language-core@3.2.5/node_modules/@vue/language-core/types/template-helpers.d.ts" />
/// <reference types="C:/Users/BryanChen/.gemini/antigravity/scratch/jg-base-ball-community-app/node_modules/.pnpm/@vue+language-core@3.2.5/node_modules/@vue/language-core/types/props-fallback.d.ts" />
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
const router = useRouter();
const authStore = useAuthStore();
const isMobileMenuOpen = ref(false);
const handleSignOut = async () => {
    isMobileMenuOpen.value = false;
    await authStore.signOut();
    router.push('/login');
};
const __VLS_ctx = {
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['router-link-active']} */ ;
/** @type {__VLS_StyleScopedClasses['router-link-active']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "min-h-screen bg-background text-text flex flex-col relative w-full h-full" },
});
/** @type {__VLS_StyleScopedClasses['min-h-screen']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-background']} */ ;
/** @type {__VLS_StyleScopedClasses['text-text']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['h-full']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({
    ...{ class: "h-14 bg-white text-text sticky top-0 z-50 shadow-sm border-b border-gray-100 pt-[env(safe-area-inset-top)]" },
});
/** @type {__VLS_StyleScopedClasses['h-14']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['text-text']} */ ;
/** @type {__VLS_StyleScopedClasses['sticky']} */ ;
/** @type {__VLS_StyleScopedClasses['top-0']} */ ;
/** @type {__VLS_StyleScopedClasses['z-50']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['border-b']} */ ;
/** @type {__VLS_StyleScopedClasses['border-gray-100']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-[env(safe-area-inset-top)]']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "h-full flex items-center px-4 max-w-7xl mx-auto w-full" },
});
/** @type {__VLS_StyleScopedClasses['h-full']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['px-4']} */ ;
/** @type {__VLS_StyleScopedClasses['max-w-7xl']} */ ;
/** @type {__VLS_StyleScopedClasses['mx-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "font-extrabold text-xl tracking-wide text-primary flex items-center gap-2 shrink-0 md:w-48" },
});
/** @type {__VLS_StyleScopedClasses['font-extrabold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xl']} */ ;
/** @type {__VLS_StyleScopedClasses['tracking-wide']} */ ;
/** @type {__VLS_StyleScopedClasses['text-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
/** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
/** @type {__VLS_StyleScopedClasses['md:w-48']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
    xmlns: "http://www.w3.org/2000/svg",
    ...{ class: "h-6 w-6 text-primary" },
    viewBox: "0 0 24 24",
    fill: "currentColor",
});
/** @type {__VLS_StyleScopedClasses['h-6']} */ ;
/** @type {__VLS_StyleScopedClasses['w-6']} */ ;
/** @type {__VLS_StyleScopedClasses['text-primary']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.circle)({
    cx: "12",
    cy: "12",
    r: "10",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.path)({
    d: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z",
    fill: "white",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.path)({
    d: "M7.5 12c0-1.5.5-2.8 1.3-3.9M16.5 12c0-1.5-.5-2.8-1.3-3.9",
    stroke: "white",
    'stroke-width': "1.5",
    'stroke-linecap': "round",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "flex-1 flex justify-center" },
});
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.nav, __VLS_intrinsics.nav)({
    ...{ class: "hidden md:flex space-x-8" },
});
/** @type {__VLS_StyleScopedClasses['hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['md:flex']} */ ;
/** @type {__VLS_StyleScopedClasses['space-x-8']} */ ;
let __VLS_0;
/** @ts-ignore @type {typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink} */
routerLink;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
    to: "/home",
    ...{ class: "hover:text-primary transition-colors font-medium text-gray-600" },
}));
const __VLS_2 = __VLS_1({
    to: "/home",
    ...{ class: "hover:text-primary transition-colors font-medium text-gray-600" },
}, ...__VLS_functionalComponentArgsRest(__VLS_1));
/** @type {__VLS_StyleScopedClasses['hover:text-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
/** @type {__VLS_StyleScopedClasses['text-gray-600']} */ ;
const { default: __VLS_5 } = __VLS_3.slots;
var __VLS_3;
let __VLS_6;
/** @ts-ignore @type {typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink} */
routerLink;
// @ts-ignore
const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
    to: "/calendar",
    ...{ class: "hover:text-primary transition-colors font-medium text-gray-600" },
}));
const __VLS_8 = __VLS_7({
    to: "/calendar",
    ...{ class: "hover:text-primary transition-colors font-medium text-gray-600" },
}, ...__VLS_functionalComponentArgsRest(__VLS_7));
/** @type {__VLS_StyleScopedClasses['hover:text-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
/** @type {__VLS_StyleScopedClasses['text-gray-600']} */ ;
const { default: __VLS_11 } = __VLS_9.slots;
var __VLS_9;
let __VLS_12;
/** @ts-ignore @type {typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink} */
routerLink;
// @ts-ignore
const __VLS_13 = __VLS_asFunctionalComponent1(__VLS_12, new __VLS_12({
    to: "/leave-requests",
    ...{ class: "hover:text-primary transition-colors font-medium text-gray-600" },
}));
const __VLS_14 = __VLS_13({
    to: "/leave-requests",
    ...{ class: "hover:text-primary transition-colors font-medium text-gray-600" },
}, ...__VLS_functionalComponentArgsRest(__VLS_13));
/** @type {__VLS_StyleScopedClasses['hover:text-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
/** @type {__VLS_StyleScopedClasses['text-gray-600']} */ ;
const { default: __VLS_17 } = __VLS_15.slots;
var __VLS_15;
let __VLS_18;
/** @ts-ignore @type {typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink} */
routerLink;
// @ts-ignore
const __VLS_19 = __VLS_asFunctionalComponent1(__VLS_18, new __VLS_18({
    to: "/players",
    ...{ class: "hover:text-primary transition-colors font-medium text-gray-600" },
}));
const __VLS_20 = __VLS_19({
    to: "/players",
    ...{ class: "hover:text-primary transition-colors font-medium text-gray-600" },
}, ...__VLS_functionalComponentArgsRest(__VLS_19));
/** @type {__VLS_StyleScopedClasses['hover:text-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
/** @type {__VLS_StyleScopedClasses['text-gray-600']} */ ;
const { default: __VLS_23 } = __VLS_21.slots;
var __VLS_21;
let __VLS_24;
/** @ts-ignore @type {typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink} */
routerLink;
// @ts-ignore
const __VLS_25 = __VLS_asFunctionalComponent1(__VLS_24, new __VLS_24({
    to: "/users",
    ...{ class: "hover:text-primary transition-colors font-medium text-gray-600" },
}));
const __VLS_26 = __VLS_25({
    to: "/users",
    ...{ class: "hover:text-primary transition-colors font-medium text-gray-600" },
}, ...__VLS_functionalComponentArgsRest(__VLS_25));
/** @type {__VLS_StyleScopedClasses['hover:text-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
/** @type {__VLS_StyleScopedClasses['text-gray-600']} */ ;
const { default: __VLS_29 } = __VLS_27.slots;
var __VLS_27;
__VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
    ...{ class: "shrink-0 flex items-center justify-end md:w-48" },
});
/** @type {__VLS_StyleScopedClasses['shrink-0']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-end']} */ ;
/** @type {__VLS_StyleScopedClasses['md:w-48']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (__VLS_ctx.handleSignOut) },
    ...{ class: "hidden md:flex items-center gap-1.5 text-gray-400 hover:text-red-500 font-bold transition-colors text-sm px-3 py-1.5 rounded-lg hover:bg-red-50" },
});
/** @type {__VLS_StyleScopedClasses['hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['md:flex']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['gap-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['text-gray-400']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:text-red-500']} */ ;
/** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['text-sm']} */ ;
/** @type {__VLS_StyleScopedClasses['px-3']} */ ;
/** @type {__VLS_StyleScopedClasses['py-1.5']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:bg-red-50']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
    xmlns: "http://www.w3.org/2000/svg",
    ...{ class: "h-4 w-4" },
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
});
/** @type {__VLS_StyleScopedClasses['h-4']} */ ;
/** @type {__VLS_StyleScopedClasses['w-4']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.path)({
    'stroke-linecap': "round",
    'stroke-linejoin': "round",
    'stroke-width': "2",
    d: "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
    ...{ onClick: (...[$event]) => {
            __VLS_ctx.isMobileMenuOpen = !__VLS_ctx.isMobileMenuOpen;
            // @ts-ignore
            [handleSignOut, isMobileMenuOpen, isMobileMenuOpen,];
        } },
    ...{ class: "p-1 md:hidden text-gray-600 hover:text-primary transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-opacity-50 rounded-lg" },
});
/** @type {__VLS_StyleScopedClasses['p-1']} */ ;
/** @type {__VLS_StyleScopedClasses['md:hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['text-gray-600']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:text-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
/** @type {__VLS_StyleScopedClasses['focus:outline-none']} */ ;
/** @type {__VLS_StyleScopedClasses['focus:ring-2']} */ ;
/** @type {__VLS_StyleScopedClasses['focus:ring-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['focus:ring-opacity-50']} */ ;
/** @type {__VLS_StyleScopedClasses['rounded-lg']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
    xmlns: "http://www.w3.org/2000/svg",
    ...{ class: "h-7 w-7" },
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
});
/** @type {__VLS_StyleScopedClasses['h-7']} */ ;
/** @type {__VLS_StyleScopedClasses['w-7']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.path)({
    'stroke-linecap': "round",
    'stroke-linejoin': "round",
    'stroke-width': "2",
    d: "M4 6h16M4 12h16M4 18h16",
});
if (__VLS_ctx.isMobileMenuOpen) {
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "md:hidden absolute top-14 left-0 w-full bg-white shadow-lg border-t border-gray-100 z-40 mt-[env(safe-area-inset-top)] animate-fade-in-down" },
    });
    /** @type {__VLS_StyleScopedClasses['md:hidden']} */ ;
    /** @type {__VLS_StyleScopedClasses['absolute']} */ ;
    /** @type {__VLS_StyleScopedClasses['top-14']} */ ;
    /** @type {__VLS_StyleScopedClasses['left-0']} */ ;
    /** @type {__VLS_StyleScopedClasses['w-full']} */ ;
    /** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
    /** @type {__VLS_StyleScopedClasses['shadow-lg']} */ ;
    /** @type {__VLS_StyleScopedClasses['border-t']} */ ;
    /** @type {__VLS_StyleScopedClasses['border-gray-100']} */ ;
    /** @type {__VLS_StyleScopedClasses['z-40']} */ ;
    /** @type {__VLS_StyleScopedClasses['mt-[env(safe-area-inset-top)]']} */ ;
    /** @type {__VLS_StyleScopedClasses['animate-fade-in-down']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.nav, __VLS_intrinsics.nav)({
        ...{ class: "flex flex-col py-2" },
    });
    /** @type {__VLS_StyleScopedClasses['flex']} */ ;
    /** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
    /** @type {__VLS_StyleScopedClasses['py-2']} */ ;
    let __VLS_30;
    /** @ts-ignore @type {typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink} */
    routerLink;
    // @ts-ignore
    const __VLS_31 = __VLS_asFunctionalComponent1(__VLS_30, new __VLS_30({
        ...{ 'onClick': {} },
        to: "/home",
        ...{ class: "px-6 py-4 border-b border-gray-50 text-text hover:bg-surface font-medium" },
    }));
    const __VLS_32 = __VLS_31({
        ...{ 'onClick': {} },
        to: "/home",
        ...{ class: "px-6 py-4 border-b border-gray-50 text-text hover:bg-surface font-medium" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_31));
    let __VLS_35;
    const __VLS_36 = ({ click: {} },
        { onClick: (...[$event]) => {
                if (!(__VLS_ctx.isMobileMenuOpen))
                    return;
                __VLS_ctx.isMobileMenuOpen = false;
                // @ts-ignore
                [isMobileMenuOpen, isMobileMenuOpen,];
            } });
    /** @type {__VLS_StyleScopedClasses['px-6']} */ ;
    /** @type {__VLS_StyleScopedClasses['py-4']} */ ;
    /** @type {__VLS_StyleScopedClasses['border-b']} */ ;
    /** @type {__VLS_StyleScopedClasses['border-gray-50']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-text']} */ ;
    /** @type {__VLS_StyleScopedClasses['hover:bg-surface']} */ ;
    /** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
    const { default: __VLS_37 } = __VLS_33.slots;
    // @ts-ignore
    [];
    var __VLS_33;
    var __VLS_34;
    let __VLS_38;
    /** @ts-ignore @type {typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink} */
    routerLink;
    // @ts-ignore
    const __VLS_39 = __VLS_asFunctionalComponent1(__VLS_38, new __VLS_38({
        ...{ 'onClick': {} },
        to: "/calendar",
        ...{ class: "px-6 py-4 border-b border-gray-50 text-text hover:bg-surface font-medium" },
    }));
    const __VLS_40 = __VLS_39({
        ...{ 'onClick': {} },
        to: "/calendar",
        ...{ class: "px-6 py-4 border-b border-gray-50 text-text hover:bg-surface font-medium" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_39));
    let __VLS_43;
    const __VLS_44 = ({ click: {} },
        { onClick: (...[$event]) => {
                if (!(__VLS_ctx.isMobileMenuOpen))
                    return;
                __VLS_ctx.isMobileMenuOpen = false;
                // @ts-ignore
                [isMobileMenuOpen,];
            } });
    /** @type {__VLS_StyleScopedClasses['px-6']} */ ;
    /** @type {__VLS_StyleScopedClasses['py-4']} */ ;
    /** @type {__VLS_StyleScopedClasses['border-b']} */ ;
    /** @type {__VLS_StyleScopedClasses['border-gray-50']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-text']} */ ;
    /** @type {__VLS_StyleScopedClasses['hover:bg-surface']} */ ;
    /** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
    const { default: __VLS_45 } = __VLS_41.slots;
    // @ts-ignore
    [];
    var __VLS_41;
    var __VLS_42;
    let __VLS_46;
    /** @ts-ignore @type {typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink} */
    routerLink;
    // @ts-ignore
    const __VLS_47 = __VLS_asFunctionalComponent1(__VLS_46, new __VLS_46({
        ...{ 'onClick': {} },
        to: "/leave-requests",
        ...{ class: "px-6 py-4 border-b border-gray-50 text-text hover:bg-surface font-medium" },
    }));
    const __VLS_48 = __VLS_47({
        ...{ 'onClick': {} },
        to: "/leave-requests",
        ...{ class: "px-6 py-4 border-b border-gray-50 text-text hover:bg-surface font-medium" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_47));
    let __VLS_51;
    const __VLS_52 = ({ click: {} },
        { onClick: (...[$event]) => {
                if (!(__VLS_ctx.isMobileMenuOpen))
                    return;
                __VLS_ctx.isMobileMenuOpen = false;
                // @ts-ignore
                [isMobileMenuOpen,];
            } });
    /** @type {__VLS_StyleScopedClasses['px-6']} */ ;
    /** @type {__VLS_StyleScopedClasses['py-4']} */ ;
    /** @type {__VLS_StyleScopedClasses['border-b']} */ ;
    /** @type {__VLS_StyleScopedClasses['border-gray-50']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-text']} */ ;
    /** @type {__VLS_StyleScopedClasses['hover:bg-surface']} */ ;
    /** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
    const { default: __VLS_53 } = __VLS_49.slots;
    // @ts-ignore
    [];
    var __VLS_49;
    var __VLS_50;
    let __VLS_54;
    /** @ts-ignore @type {typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink} */
    routerLink;
    // @ts-ignore
    const __VLS_55 = __VLS_asFunctionalComponent1(__VLS_54, new __VLS_54({
        ...{ 'onClick': {} },
        to: "/players",
        ...{ class: "px-6 py-4 border-b border-gray-50 text-text hover:bg-surface font-medium" },
    }));
    const __VLS_56 = __VLS_55({
        ...{ 'onClick': {} },
        to: "/players",
        ...{ class: "px-6 py-4 border-b border-gray-50 text-text hover:bg-surface font-medium" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_55));
    let __VLS_59;
    const __VLS_60 = ({ click: {} },
        { onClick: (...[$event]) => {
                if (!(__VLS_ctx.isMobileMenuOpen))
                    return;
                __VLS_ctx.isMobileMenuOpen = false;
                // @ts-ignore
                [isMobileMenuOpen,];
            } });
    /** @type {__VLS_StyleScopedClasses['px-6']} */ ;
    /** @type {__VLS_StyleScopedClasses['py-4']} */ ;
    /** @type {__VLS_StyleScopedClasses['border-b']} */ ;
    /** @type {__VLS_StyleScopedClasses['border-gray-50']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-text']} */ ;
    /** @type {__VLS_StyleScopedClasses['hover:bg-surface']} */ ;
    /** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
    const { default: __VLS_61 } = __VLS_57.slots;
    // @ts-ignore
    [];
    var __VLS_57;
    var __VLS_58;
    let __VLS_62;
    /** @ts-ignore @type {typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink} */
    routerLink;
    // @ts-ignore
    const __VLS_63 = __VLS_asFunctionalComponent1(__VLS_62, new __VLS_62({
        ...{ 'onClick': {} },
        to: "/users",
        ...{ class: "px-6 py-4 border-b border-gray-50 text-text hover:bg-surface font-medium" },
    }));
    const __VLS_64 = __VLS_63({
        ...{ 'onClick': {} },
        to: "/users",
        ...{ class: "px-6 py-4 border-b border-gray-50 text-text hover:bg-surface font-medium" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_63));
    let __VLS_67;
    const __VLS_68 = ({ click: {} },
        { onClick: (...[$event]) => {
                if (!(__VLS_ctx.isMobileMenuOpen))
                    return;
                __VLS_ctx.isMobileMenuOpen = false;
                // @ts-ignore
                [isMobileMenuOpen,];
            } });
    /** @type {__VLS_StyleScopedClasses['px-6']} */ ;
    /** @type {__VLS_StyleScopedClasses['py-4']} */ ;
    /** @type {__VLS_StyleScopedClasses['border-b']} */ ;
    /** @type {__VLS_StyleScopedClasses['border-gray-50']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-text']} */ ;
    /** @type {__VLS_StyleScopedClasses['hover:bg-surface']} */ ;
    /** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
    const { default: __VLS_69 } = __VLS_65.slots;
    // @ts-ignore
    [];
    var __VLS_65;
    var __VLS_66;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (__VLS_ctx.handleSignOut) },
        ...{ class: "text-left px-6 py-4 text-red-500 hover:bg-red-50 font-bold w-full transition-colors flex items-center gap-2" },
    });
    /** @type {__VLS_StyleScopedClasses['text-left']} */ ;
    /** @type {__VLS_StyleScopedClasses['px-6']} */ ;
    /** @type {__VLS_StyleScopedClasses['py-4']} */ ;
    /** @type {__VLS_StyleScopedClasses['text-red-500']} */ ;
    /** @type {__VLS_StyleScopedClasses['hover:bg-red-50']} */ ;
    /** @type {__VLS_StyleScopedClasses['font-bold']} */ ;
    /** @type {__VLS_StyleScopedClasses['w-full']} */ ;
    /** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
    /** @type {__VLS_StyleScopedClasses['flex']} */ ;
    /** @type {__VLS_StyleScopedClasses['items-center']} */ ;
    /** @type {__VLS_StyleScopedClasses['gap-2']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
        xmlns: "http://www.w3.org/2000/svg",
        ...{ class: "h-5 w-5" },
        fill: "none",
        viewBox: "0 0 24 24",
        stroke: "currentColor",
    });
    /** @type {__VLS_StyleScopedClasses['h-5']} */ ;
    /** @type {__VLS_StyleScopedClasses['w-5']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.path)({
        'stroke-linecap': "round",
        'stroke-linejoin': "round",
        'stroke-width': "2",
        d: "M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1",
    });
}
__VLS_asFunctionalElement1(__VLS_intrinsics.main, __VLS_intrinsics.main)({
    ...{ class: "flex-1 overflow-y-auto pb-20 md:pb-6 p-4 relative" },
});
/** @type {__VLS_StyleScopedClasses['flex-1']} */ ;
/** @type {__VLS_StyleScopedClasses['overflow-y-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['pb-20']} */ ;
/** @type {__VLS_StyleScopedClasses['md:pb-6']} */ ;
/** @type {__VLS_StyleScopedClasses['p-4']} */ ;
/** @type {__VLS_StyleScopedClasses['relative']} */ ;
let __VLS_70;
/** @ts-ignore @type {typeof __VLS_components.routerView | typeof __VLS_components.RouterView} */
routerView;
// @ts-ignore
const __VLS_71 = __VLS_asFunctionalComponent1(__VLS_70, new __VLS_70({}));
const __VLS_72 = __VLS_71({}, ...__VLS_functionalComponentArgsRest(__VLS_71));
__VLS_asFunctionalElement1(__VLS_intrinsics.nav, __VLS_intrinsics.nav)({
    ...{ class: "md:hidden fixed bottom-0 left-0 w-full bg-white border-t border-gray-200 flex justify-around items-center z-50 text-xs text-text-muted pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_10px_rgba(0,0,0,0.05)] pt-2 h-auto min-h-[4rem]" },
});
/** @type {__VLS_StyleScopedClasses['md:hidden']} */ ;
/** @type {__VLS_StyleScopedClasses['fixed']} */ ;
/** @type {__VLS_StyleScopedClasses['bottom-0']} */ ;
/** @type {__VLS_StyleScopedClasses['left-0']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['bg-white']} */ ;
/** @type {__VLS_StyleScopedClasses['border-t']} */ ;
/** @type {__VLS_StyleScopedClasses['border-gray-200']} */ ;
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-around']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['z-50']} */ ;
/** @type {__VLS_StyleScopedClasses['text-xs']} */ ;
/** @type {__VLS_StyleScopedClasses['text-text-muted']} */ ;
/** @type {__VLS_StyleScopedClasses['pb-[env(safe-area-inset-bottom)]']} */ ;
/** @type {__VLS_StyleScopedClasses['shadow-[0_-2px_10px_rgba(0,0,0,0.05)]']} */ ;
/** @type {__VLS_StyleScopedClasses['pt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['h-auto']} */ ;
/** @type {__VLS_StyleScopedClasses['min-h-[4rem]']} */ ;
let __VLS_75;
/** @ts-ignore @type {typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink} */
routerLink;
// @ts-ignore
const __VLS_76 = __VLS_asFunctionalComponent1(__VLS_75, new __VLS_75({
    to: "/home",
    ...{ class: "flex flex-col items-center justify-center p-1 px-2 w-full hover:text-primary transition-colors" },
}));
const __VLS_77 = __VLS_76({
    to: "/home",
    ...{ class: "flex flex-col items-center justify-center p-1 px-2 w-full hover:text-primary transition-colors" },
}, ...__VLS_functionalComponentArgsRest(__VLS_76));
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['p-1']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:text-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
const { default: __VLS_80 } = __VLS_78.slots;
__VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
    xmlns: "http://www.w3.org/2000/svg",
    ...{ class: "h-6 w-6 mb-1" },
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
});
/** @type {__VLS_StyleScopedClasses['h-6']} */ ;
/** @type {__VLS_StyleScopedClasses['w-6']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-1']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.path)({
    'stroke-linecap': "round",
    'stroke-linejoin': "round",
    'stroke-width': "2",
    d: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "font-medium" },
});
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
// @ts-ignore
[handleSignOut,];
var __VLS_78;
let __VLS_81;
/** @ts-ignore @type {typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink} */
routerLink;
// @ts-ignore
const __VLS_82 = __VLS_asFunctionalComponent1(__VLS_81, new __VLS_81({
    to: "/calendar",
    ...{ class: "flex flex-col items-center justify-center p-1 px-2 w-full hover:text-primary transition-colors" },
}));
const __VLS_83 = __VLS_82({
    to: "/calendar",
    ...{ class: "flex flex-col items-center justify-center p-1 px-2 w-full hover:text-primary transition-colors" },
}, ...__VLS_functionalComponentArgsRest(__VLS_82));
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['p-1']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:text-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
const { default: __VLS_86 } = __VLS_84.slots;
__VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
    xmlns: "http://www.w3.org/2000/svg",
    ...{ class: "h-6 w-6 mb-1" },
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
});
/** @type {__VLS_StyleScopedClasses['h-6']} */ ;
/** @type {__VLS_StyleScopedClasses['w-6']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-1']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.path)({
    'stroke-linecap': "round",
    'stroke-linejoin': "round",
    'stroke-width': "2",
    d: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "font-medium" },
});
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
// @ts-ignore
[];
var __VLS_84;
let __VLS_87;
/** @ts-ignore @type {typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink} */
routerLink;
// @ts-ignore
const __VLS_88 = __VLS_asFunctionalComponent1(__VLS_87, new __VLS_87({
    to: "/leave-requests",
    ...{ class: "flex flex-col items-center justify-center p-1 px-2 w-full hover:text-primary transition-colors" },
}));
const __VLS_89 = __VLS_88({
    to: "/leave-requests",
    ...{ class: "flex flex-col items-center justify-center p-1 px-2 w-full hover:text-primary transition-colors" },
}, ...__VLS_functionalComponentArgsRest(__VLS_88));
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['p-1']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:text-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
const { default: __VLS_92 } = __VLS_90.slots;
__VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
    xmlns: "http://www.w3.org/2000/svg",
    ...{ class: "h-6 w-6 mb-1" },
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
});
/** @type {__VLS_StyleScopedClasses['h-6']} */ ;
/** @type {__VLS_StyleScopedClasses['w-6']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-1']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.path)({
    'stroke-linecap': "round",
    'stroke-linejoin': "round",
    'stroke-width': "2",
    d: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "font-medium" },
});
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
// @ts-ignore
[];
var __VLS_90;
let __VLS_93;
/** @ts-ignore @type {typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink} */
routerLink;
// @ts-ignore
const __VLS_94 = __VLS_asFunctionalComponent1(__VLS_93, new __VLS_93({
    to: "/players",
    ...{ class: "flex flex-col items-center justify-center p-1 px-2 w-full hover:text-primary transition-colors" },
}));
const __VLS_95 = __VLS_94({
    to: "/players",
    ...{ class: "flex flex-col items-center justify-center p-1 px-2 w-full hover:text-primary transition-colors" },
}, ...__VLS_functionalComponentArgsRest(__VLS_94));
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['p-1']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:text-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
const { default: __VLS_98 } = __VLS_96.slots;
__VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
    xmlns: "http://www.w3.org/2000/svg",
    ...{ class: "h-6 w-6 mb-1" },
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
});
/** @type {__VLS_StyleScopedClasses['h-6']} */ ;
/** @type {__VLS_StyleScopedClasses['w-6']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-1']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.path)({
    'stroke-linecap': "round",
    'stroke-linejoin': "round",
    'stroke-width': "2",
    d: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "font-medium" },
});
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
// @ts-ignore
[];
var __VLS_96;
let __VLS_99;
/** @ts-ignore @type {typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink | typeof __VLS_components.routerLink | typeof __VLS_components.RouterLink} */
routerLink;
// @ts-ignore
const __VLS_100 = __VLS_asFunctionalComponent1(__VLS_99, new __VLS_99({
    to: "/users",
    ...{ class: "flex flex-col items-center justify-center p-1 px-2 w-full hover:text-primary transition-colors" },
}));
const __VLS_101 = __VLS_100({
    to: "/users",
    ...{ class: "flex flex-col items-center justify-center p-1 px-2 w-full hover:text-primary transition-colors" },
}, ...__VLS_functionalComponentArgsRest(__VLS_100));
/** @type {__VLS_StyleScopedClasses['flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-col']} */ ;
/** @type {__VLS_StyleScopedClasses['items-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['p-1']} */ ;
/** @type {__VLS_StyleScopedClasses['px-2']} */ ;
/** @type {__VLS_StyleScopedClasses['w-full']} */ ;
/** @type {__VLS_StyleScopedClasses['hover:text-primary']} */ ;
/** @type {__VLS_StyleScopedClasses['transition-colors']} */ ;
const { default: __VLS_104 } = __VLS_102.slots;
__VLS_asFunctionalElement1(__VLS_intrinsics.svg, __VLS_intrinsics.svg)({
    xmlns: "http://www.w3.org/2000/svg",
    ...{ class: "h-6 w-6 mb-1" },
    fill: "none",
    viewBox: "0 0 24 24",
    stroke: "currentColor",
});
/** @type {__VLS_StyleScopedClasses['h-6']} */ ;
/** @type {__VLS_StyleScopedClasses['w-6']} */ ;
/** @type {__VLS_StyleScopedClasses['mb-1']} */ ;
__VLS_asFunctionalElement1(__VLS_intrinsics.path)({
    'stroke-linecap': "round",
    'stroke-linejoin': "round",
    'stroke-width': "2",
    d: "M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z",
});
__VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
    ...{ class: "font-medium" },
});
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
// @ts-ignore
[];
var __VLS_102;
// @ts-ignore
[];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
