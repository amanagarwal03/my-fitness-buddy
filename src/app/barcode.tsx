import { CameraView, useCameraPermissions } from 'expo-camera';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { lookupBarcode } from '@/lib/barcode';

export default function BarcodeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { mealType } = useLocalSearchParams<{ mealType?: string }>();
  const [permission, requestPermission] = useCameraPermissions();
  const [status, setStatus] = useState<string | null>(null);
  const handledRef = useRef(false);

  const onScanned = async (data: string) => {
    if (handledRef.current) return;
    handledRef.current = true;
    setStatus('Looking up product…');
    try {
      const analysis = await lookupBarcode(data);
      if (!analysis) {
        setStatus(`No match for ${data}. Try a photo scan instead, or scan another item.`);
        // Allow another scan after a short pause.
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
      setStatus(e instanceof Error ? e.message : String(e));
      setTimeout(() => {
        handledRef.current = false;
        setStatus(null);
      }, 2500);
    }
  };

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
              Allow camera access to scan product barcodes.
            </ThemedText>
            <Button title="Grant access" onPress={requestPermission} />
          </Card>
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
            {status ? (
              <ThemedText type="small" style={{ textAlign: 'center' }}>
                {status}
              </ThemedText>
            ) : (
              <ThemedText type="small" themeColor="textSecondary" style={{ textAlign: 'center' }}>
                Point the camera at a product barcode.
              </ThemedText>
            )}
          </Card>
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
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
