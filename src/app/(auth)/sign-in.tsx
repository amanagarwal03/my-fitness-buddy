import { LinearGradient } from 'expo-linear-gradient';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
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
  // Inline feedback shown in the card. We use this instead of Alert.alert
  // because Alert does not render a dialog on the web build.
  const [notice, setNotice] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const [showResend, setShowResend] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  // When a field is focused, scroll the card up so it sits above the keyboard
  // (Android needs this — there's no iOS-style auto inset adjustment).
  const handleFieldFocus = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  };

  const emailRedirect = Linking.createURL('/sign-in');

  const switchMode = (next: 'signIn' | 'signUp') => {
    setMode(next);
    setNotice(null);
    setShowResend(false);
  };

  const resendConfirmation = async () => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: emailRedirect },
    });
    setNotice(
      error
        ? { kind: 'error', text: error.message }
        : { kind: 'info', text: `We sent a new confirmation link to ${email}.` },
    );
  };

  const submit = async () => {
    setNotice(null);
    setShowResend(false);
    if (!isSupabaseConfigured) {
      setNotice({ kind: 'error', text: 'App is not configured. Please try again later.' });
      return;
    }
    if (!email || !password) {
      setNotice({ kind: 'error', text: 'Enter both your email and password.' });
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
          setMode('signIn');
          setNotice({
            kind: 'info',
            text: `Almost there! We sent a confirmation link to ${email}. Open it, then sign in below.`,
          });
          setShowResend(true);
        }
        // If a session exists, email confirmation is off and the auth gate
        // navigates onward automatically.
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/not confirmed/i.test(msg)) {
        setNotice({ kind: 'info', text: 'Please confirm your email first — check your inbox.' });
        setShowResend(true);
      } else {
        setNotice({ kind: 'error', text: msg });
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
              onChange={switchMode}
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

            {notice ? (
              <View
                style={[
                  styles.notice,
                  {
                    backgroundColor: (notice.kind === 'error' ? theme.danger : theme.success) + '18',
                    borderColor: (notice.kind === 'error' ? theme.danger : theme.success) + '55',
                  },
                ]}>
                <ThemedText
                  type="small"
                  style={{ color: notice.kind === 'error' ? theme.danger : theme.text }}>
                  {notice.kind === 'info' ? '✅  ' : '⚠️  '}
                  {notice.text}
                </ThemedText>
                {showResend ? (
                  <Pressable onPress={resendConfirmation} hitSlop={8} style={{ marginTop: Spacing.one }}>
                    <ThemedText type="smallBold" themeColor="primary">
                      Resend confirmation email
                    </ThemedText>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

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
              autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
              textContentType={mode === 'signIn' ? 'password' : 'newPassword'}
              placeholder={mode === 'signIn' ? 'Your password' : 'Create a password'}
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
  notice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
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
