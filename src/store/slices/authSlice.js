// src/store/slices/authSlice.js
// Tracks sign-in status only. The actual session — an httpOnly cookie on
// our own origin, set by /api/auth/session — is invisible to JS by design
// (see lib/ornaverse/session.js); nothing token-shaped lives here or in
// localStorage. API calls are NOT made here — TanStack Query handles that.

import { createSlice } from '@reduxjs/toolkit';

const initialState = {
  isAuthenticated: false,
  user: null,           // { username } — populated after login
  isSuperAdmin: false,  // gates admin-only actions (e.g. customer edit) — see useAuth.js's login()
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {

    // Called after a successful login
    setAuthenticated: (state, action) => {
      const { username, isSuperAdmin } = action.payload;
      state.isAuthenticated = true;
      state.user            = { username };
      state.isSuperAdmin    = !!isSuperAdmin;
    },

    // Called on logout, or when the server rejects the session (expired,
    // OrnaVerse-side rejection, ...)
    clearAuth: (state) => {
      state.isAuthenticated = false;
      state.user            = null;
      state.isSuperAdmin    = false;
    },

  },
});

export const { setAuthenticated, clearAuth } = authSlice.actions;

export const selectIsAuthenticated = (state) => state.auth.isAuthenticated;
export const selectAuthUser        = (state) => state.auth.user;
export const selectIsSuperAdmin    = (state) => state.auth.isSuperAdmin;

export default authSlice.reducer;
