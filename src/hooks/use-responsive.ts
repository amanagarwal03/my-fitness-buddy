import { Platform, useWindowDimensions } from 'react-native';

// Width (px) at/above which we switch from the phone layout to the desktop
// shell (centered app frame + left sidebar). Tracks the live window size so it
// flips as the browser is resized.
export const DESKTOP_MIN_WIDTH = 900;

export function useResponsive() {
  const { width, height } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_MIN_WIDTH;
  return { width, height, isDesktop };
}
