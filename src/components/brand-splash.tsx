import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { BrandLogo } from './brand-logo';
import { ThemedText } from './themed-text';

/**
 * Branded launch screen shown briefly on every cold start (logo → name →
 * tagline) before the app routes to sign-in or the home tabs.
 * Swap the emoji badge for the real logo image when it's ready.
 */
export function BrandSplash() {
  const fade = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.82)).current;
  const tagFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 550, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, friction: 6, tension: 55, useNativeDriver: true }),
      ]),
      Animated.timing(tagFade, { toValue: 1, duration: 450, useNativeDriver: true }),
    ]).start();
  }, [fade, scale, tagFade]);

  return (
    <LinearGradient
      colors={['#2EA0FF', '#1257B0']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.fill}>
      <Animated.View style={{ alignItems: 'center', opacity: fade, transform: [{ scale }] }}>
        <View style={{ marginBottom: 18 }}>
          <BrandLogo size={96} />
        </View>
        <ThemedText style={styles.name}>My Fitness Buddy</ThemedText>
      </Animated.View>
      <Animated.View style={{ opacity: tagFade, position: 'absolute', bottom: 64 }}>
        <ThemedText style={styles.tag}>Your accountability partner</ThemedText>
      </Animated.View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  name: { color: '#fff', fontSize: 28, fontWeight: '800', letterSpacing: 0.3 },
  tag: { color: 'rgba(255,255,255,0.9)', fontSize: 15, fontWeight: '500' },
});
