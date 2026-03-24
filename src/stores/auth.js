import { defineStore } from 'pinia';
import { ref } from 'vue';
import { supabase } from '@/services/supabase';
export const useAuthStore = defineStore('auth', () => {
    const user = ref(null);
    const session = ref(null);
    const isInitializing = ref(true);
    const initializeAuth = async () => {
        isInitializing.value = true;
        try {
            const { data: { session: existingSession } } = await supabase.auth.getSession();
            session.value = existingSession;
            user.value = existingSession?.user ?? null;
            supabase.auth.onAuthStateChange((_event, newSession) => {
                session.value = newSession;
                user.value = newSession?.user ?? null;
            });
        }
        catch (error) {
            console.error('Failed to initialize auth', error);
        }
        finally {
            isInitializing.value = false;
        }
    };
    const sendMagicLink = async (email) => {
        const { error } = await supabase.auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: window.location.origin
            }
        });
        if (error)
            throw error;
    };
    const signOut = async () => {
        await supabase.auth.signOut();
        user.value = null;
        session.value = null;
    };
    return {
        user,
        session,
        isInitializing,
        initializeAuth,
        sendMagicLink,
        signOut
    };
});
