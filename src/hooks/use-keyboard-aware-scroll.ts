import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Keyboard,
  Platform,
  type NativeSyntheticEvent,
  type ScrollView,
  type TargetedEvent,
} from 'react-native';

// The scroll responder method that brings a focused node above the keyboard.
// It's not in the public typings, so we describe just what we call.
type KeyboardScrollResponder = {
  scrollResponderScrollNativeHandleToKeyboard?: (
    nodeHandle: number,
    additionalOffset?: number,
    preventNegativeScrollOffset?: boolean,
  ) => void;
};

/**
 * Keeps a focused TextInput visible above the on-screen keyboard inside a
 * ScrollView — on both iOS and Android (RN only auto-adjusts on iOS).
 *
 * Usage:
 *   const { scrollRef, handleInputFocus, keyboardSpacerHeight } = useKeyboardAwareScroll();
 *   <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled" ...>
 *     <TextInput onFocus={handleInputFocus} />        // or <Field onFocus={...} />
 *     <View style={{ height: keyboardSpacerHeight }} /> // room to scroll the last field up
 *   </ScrollView>
 *
 * `extraOffset` is the gap (px) left between the field and the keyboard top.
 */
export function useKeyboardAwareScroll(extraOffset = 28) {
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardSpacerHeight, setKeyboardSpacerHeight] = useState(0);
  // On web there is no RN soft keyboard, and mobile browsers already scroll the
  // focused input into view. Our manual scrolling fights the browser (causing
  // jank / the page auto-scrolling away from the field), so disable it on web.
  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    if (isWeb) return;
    const show = Keyboard.addListener('keyboardDidShow', (e) =>
      setKeyboardSpacerHeight(e.endCoordinates.height),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardSpacerHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [isWeb]);

  const handleInputFocus = useCallback(
    (e: NativeSyntheticEvent<TargetedEvent>) => {
      if (isWeb) return;
      const node = e.nativeEvent.target;
      if (node == null) return;
      // Delay so the keyboard frame is registered first (Android only emits
      // keyboardDidShow, which can land after the focus event).
      setTimeout(() => {
        const responder = scrollRef.current?.getScrollResponder?.() as
          | KeyboardScrollResponder
          | undefined;
        responder?.scrollResponderScrollNativeHandleToKeyboard?.(node, extraOffset, true);
      }, 80);
    },
    [extraOffset, isWeb],
  );

  return { scrollRef, handleInputFocus, keyboardSpacerHeight };
}
