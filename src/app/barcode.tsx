import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Field, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { lookupBarcode } from '@/lib/barcode';

// Live camera scanning relies on the browser's BarcodeDetector API, which most
// desktop browsers and iOS Safari don't ship — so on web we lead with manual
// entry (type the number under the barcode) instead of a camera that never fires.
const isWeb = Platform.OS === 'web';

export default function BarcodeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { mealType } = useLocalSearchParams<{ mealType?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<string | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [looking, setLooking] = useState(false);
  const handledRef = useRef(false);

  const onScanned = async (data: string) => {
    if (handledRef.current) return;
    handledRef.current = true;
    setLooking(true);
    setStatus('Looking up product…');
    try {
      const analysis = await lookupBarcode(data);
      if (!analysis) {
        setLooking(false);
        setStatus(`No food found for barcode ${data}. It may not be a food product — try a photo scan, or enter another barcode.`);
        // Allow another scan/lookup after a short pause.
        setTimeout(() => {
          handledRef.current = false;
          setStatus(null);
        }, 2500);
        return;
      }
      router.replace({
        pathname: '/result',
        params: { analysis: JSON.stringify(analysis), mealType: mealType ?? '' },
      });
    } catch (e) {
      setLooking(false);
      setStatus(e instanceof Error ? e.message : String(e));
      setTimeout(() => {
        handledRef.current = false;
        setStatus(null);
      }, 2500);
    }
  };

  const submitManual = () => {
    const code = manualCode.trim();
    if (!/^\d{6,}$/.test(code)) {
      setStatus('Enter the numeric barcode (at least 6 digits).');
      return;
    }
    handledRef.current = false;
    onScanned(code);
  };

  // ── Web (and any non-camera fallback): manual entry only ──────────────────
  if (isWeb) {
    return (
      <Screen edges={['bottom']}>
        <Stack.Screen options={{ title: 'Scan barcode' }} />
        <View style={styles.webWrap}>
          <ManualEntry
            value={manualCode}
            onChange={setManualCode}
            onSubmit={submitManual}
            looking={looking}
            status={status}
          />
          <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
            Live camera scanning isn’t supported in every browser — manual entry works everywhere.
          </ThemedText>
        </View>
      </Screen>
    );
  }

  // ── Native: live camera scanner, with manual entry as a fallback ──────────
  if (!permission) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Scan barcode' }} />
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen edges={['bottom']}>
        <Stack.Screen options={{ title: 'Scan barcode' }} />
        <View style={styles.center}>
          <Card style={{ gap: Spacing.three }}>
            <ThemedText type="smallBold">Camera access needed</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Allow camera access to scan product barcodes — or enter the number manually below.
            </ThemedText>
            <Button title="Grant access" onPress={requestPermission} />
          </Card>
          <View style={{ height: Spacing.three }} />
          <ManualEntry
            value={manualCode}
            onChange={setManualCode}
            onSubmit={submitManual}
            looking={looking}
            status={status}
          />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={[]}>
      <Stack.Screen options={{ title: 'Scan barcode' }} />
      <View style={styles.fill}>
        <CameraView
          style={StyleSheet.absoluteFill}
          barcodeScannerSettings={{
            barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'],
          }}
          onBarcodeScanned={({ data }) => onScanned(data)}
        />
        <View style={styles.overlay} pointerEvents="none">
          <View style={[styles.reticle, { borderColor: theme.primary }]} />
        </View>
        <View style={styles.statusBar}>
          <Card style={{ alignItems: 'center', gap: Spacing.two }}>
            <ThemedText type="small" themeColor={status ? 'text' : 'textSecondary'} style={{ textAlign: 'center' }}>
              {status ?? 'Point the camera at a product barcode.'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              — or —
            </ThemedText>
            <Field
              value={manualCode}
              onChangeText={(t) => setManualCode(t.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              inputMode="numeric"
              placeholder="Type the barcode number"
              maxLength={14}
              editable={!looking}
              style={{ alignSelf: 'stretch' }}
            />
            <Button title="Look up" onPress={submitManual} loading={looking} style={{ alignSelf: 'stretch' }} />
          </Card>
        </View>
      </View>
    </Screen>
  );
}

// Defined at module scope (not inside the screen) so it keeps a stable identity
// across renders — otherwise the TextInput remounts on every keystroke and the
// keyboard closes after each digit.
function ManualEntry({
  value,
  onChange,
  onSubmit,
  looking,
  status,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  looking: boolean;
  status: string | null;
}) {
  return (
    <Card style={{ gap: Spacing.two }}>
      <ThemedText type="smallBold">Enter the barcode number</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Type the digits printed under the barcode and we’ll look it up.
      </ThemedText>
      <Field
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^0-9]/g, ''))}
        keyboardType="number-pad"
        inputMode="numeric"
        placeholder="e.g. 5012345678900"
        maxLength={14}
        editable={!looking}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
      />
      <Button title="Look up product" onPress={onSubmit} loading={looking} />
      {status ? (
        <ThemedText type="small" style={{ textAlign: 'center' }}>
          {status}
        </ThemedText>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', padding: Spacing.four },
  webWrap: { padding: Spacing.three, gap: Spacing.three },
  fill: { flex: 1 },
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  reticle: {
    width: '70%',
    height: 140,
    borderWidth: 3,
    borderRadius: Spacing.three,
  },
  statusBar: { position: 'absolute', left: Spacing.three, right: Spacing.three, bottom: Spacing.four },
});
