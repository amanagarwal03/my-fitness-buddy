import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, View } from 'react-native';

import { showAlert } from '@/lib/dialog';

import { MenuHeader } from '@/components/side-nav';
import { ThemedText } from '@/components/themed-text';
import { ToggleRow } from '@/components/toggle-row';
import { Button, Card, Field, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { PREVIEW_MODE } from '@/lib/preview';
import {
  getOrCreateMyCode,
  listMyViewers,
  listSharedWithMe,
  redeemCode,
  removeGrant,
  type ShareGrant,
} from '@/lib/sharing';
import { requireUserId, supabase } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

type SharePref = 'share_name' | 'share_age' | 'share_gender' | 'share_body';

export default function ShareScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const userId = session?.user.id;

  const [myCode, setMyCode] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState('');
  const [redeeming, setRedeeming] = useState(false);
  const [viewers, setViewers] = useState<ShareGrant[]>([]);
  const [sharedWithMe, setSharedWithMe] = useState<ShareGrant[]>([]);

  // What coaches see — persisted on the profile row.
  const [prefs, setPrefs] = useState<Record<SharePref, boolean>>({
    share_name: true,
    share_age: false,
    share_gender: false,
    share_body: false,
  });

  const refresh = useCallback(async () => {
    if (!userId) return;
    const [v, s] = await Promise.all([listMyViewers(userId), listSharedWithMe(userId)]);
    setViewers(v);
    setSharedWithMe(s);
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    getOrCreateMyCode(userId).then(setMyCode).catch((e) => showAlert('Error', String(e)));
    refresh();
    if (!PREVIEW_MODE) {
      supabase
        .from('profiles')
        .select('share_name, share_age, share_gender, share_body')
        .eq('user_id', userId)
        .maybeSingle()
        .then(({ data }) => {
          const p = data as Partial<Profile> | null;
          if (p)
            setPrefs({
              share_name: p.share_name ?? true,
              share_age: p.share_age ?? false,
              share_gender: p.share_gender ?? false,
              share_body: p.share_body ?? false,
            });
        });
    }
  }, [userId, refresh]);

  // Persist a single sharing toggle; revert + warn if the write fails (e.g. the
  // share_body column hasn't been migrated yet).
  const setPref = async (field: SharePref, value: boolean) => {
    const prev = prefs[field];
    setPrefs((p) => ({ ...p, [field]: value }));
    if (PREVIEW_MODE) return;
    try {
      const uid = await requireUserId();
      const { error } = await supabase.from('profiles').upsert({ user_id: uid, [field]: value });
      if (error) throw error;
    } catch (e) {
      setPrefs((p) => ({ ...p, [field]: prev }));
      showAlert('Could not save', e instanceof Error ? e.message : String(e));
    }
  };

  const shareCode = async () => {
    if (!myCode) return;
    await Share.share({
      message: `Follow my fitness progress on My Fitness Buddy. Open the app → ☰ → Share & coaches → enter my code: ${myCode}`,
    });
  };

  const onRedeem = async () => {
    const code = codeInput.trim().toUpperCase();
    if (code.length < 4) {
      showAlert('Enter a code', 'Type the code your friend shared with you.');
      return;
    }
    setRedeeming(true);
    try {
      const ownerId = await redeemCode(code);
      setCodeInput('');
      await refresh();
      router.push(`/shared/${ownerId}`);
    } catch (e) {
      showAlert('Could not add', e instanceof Error ? e.message : String(e));
    } finally {
      setRedeeming(false);
    }
  };

  const revoke = (g: ShareGrant) => {
    showAlert('Remove access?', `${g.viewer_label ?? 'This person'} will no longer see your data.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          await removeGrant(g.owner_id, g.viewer_id);
          refresh();
        },
      },
    ]);
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <MenuHeader title="Share & coaches" />

        {/* My code */}
        <Card style={{ alignItems: 'center', gap: Spacing.two }}>
          <ThemedText type="small" themeColor="textSecondary">
            YOUR SHARE CODE
          </ThemedText>
          <ThemedText type="title" style={{ fontSize: 40, letterSpacing: 4 }}>
            {myCode ?? '••••••'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
            Share this with a coach or friend so they can view your meals and workouts (read-only).
          </ThemedText>
          <Button title="Share code" onPress={shareCode} style={{ alignSelf: 'stretch' }} />
        </Card>

        {/* What coaches can see */}
        <ThemedText type="smallBold" themeColor="textSecondary">
          WHAT YOUR COACHES SEE
        </ThemedText>
        <Card style={{ gap: Spacing.one }}>
          <ThemedText type="small" themeColor="textSecondary">
            Your meals & workouts are always shared. Choose what else coaches can see.
          </ThemedText>
          <ToggleRow label="Your name" value={prefs.share_name} onValueChange={(v) => setPref('share_name', v)} />
          <ToggleRow label="Your age" value={prefs.share_age} onValueChange={(v) => setPref('share_age', v)} />
          <ToggleRow label="Your gender" value={prefs.share_gender} onValueChange={(v) => setPref('share_gender', v)} />
          <ToggleRow
            label="Body composition"
            sublabel="Metrics & measurements"
            value={prefs.share_body}
            onValueChange={(v) => setPref('share_body', v)}
          />
        </Card>

        {/* Redeem someone else's code */}
        <ThemedText type="smallBold" themeColor="textSecondary">
          VIEW SOMEONE’S PROFILE
        </ThemedText>
        <Card>
          <Field
            label="Enter their code"
            value={codeInput}
            onChangeText={setCodeInput}
            autoCapitalize="characters"
            placeholder="ABC123"
            maxLength={8}
          />
          <Button title="Add profile" onPress={onRedeem} loading={redeeming} />
        </Card>

        {sharedWithMe.length > 0 ? (
          <>
            <ThemedText type="smallBold" themeColor="textSecondary">
              SHARED WITH YOU
            </ThemedText>
            {sharedWithMe.map((g) => (
              <Pressable key={g.owner_id} onPress={() => router.push(`/shared/${g.owner_id}`)}>
                <Card>
                  <View style={styles.row}>
                    <ThemedText type="smallBold" style={{ flex: 1 }} numberOfLines={1}>
                      {g.owner_name ?? g.owner_label ?? 'Shared profile'}
                    </ThemedText>
                    <ThemedText type="small" themeColor="primary">
                      View ›
                    </ThemedText>
                  </View>
                </Card>
              </Pressable>
            ))}
          </>
        ) : null}

        {viewers.length > 0 ? (
          <>
            <ThemedText type="smallBold" themeColor="textSecondary">
              PEOPLE YOU’VE SHARED WITH
            </ThemedText>
            {viewers.map((g) => (
              <Card key={g.viewer_id}>
                <View style={styles.row}>
                  <View style={styles.viewerAvatar}>
                    <ThemedText type="smallBold" style={{ color: '#fff' }}>
                      {(g.viewer_label ?? '?').charAt(0).toUpperCase()}
                    </ThemedText>
                  </View>
                  <View style={{ flex: 1 }}>
                    <ThemedText type="smallBold" numberOfLines={1}>
                      {g.viewer_label ?? 'A coach'}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      Has read access
                    </ThemedText>
                  </View>
                  <Pressable onPress={() => revoke(g)} hitSlop={8}>
                    <ThemedText type="smallBold" themeColor="danger">
                      Remove
                    </ThemedText>
                  </Pressable>
                </View>
              </Card>
            ))}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  viewerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#208AEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
