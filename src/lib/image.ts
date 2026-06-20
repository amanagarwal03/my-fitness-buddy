import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

export type CapturedImage = {
  uri: string;
  base64: string;
};

/** Downscale to ~1024px wide and re-encode as JPEG with base64, to keep the
 *  payload (and Claude vision token cost) reasonable. */
async function processToBase64(uri: string): Promise<CapturedImage> {
  const context = ImageManipulator.manipulate(uri);
  context.resize({ width: 1024 });
  const ref = await context.renderAsync();
  const result = await ref.saveAsync({
    base64: true,
    compress: 0.7,
    format: SaveFormat.JPEG,
  });
  return { uri: result.uri, base64: result.base64 ?? '' };
}

/** Open the camera. Returns null if the user cancels or denies permission. */
export async function captureFromCamera(): Promise<CapturedImage | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) {
    throw new Error('Camera permission is required to take a photo.');
  }
  const res = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.8,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  return processToBase64(res.assets[0].uri);
}

/** Pick from the photo library. Returns null if the user cancels. */
export async function pickFromLibrary(): Promise<CapturedImage | null> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
  });
  if (res.canceled || !res.assets?.[0]) return null;
  return processToBase64(res.assets[0].uri);
}
