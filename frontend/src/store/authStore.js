import { create } from 'zustand';
import { supabase } from '../lib/supabase.js';

export const useAuthStore = create((set, get) => ({
  user: null,
  profile: null,
  loading: true,
  initialized: false,

  setUser: (user) => set({ user }),
  setProfile: (profile) => set({ profile }),

  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession();

    if (session?.user) {
      set({ user: session.user });
      await get().fetchProfile(session.user.id);
    }

    set({ loading: false, initialized: true });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') && session?.user) {
        set({ user: session.user });
        await get().fetchProfile(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        set({ user: null, profile: null });
      }
    });

    // Guardar referencia para poder limpiar si se necesita
    set({ _authSubscription: subscription });
  },

  fetchProfile: async (userId) => {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (data) set({ profile: data });
  },

  logout: async () => {
    await supabase.auth.signOut();
    set({ user: null, profile: null });
  },
}));
