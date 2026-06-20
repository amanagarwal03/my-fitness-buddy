import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';

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

  // When a recovery link has been opened, we have a temporary session and show
  // the "set a new password" form. Otherwise we show the "request reset" form.
  const updateMode = recovering;

  const sendReset = async () => {
    if (!email.trim()) {
      Alert.alert('Enter your email', 'We’ll send a reset link to this address.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: Linking.createURL('/reset-password'),
    });
    setLoading(false);
    if (error) {
      Alert.alert('Could not send', error.message);
      return;
    }
    setSent(true);
  };

  const updatePassword = async () => {
    if (password.length < 6) {
      Alert.alert('Too short', 'Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Passwords don’t match', 'Please re-enter the same password.');
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      Alert.alert('Could not update', error.message);
      return;
    }
    endRecovery();
    Alert.alert('Password updated', 'You’re signed in with your new password.');
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets>
          <View style={styles.iconWrap}>
            <ThemedText style={{ fontSize: 40 }}>🔐</ThemedText>
          </View>

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
                secureTextEntry
                placeholder="••••••••"
              />
              <Field
                label="Confirm password"
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                placeholder="••••••••"
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
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', padding: Spacing.four, gap: Spacing.three },
  iconWrap: { alignItems: 'center', marginBottom: Spacing.two },
  center: { textAlign: 'center' },
});
