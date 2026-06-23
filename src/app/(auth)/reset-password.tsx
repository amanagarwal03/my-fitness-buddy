import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

export default function ResetPasswordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { recovering, endRecovery } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  // Inline feedback (Alert.alert does not render on the web build).
  const [notice, setNotice] = useState<{ kind: 'info' | 'error'; text: string } | null>(null);
  const scrollRef = useRef<ScrollView>(null);

  const handleFieldFocus = () => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 120);
  };

  // When a recovery link has been opened, we have a temporary session and show
  // the "set a new password" form. Otherwise we show the "request reset" form.
  const updateMode = recovering;

  const sendReset = async () => {
    setNotice(null);
    if (!email.trim()) {
      setNotice({ kind: 'error', text: 'Enter your account email first.' });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: Linking.createURL('/reset-password'),
    });
    setLoading(false);
    if (error) {
      setNotice({ kind: 'error', text: error.message });
      return;
    }
    setSent(true);
  };

  const updatePassword = async () => {
    setNotice(null);
    if (password.length < 6) {
      setNotice({ kind: 'error', text: 'Password must be at least 6 characters.' });
      return;
    }
    if (password !== confirm) {
      setNotice({ kind: 'error', text: 'Passwords don’t match — please re-enter the same one.' });
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      setNotice({ kind: 'error', text: error.message });
      return;
    }
    // Success: ending recovery flips the auth gate, which navigates onward.
    endRecovery();
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag">
          <View style={styles.iconWrap}>
            <ThemedText style={{ fontSize: 40 }}>🔐</ThemedText>
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
              <ThemedText type="small" style={{ color: notice.kind === 'error' ? theme.danger : theme.text }}>
                {notice.text}
              </ThemedText>
            </View>
          ) : null}

          {updateMode ? (
            <>
              <ThemedText type="title" style={styles.center}>
                Set a new password
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.center}>
                Choose a new password for your account.
              </ThemedText>
              <Field
                label="New password"
                value={password}
                onChangeText={setPassword}
                onFocus={handleFieldFocus}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                placeholder="Create a password"
              />
              <Field
                label="Confirm password"
                value={confirm}
                onChangeText={setConfirm}
                onFocus={handleFieldFocus}
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                placeholder="Re-enter your password"
              />
              <Button title="Update password" onPress={updatePassword} loading={loading} />
            </>
          ) : sent ? (
            <>
              <ThemedText type="title" style={styles.center}>
                Check your email 📬
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.center}>
                We sent a password reset link to {email.trim()}. Open it on this device to set a new
                password.
              </ThemedText>
              <Button title="Back to sign in" variant="secondary" onPress={() => router.replace('/(auth)/sign-in')} />
            </>
          ) : (
            <>
              <ThemedText type="title" style={styles.center}>
                Reset password
              </ThemedText>
              <ThemedText themeColor="textSecondary" style={styles.center}>
                Enter your account email and we’ll send you a reset link.
              </ThemedText>
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
              <Button title="Send reset link" onPress={sendReset} loading={loading} />
              <Button title="Back" variant="secondary" onPress={() => router.back()} />
            </>
          )}
        </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
  iconWrap: { alignItems: 'center', marginBottom: Spacing.two },
  center: { textAlign: 'center' },
  notice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: Spacing.two,
    padding: Spacing.three,
  },
});
