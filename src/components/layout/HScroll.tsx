import React, { useCallback, useRef } from 'react';
import { ScrollView, ScrollViewProps, StyleProp, ViewStyle } from 'react-native';

type Props = ScrollViewProps & {
  ar: boolean;
  contentContainerStyle?: StyleProp<ViewStyle>;
  children: React.ReactNode;
};

/**
 * Horizontal row that starts at the reading edge.
 *
 * The app mirrors rows manually with `row-reverse` (it does not force the
 * native RTL layout direction), so a plain horizontal ScrollView in Arabic
 * opens at offset 0 — the far end of the row — and item 1 sits off-screen on
 * the right. In Arabic this jumps to the end once on first layout, so item 1
 * is visible at the right edge.
 */
export default function HScroll({ ar, contentContainerStyle, children, onContentSizeChange, ...rest }: Props) {
  const ref = useRef<ScrollView>(null);
  const positioned = useRef(false);

  const handleContentSize = useCallback(
    (w: number, h: number) => {
      if (ar && !positioned.current && w > 0) {
        positioned.current = true;
        ref.current?.scrollToEnd({ animated: false });
      }
      onContentSizeChange?.(w, h);
    },
    [ar, onContentSizeChange],
  );

  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      onContentSizeChange={handleContentSize}
      contentContainerStyle={[contentContainerStyle, { flexDirection: ar ? 'row-reverse' : 'row' }]}
      {...rest}
    >
      {children}
    </ScrollView>
  );
}
