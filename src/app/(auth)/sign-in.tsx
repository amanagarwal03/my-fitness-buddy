import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandLogo } from '@/components/brand-logo';
import { ThemedText } from '@/components/themed-text';
import { Button, Field, SegmentedControl } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

const FEATURES = [
  { emoji: '📸', label: 'Scan meals' },
  { emoji: '🏋️', label: 'Log workouts' },
  { emoji: '📈', label: 'Track progress' },
];

export default function SignInScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // When a field is focused, scroll the card up so it sits above the keyboard
  // (Android needs this — there's no iOS-style auto inset adjustment).
  const handleFieldFocus = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  };

  const emailRedirect = Linking.createURL('/sign-in');

  const resendConfirmation = async () => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: emailRedirect },
    });
    Alert.alert(
      error ? 'Could not resend' : 'Confirmation sent',
      error ? error.message : `We sent a new confirmation link to ${email}.`,
    );
  };

  const submit = async () => {
    if (!isSupabaseConfigured) {
      Alert.alert('Not configured', 'Add your Supabase keys to .env and restart the app.');
      return;
    }
    if (!email || !password) {
      Alert.alert('Missing info', 'Enter both email and password.');
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signUp') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: emailRedirect },
        });
        if (error) throw error;
        if (!data.session) {
          Alert.alert(
            'Confirm your email',
            `We sent a confirmation link to ${email}. Tap it to finish creating your account, then sign in.`,
          );
          setMode('signIn');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Friendlier handling for an unconfirmed account on sign-in.
      if (/not confirmed/i.test(msg)) {
        Alert.alert('Email not confirmed', 'Please confirm your email first.', [
          { text: 'OK', style: 'cancel' },
          { text: 'Resend link', onPress: resendConfirmation },
        ]);
      } else {
        Alert.alert('Authentication error', msg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}>
          {/* Branded hero */}
          <LinearGradient
            colors={['#2EA0FF', '#1257B0']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}>
            <SafeAreaView edges={['top']}>
              <View style={styles.heroInner}>
                <View style={{ marginBottom: Spacing.two }}>
                  <BrandLogo size={72} />
                </View>
                <ThemedText style={styles.heroTitle}>My Fitness Buddy</ThemedText>
                <ThemedText style={styles.heroTagline}>Your accountability partner</ThemedText>

                <View style={styles.featureRow}>
                  {FEATURES.map((f) => (
                    <View key={f.label} style={styles.featurePill}>
                      <ThemedText style={{ fontSize: 15 }}>{f.emoji}</ThemedText>
                      <ThemedText style={styles.featureText}>{f.label}</ThemedText>
                    </View>
                  ))}
                </View>
              </View>
            </SafeAreaView>
          </LinearGradient>

          {/* Floating auth card overlapping the hero */}
          <View
            style={[
              styles.card,
              { backgroundColor: theme.background, borderColor: theme.border, shadowColor: '#000' },
            ]}>
            <SegmentedControl<'signIn' | 'signUp'>
              value={mode}
              onChange={setMode}
              options={[
                { label: 'Sign in', value: 'signIn' },
                { label: 'Sign up', value: 'signUp' },
              ]}
            />

            <View style={{ gap: Spacing.one }}>
              <ThemedText type="subtitle">
                {mode === 'signIn' ? 'Welcome back' : 'Create your account'}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {mode === 'signIn'
                  ? 'Sign in to pick up where you left off.'
                  : 'Start tracking in under a minute.'}
              </ThemedText>
            </View>

            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              onFocus={handleFieldFocus}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              placeholder="you@example.com"
            />
            <Field
              label="Password"
              value={password}
              onChangeText={setPassword}
              onFocus={handleFieldFocus}
              secureTextEntry
              placeholder="••••••••"
            />
            <Button
              title={mode === 'signIn' ? 'Sign in' : 'Create account'}
              onPress={submit}
              loading={loading}
            />

            {mode === 'signIn' ? (
              <Pressable
                onPress={() => router.push('/(auth)/reset-password')}
                hitSlop={8}
                style={{ alignSelf: 'center' }}>
                <ThemedText type="small" themeColor="primary">
                  Forgot password?
                </ThemedText>
              </Pressable>
            ) : null}
          </View>

          <ThemedText type="small" themeColor="textSecondary" style={styles.footer}>
            By continuing you agree to track responsibly 💪
          </ThemedText>
        </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: Spacing.six, flexGrow: 1 },
  hero: {
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    paddingBottom: Spacing.six,
  },
  heroInner: {
    alignItems: 'center',
    paddingTop: Spacing.four,
    paddingHorizontal: Spacing.four,
    gap: Spacing.half,
  },
  heroTitle: { color: '#fff', fontSize: 26, fontWeight: '800', textAlign: 'center' },
  heroTagline: { color: 'rgba(255,255,255,0.9)', fontSize: 14, textAlign: 'center' },
  featureRow: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.three, flexWrap: 'wrap', justifyContent: 'center' },
  featurePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    backgroundColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one + 1,
    borderRadius: 999,
  },
  featureText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  card: {
    marginHorizontal: Spacing.four,
    marginTop: -Spacing.five,
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.four,
    gap: Spacing.three,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  footer: { textAlign: 'center', marginTop: Spacing.four, paddingHorizontal: Spacing.four },
});
