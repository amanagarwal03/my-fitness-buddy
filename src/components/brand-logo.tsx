import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

// ─────────────────────────────────────────────────────────────────────────────
// TO SWAP THE LOGO: replace the file at assets/images/logo.png with your own
// (a square, ideally transparent PNG). Nothing else needs to change — this is the
// single source of truth used by the splash, sign-in, and onboarding screens.
// ─────────────────────────────────────────────────────────────────────────────
const LOGO_SOURCE = require('@/assets/images/logo.png');

/**
 * App logo inside the brand's translucent rounded badge. Used on the dark
 * gradient heroes, so the badge tint gives a light logo room to breathe.
 */
export function BrandLogo({ size = 72 }: { size?: number }) {
  return (
    <View
      style={[styles.badge, { width: size, height: size, borderRadius: size * 0.3 }]}>
      <Image
        source={LOGO_SOURCE}
        style={{ width: size * 0.64, height: size * 0.64, borderRadius: size * 0.16 }}
        contentFit="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
