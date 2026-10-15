/**
 * Logging out, done gently so it can't crash the app on slower Android phones:
 *  1. go to Home first (a light screen) and let that switch finish,
 *  2. then clear the login and app state.
 * If "show intro after logout" is on, the intro plays the next time the app is opened
 * (not straight away — opening the intro's videos in the middle of a screen switch was
 * the heavy step that could freeze or close the app).
 */
import { router } from 'expo-router';
import { InteractionManager } from 'react-native';
import { toast } from '../components/Toast';
import { useApp } from '../store/app';
import { signOut } from '../store/auth';

let busy = false;

export function logOut() {
  if (busy) return;
  busy = true;
  try {
    router.replace('/home');
  } catch {
    /* already there */
  }
  toast('You’re logged out', 'ok');
  InteractionManager.runAfterInteractions(() => {
    setTimeout(() => {
      try {
        useApp.getState().logout();
      } catch {
        /* ignore */
      }
      signOut()
        .catch(() => {})
        .finally(() => {
          busy = false;
        });
    }, 350);
  });
}
