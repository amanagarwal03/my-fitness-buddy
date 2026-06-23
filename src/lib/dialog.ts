import { Alert, type AlertButton, Platform } from 'react-native';

/**
 * Cross-platform alert/confirm. On native it uses React Native's Alert; on web
 * it falls back to the browser's window.alert / window.confirm (RN's Alert does
 * not render a dialog on the web build, so those callbacks would silently never
 * run). Button semantics are mapped: the non-"cancel" button is treated as the
 * confirm action.
 */
export function showAlert(title: string, message?: string, buttons?: AlertButton[]): void {
  if (Platform.OS !== 'web') {
    Alert.alert(title, message, buttons);
    return;
  }

  const text = [title, message].filter(Boolean).join('\n\n');

  // No buttons, or a single acknowledge button → simple alert.
  if (!buttons || buttons.length <= 1) {
    if (typeof window !== 'undefined') window.alert(text);
    buttons?.[0]?.onPress?.();
    return;
  }

  // Two+ buttons → confirm. OK runs the confirm/destructive action; Cancel runs
  // the cancel action.
  const cancelBtn = buttons.find((b) => b.style === 'cancel');
  const confirmBtn = buttons.find((b) => b.style !== 'cancel') ?? buttons[buttons.length - 1];
  const ok = typeof window !== 'undefined' ? window.confirm(text) : true;
  if (ok) confirmBtn?.onPress?.();
  else cancelBtn?.onPress?.();
}
