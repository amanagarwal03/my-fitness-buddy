import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSideNav } from '@/components/side-nav';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Field, Screen, SegmentedControl } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useKeyboardAwareScroll } from '@/hooks/use-keyboard-aware-scroll';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth';
import { bmiCategory, computeBmi, type BmiCategory } from '@/lib/bmi';
import { ageFromDob, formatDobInput } from '@/lib/date';
import { sanitizeDecimal } from '@/lib/num';
import { PREVIEW_MODE, previewProfile } from '@/lib/preview';
import { requireUserId, supabase } from '@/lib/supabase';
import type { Profile, Unit } from '@/lib/types';
import { fromKg, round1, toKg } from '@/lib/units';

type Gender = 'male' | 'female' | 'other';

const HERO_GRADIENT = ['#2EA0FF', '#1257B0'] as const;

function bmiColor(cat: BmiCategory, theme: ReturnType<typeof useTheme>): string {
  switch (cat) {
    case 'Underweight':
      return theme.primary;
    case 'Normal':
      return theme.success;
    case 'Overweight':
      return theme.warning;
    case 'Obese':
      return theme.danger;
  }
}

export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session, signOut } = useAuth();
  const { scrollRef, handleInputFocus, keyboardSpacerHeight } = useKeyboardAwareScroll();
  const [unit, setUnit] = useState<Unit>('kg');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [dob, setDob] = useState(''); // YYYY-MM-DD
  const [sex, setSex] = useState<Gender | null>(null);
  // What a coach sees on the shared profile (name on by default; age/gender off).
  const [shareName, setShareName] = useState(true);
  const [shareAge, setShareAge] = useState(false);
  const [shareGender, setShareGender] = useState(false);
  const [heightCm, setHeightCm] = useState('');
  const [weightInput, setWeightInput] = useState(''); // shown in current unit
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [deleting, setDeleting] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [measureOpen, setMeasureOpen] = useState(false);
  const [sharingOpen, setSharingOpen] = useState(false);
  // Snapshot of the last-persisted values, so auto-save only writes real edits
  // (and never re-saves the data we just loaded). Set in load() and after a save.
  const savedSnapshot = useRef<string>('');
  const hydrated = useRef(false);

  // Serialize the editable fields in a stable key order so we can detect changes.
  const serialize = useCallback(
    () =>
      JSON.stringify({
        firstName,
        lastName,
        dob,
        sex,
        shareName,
        shareAge,
        shareGender,
        heightCm,
        weightInput,
        unit,
      }),
    [firstName, lastName, dob, sex, shareName, shareAge, shareGender, heightCm, weightInput, unit],
  );

  const load = useCallback(async () => {
    const uid = session?.user.id;
    const data = PREVIEW_MODE
      ? previewProfile
      : uid
        ? ((await supabase.from('profiles').select('*').eq('user_id', uid).maybeSingle())
            .data as Profile | null)
        : null;
    const p = data as Profile | null;
    const u = p?.unit_pref ?? 'kg';
    const next = {
      firstName: p?.first_name ?? '',
      lastName: p?.last_name ?? '',
      dob: p?.dob ?? '',
      sex: p?.sex ?? null,
      shareName: p?.share_name ?? true,
      shareAge: p?.share_age ?? false,
      shareGender: p?.share_gender ?? false,
      heightCm: p?.height_cm ? String(p.height_cm) : '',
      weightInput: p?.weight_kg != null ? String(round1(fromKg(p.weight_kg, u))) : '',
      unit: u,
    };
    setUnit(next.unit);
    setFirstName(next.firstName);
    setLastName(next.lastName);
    setDob(next.dob);
    setSex(next.sex);
    setShareName(next.shareName);
    setShareAge(next.shareAge);
    setShareGender(next.shareGender);
    setHeightCm(next.heightCm);
    setWeightInput(next.weightInput);
    // Record what's now on screen as the saved baseline so auto-save stays quiet
    // until the user actually changes something.
    savedSnapshot.current = JSON.stringify(next);
    hydrated.current = true;
    setStatus('idle');
    setLoading(false);
  }, [session]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  // Auto-save: debounce after any edit, write only when values actually changed.
  useEffect(() => {
    if (!hydrated.current || PREVIEW_MODE) return;
    const serialized = serialize();
    if (serialized === savedSnapshot.current) return;
    // Don't persist an invalid height — wait until it's a positive number.
    if (heightCm !== '' && !(Number(heightCm) > 0)) return;
    const t = setTimeout(async () => {
      const uid = session?.user.id;
      if (!uid) return;
      setStatus('saving');
      let userId: string;
      try {
        userId = await requireUserId();
      } catch {
        setStatus('error');
        return;
      }
      const { error } = await supabase.from('profiles').upsert({
        user_id: userId,
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        dob: dob || null,
        // Keep the denormalised age column in sync so it stays accurate over time.
        age: ageFromDob(dob),
        sex,
        share_name: shareName,
        share_age: shareAge,
        share_gender: shareGender,
        height_cm: heightCm !== '' ? Number(heightCm) : null,
        weight_kg: weightInput !== '' ? toKg(Number(weightInput), unit) : null,
        unit_pref: unit,
        updated_at: new Date().toISOString(),
      });
      if (error) {
        setStatus('error');
        return;
      }
      savedSnapshot.current = serialized;
      setStatus('saved');
    }, 700);
    return () => clearTimeout(t);
  }, [
    serialize,
    firstName,
    lastName,
    dob,
    sex,
    shareName,
    shareAge,
    shareGender,
    heightCm,
    weightInput,
    unit,
    session,
  ]);

  // When the unit toggle changes, convert the displayed weight so the value stays the same.
  const onUnitChange = (next: Unit) => {
    const current = Number(weightInput);
    if (Number.isFinite(current) && weightInput !== '') {
      const kg = toKg(current, unit);
      setWeightInput(String(round1(fromKg(kg, next))));
    }
    setUnit(next);
  };

  const weightKg = weightInput !== '' ? toKg(Number(weightInput), unit) : null;
  const heightNum = heightCm !== '' ? Number(heightCm) : null;
  const bmi = heightNum && weightKg ? computeBmi(heightNum, weightKg) : null;

  const deleteAccount = () => {
    if (PREVIEW_MODE) {
      Alert.alert('Preview mode', 'Connect Supabase to manage your account.');
      return;
    }
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account and all your data — meals, photos, workouts, and sharing. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            const { error } = await supabase.rpc('delete_my_account');
            setDeleting(false);
            if (error) {
              Alert.alert('Could not delete', error.message);
              return;
            }
            await signOut();
          },
        },
      ],
    );
  };

  // Identity bits.
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim();
  const displayName = fullName || 'Welcome 👋';
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.trim();
  const avatarText = (initials || session?.user.email?.charAt(0) || '?').toUpperCase();
  const genderLabel = sex ? sex.charAt(0).toUpperCase() + sex.slice(1) : '';
  const cat = bmi != null ? bmiCategory(bmi) : null;
  const computedAge = ageFromDob(dob);

  // One-line summaries shown on the collapsed cards.
  const detailsBits = [fullName, computedAge != null ? `${computedAge} yrs` : '', genderLabel].filter(
    Boolean,
  );
  const detailsSummary = detailsBits.length
    ? detailsBits.join('  ·  ')
    : 'Add your name, age & gender';
  const measureSummary =
    heightCm || weightInput
      ? [heightCm ? `${heightCm} cm` : '', weightInput ? `${weightInput} ${unit}` : '']
          .filter(Boolean)
          .join('  ·  ')
      : 'Add your height & weight';
  const shownBits = [
    shareName ? 'name' : '',
    shareAge ? 'age' : '',
    shareGender ? 'gender' : '',
  ].filter(Boolean);
  const sharingSummary = shownBits.length ? `Coach sees ${shownBits.join(', ')}` : 'Coach sees nothing';

  return (
    <Screen edges={[]}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingBottom: Spacing.six }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}>
        {/* ---------- Gradient identity hero ---------- */}
        <LinearGradient
          colors={HERO_GRADIENT}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.hero}>
          <SafeAreaView edges={['top']}>
            <HeroMenuButton />
            <View style={styles.heroInner}>
              <View style={styles.avatarRing}>
                <View style={styles.avatar}>
                  <ThemedText style={styles.avatarText}>{avatarText}</ThemedText>
                </View>
              </View>
              <ThemedText style={styles.heroName} numberOfLines={1}>
                {displayName}
              </ThemedText>
              <ThemedText style={styles.heroEmail} numberOfLines={1}>
                {session?.user.email}
              </ThemedText>

              {cat || computedAge != null || genderLabel ? (
                <View style={styles.chipRow}>
                  {cat ? <HeroChip icon="⚖️" label={cat} /> : null}
                  {computedAge != null ? <HeroChip icon="🎂" label={`${computedAge} yrs`} /> : null}
                  {genderLabel ? <HeroChip icon="👤" label={genderLabel} /> : null}
                </View>
              ) : null}
            </View>
          </SafeAreaView>
        </LinearGradient>

        {/* ---------- Floating stat tiles ---------- */}
        <View style={styles.statsRow}>
          <StatTile
            emoji="⚖️"
            value={weightInput || '—'}
            unit={weightInput ? unit : ''}
            label="Weight"
            accent={theme.primary}
            onPress={() => setMeasureOpen(true)}
          />
          <StatTile
            emoji="📏"
            value={heightCm || '—'}
            unit={heightCm ? 'cm' : ''}
            label="Height"
            accent={theme.success}
            onPress={() => setMeasureOpen(true)}
          />
          <StatTile
            emoji="🎂"
            value={computedAge != null ? String(computedAge) : '—'}
            unit={computedAge != null ? 'yrs' : ''}
            label="Age"
            accent="#F59E0B"
            onPress={() => setDetailsOpen(true)}
          />
        </View>

        <View style={styles.body}>
          {/* ---------- BMI meter ---------- */}
          <BmiMeter bmi={bmi} />

          {/* ---------- Share CTA ---------- */}
          <Pressable onPress={() => router.push('/share')}>
            {({ pressed }) => (
              <LinearGradient
                colors={HERO_GRADIENT}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.cta, { opacity: pressed ? 0.9 : 1 }]}>
                <View style={styles.ctaIconWrap}>
                  <ThemedText style={{ fontSize: 22 }}>🤝</ThemedText>
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.ctaTitle}>Share with a coach</ThemedText>
                  <ThemedText style={styles.ctaSub}>Read-only access to your progress</ThemedText>
                </View>
                <ThemedText style={styles.ctaArrow}>›</ThemedText>
              </LinearGradient>
            )}
          </Pressable>

          {/* ---------- Editors ---------- */}
          <CollapsibleCard
            icon="🧑"
            title="Your details"
            summary={detailsSummary}
            open={detailsOpen}
            onToggle={() => setDetailsOpen((o) => !o)}>
            <View style={styles.nameRow}>
              <View style={{ flex: 1 }}>
                <Field
                  label="First name"
                  value={firstName}
                  onChangeText={setFirstName}
                  onFocus={handleInputFocus}
                  editable={!loading}
                  autoCapitalize="words"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Field
                  label="Last name"
                  value={lastName}
                  onChangeText={setLastName}
                  onFocus={handleInputFocus}
                  editable={!loading}
                  autoCapitalize="words"
                />
              </View>
            </View>
            <Field
              label="Date of birth"
              keyboardType="number-pad"
              inputMode="numeric"
              value={dob}
              onChangeText={(t) => setDob(formatDobInput(t))}
              onFocus={handleInputFocus}
              editable={!loading}
              placeholder="YYYY-MM-DD"
              maxLength={10}
            />
            {computedAge != null ? (
              <ThemedText type="small" themeColor="textSecondary">
                Age: {computedAge}
              </ThemedText>
            ) : null}
            <View style={{ gap: Spacing.one }}>
              <ThemedText type="small" themeColor="textSecondary">
                Gender
              </ThemedText>
              <SegmentedControl<Gender>
                value={(sex ?? '') as Gender}
                onChange={setSex}
                options={[
                  { label: 'Male', value: 'male' },
                  { label: 'Female', value: 'female' },
                  { label: 'Other', value: 'other' },
                ]}
              />
            </View>
          </CollapsibleCard>

          <CollapsibleCard
            icon="📐"
            title="Measurements"
            summary={measureSummary}
            open={measureOpen}
            onToggle={() => setMeasureOpen((o) => !o)}>
            <View style={{ gap: Spacing.one }}>
              <ThemedText type="small" themeColor="textSecondary">
                Preferred weight unit
              </ThemedText>
              <SegmentedControl<Unit>
                value={unit}
                onChange={onUnitChange}
                options={[
                  { label: 'kg', value: 'kg' },
                  { label: 'lbs', value: 'lbs' },
                ]}
              />
            </View>
            <Field
              label="Height (cm)"
              keyboardType="decimal-pad"
              inputMode="decimal"
              value={heightCm}
              onChangeText={(t) => setHeightCm(sanitizeDecimal(t))}
              onFocus={handleInputFocus}
              editable={!loading}
              placeholder="175"
            />
            <Field
              label={`Weight (${unit})`}
              keyboardType="decimal-pad"
              inputMode="decimal"
              value={weightInput}
              onChangeText={(t) => setWeightInput(sanitizeDecimal(t))}
              onFocus={handleInputFocus}
              editable={!loading}
              placeholder={unit === 'kg' ? '70' : '154'}
            />
          </CollapsibleCard>

          <CollapsibleCard
            icon="🤝"
            title="Coach sharing"
            summary={sharingSummary}
            open={sharingOpen}
            onToggle={() => setSharingOpen((o) => !o)}>
            <ThemedText type="small" themeColor="textSecondary">
              Choose what a coach sees on your shared profile.
            </ThemedText>
            <ToggleRow label="Show my name" value={shareName} onValueChange={setShareName} disabled={loading} />
            <ToggleRow label="Show my age" value={shareAge} onValueChange={setShareAge} disabled={loading} />
            <ToggleRow
              label="Show my gender"
              value={shareGender}
              onValueChange={setShareGender}
              disabled={loading}
            />
          </CollapsibleCard>

          {/* ---------- Auto-save status ---------- */}
          <View style={styles.statusRow}>
            {status === 'saving' ? (
              <>
                <ActivityIndicator size="small" color={theme.textSecondary} />
                <ThemedText type="small" themeColor="textSecondary">
                  Saving…
                </ThemedText>
              </>
            ) : status === 'error' ? (
              <ThemedText type="small" themeColor="danger">
                Couldn’t save — check your connection
              </ThemedText>
            ) : status === 'saved' ? (
              <ThemedText type="small" themeColor="success">
                ✓ All changes saved
              </ThemedText>
            ) : (
              <ThemedText type="small" themeColor="textSecondary">
                Changes save automatically
              </ThemedText>
            )}
          </View>

          {/* ---------- Account actions ---------- */}
          <Button title="Sign out" variant="secondary" onPress={signOut} />
          <Pressable
            onPress={deleteAccount}
            disabled={deleting}
            hitSlop={8}
            style={{ alignSelf: 'center', paddingVertical: Spacing.two }}>
            <ThemedText type="small" themeColor="danger">
              {deleting ? 'Deleting…' : 'Delete my account'}
            </ThemedText>
          </Pressable>

          <View style={{ height: keyboardSpacerHeight }} />
        </View>
      </ScrollView>
    </Screen>
  );
}

function HeroMenuButton() {
  const { open } = useSideNav();
  return (
    <Pressable onPress={open} hitSlop={10} style={styles.heroMenu}>
      <ThemedText style={{ fontSize: 22, color: '#fff' }}>☰</ThemedText>
    </Pressable>
  );
}

function HeroChip({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={styles.heroChip}>
      <ThemedText style={styles.heroChipText}>
        {icon}  {label}
      </ThemedText>
    </View>
  );
}

function StatTile({
  emoji,
  value,
  unit,
  label,
  accent,
  onPress,
}: {
  emoji: string;
  value: string;
  unit?: string;
  label: string;
  accent: string;
  onPress?: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.statTile,
        { backgroundColor: theme.background, borderColor: theme.border, opacity: pressed ? 0.85 : 1 },
      ]}>
      <View style={[styles.statIcon, { backgroundColor: accent + '22' }]}>
        <ThemedText style={{ fontSize: 16 }}>{emoji}</ThemedText>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <ThemedText type="title" style={{ fontSize: 20 }}>
          {value}
        </ThemedText>
        {unit ? (
          <ThemedText type="small" themeColor="textSecondary">
            {' '}
            {unit}
          </ThemedText>
        ) : null}
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </Pressable>
  );
}

function BmiMeter({ bmi }: { bmi: number | null }) {
  const theme = useTheme();
  const BMI_MIN = 15;
  const BMI_MAX = 40;
  const pct = bmi != null ? Math.min(100, Math.max(0, ((bmi - BMI_MIN) / (BMI_MAX - BMI_MIN)) * 100)) : null;
  const cat = bmi != null ? bmiCategory(bmi) : null;
  const catColor = cat ? bmiColor(cat, theme) : theme.textSecondary;

  return (
    <Card style={{ gap: Spacing.three }}>
      <View style={styles.bmiTop}>
        <View style={{ flex: 1 }}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            BODY MASS INDEX
          </ThemedText>
          <View style={styles.bmiValueRow}>
            <ThemedText type="title" style={{ fontSize: 38 }}>
              {bmi != null ? bmi.toFixed(1) : '—'}
            </ThemedText>
            {cat ? (
              <View style={[styles.catChip, { backgroundColor: catColor + '22' }]}>
                <ThemedText type="smallBold" style={{ color: catColor }}>
                  {cat}
                </ThemedText>
              </View>
            ) : null}
          </View>
        </View>
      </View>

      <View>
        <View style={styles.barWrap}>
          <View style={styles.bar}>
            <View style={{ flex: 3.5, backgroundColor: theme.primary }} />
            <View style={{ flex: 6.5, backgroundColor: theme.success }} />
            <View style={{ flex: 5, backgroundColor: theme.warning }} />
            <View style={{ flex: 10, backgroundColor: theme.danger }} />
          </View>
          {pct != null ? (
            <View style={[styles.marker, { left: `${pct}%` }]}>
              <View
                style={[styles.markerDot, { borderColor: catColor, backgroundColor: theme.background }]}
              />
            </View>
          ) : null}
        </View>
        <View style={styles.scaleLabels}>
          <ThemedText type="small" themeColor="textSecondary">
            15
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Healthy 18.5–24.9
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            40
          </ThemedText>
        </View>
      </View>

      {bmi == null ? (
        <ThemedText type="small" themeColor="textSecondary">
          Add your height & weight to see where you land.
        </ThemedText>
      ) : null}
    </Card>
  );
}

function CollapsibleCard({
  icon,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  icon: string;
  title: string;
  summary?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Card style={{ gap: open ? Spacing.three : 0 }}>
      <Pressable onPress={onToggle} style={styles.collapseHeader}>
        <View style={[styles.collapseIcon, { backgroundColor: theme.backgroundSelected }]}>
          <ThemedText style={{ fontSize: 16 }}>{icon}</ThemedText>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <ThemedText type="smallBold">{title}</ThemedText>
          {!open && summary ? (
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {summary}
            </ThemedText>
          ) : null}
        </View>
        <ThemedText type="smallBold" themeColor="textSecondary" style={{ fontSize: 18 }}>
          {open ? '⌄' : '›'}
        </ThemedText>
      </Pressable>
      {open ? <View style={{ gap: Spacing.three }}>{children}</View> : null}
    </Card>
  );
}

function ToggleRow({
  label,
  value,
  onValueChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.toggleRow}>
      <ThemedText type="smallBold" style={{ flex: 1 }}>
        {label}
      </ThemedText>
      <Switch value={value} onValueChange={onValueChange} disabled={disabled} trackColor={{ true: theme.primary }} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Hero
  hero: {
    borderBottomLeftRadius: 32,
    borderBottomRightRadius: 32,
    paddingBottom: Spacing.five,
    paddingHorizontal: Spacing.four,
  },
  heroMenu: { paddingTop: Spacing.two, paddingBottom: Spacing.one, alignSelf: 'flex-start' },
  heroInner: { alignItems: 'center', gap: Spacing.half, paddingTop: Spacing.one },
  avatarRing: {
    width: 92,
    height: 92,
    borderRadius: 46,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.two,
  },
  avatar: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 32, fontWeight: '800' },
  heroName: { color: '#fff', fontSize: 24, fontWeight: '800', textAlign: 'center' },
  heroEmail: { color: 'rgba(255,255,255,0.85)', fontSize: 13, textAlign: 'center' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: Spacing.two, marginTop: Spacing.two },
  heroChip: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: Spacing.two + 2,
    paddingVertical: Spacing.one + 1,
    borderRadius: 999,
  },
  heroChipText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // Floating stat tiles
  statsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    marginTop: -Spacing.four,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  statIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },

  body: { paddingHorizontal: Spacing.three, paddingTop: Spacing.three, gap: Spacing.three },

  // BMI meter
  bmiTop: { flexDirection: 'row', alignItems: 'flex-start' },
  bmiValueRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: 2 },
  catChip: { paddingHorizontal: Spacing.two, paddingVertical: 2, borderRadius: 999 },
  barWrap: { height: 22, justifyContent: 'center' },
  bar: { flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden' },
  marker: {
    position: 'absolute',
    width: 20,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ translateX: -10 }],
  },
  markerDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 4,
  },
  scaleLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.one + 2,
  },

  // Share CTA
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  ctaIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaTitle: { color: '#fff', fontSize: 16, fontWeight: '800' },
  ctaSub: { color: 'rgba(255,255,255,0.9)', fontSize: 12, marginTop: 1 },
  ctaArrow: { color: '#fff', fontSize: 24, fontWeight: '700' },

  // Editors
  nameRow: { flexDirection: 'row', gap: Spacing.two },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: Spacing.one },
  collapseHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  collapseIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    minHeight: 20,
  },
});
