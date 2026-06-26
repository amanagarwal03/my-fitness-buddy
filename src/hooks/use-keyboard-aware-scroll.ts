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
  const isWeb = Platform.OS === 'web';

  // On native we add a "drag down to dismiss" gesture; on web that same gesture
  // (react-native-web blurs the input the moment you start scrolling) closes the
  // mobile browser keyboard on every scroll, so leave the keyboard alone there.
  const keyboardDismissMode: 'none' | 'on-drag' = isWeb ? 'none' : 'on-drag';

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
      if (isWeb) {
        // The mobile browser keyboard overlays the page without resizing the RN
        // ScrollView, so a field near the bottom ends up hidden behind it. Center
        // the focused input in the viewport once the keyboard has animated in.
        const node = (e as unknown as { target?: { scrollIntoView?: (opts: object) => void } })
          .target;
        const scrollIntoView = node?.scrollIntoView;
        if (scrollIntoView) {
          setTimeout(() => scrollIntoView.call(node, { block: 'center', behavior: 'smooth' }), 300);
        }
        return;
      }
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

  return { scrollRef, handleInputFocus, keyboardSpacerHeight, keyboardDismissMode };
}
