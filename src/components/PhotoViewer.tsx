/**
 * Full-screen photo viewer for product pages.
 * Tap a product photo → it opens large over the screen. Swipe left/right for more photos,
 * pinch or double-tap to zoom, drag to look around when zoomed, swipe down (or ✕) to close.
 */
import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, StatusBar, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { interpolate, SharedValue, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { scheduleOnRN } from 'react-native-worklets';
import { fonts } from '../theme';
import { Img } from './ui';

const MAX_ZOOM = 4;
const SPRING = { damping: 20, stiffness: 200 };

function clampW(v: number, min: number, max: number) {
  'worklet';
  return Math.min(max, Math.max(min, v));
}

/** One photo that can be zoomed and panned. Reports when it is zoomed so paging can pause. */
function ZoomPhoto({ uri, w, h, onZoomed, onClose, dragY }: { uri: string; w: number; h: number; onZoomed: (z: boolean) => void; onClose: () => void; dragY: SharedValue<number> }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);
  const [zoomed, setZoomed] = useState(false);

  const report = useCallback(
    (z: boolean) => {
      setZoomed(z);
      onZoomed(z);
    },
    [onZoomed],
  );

  // Keep the photo from being dragged off screen when zoomed.
  const bound = (s: number) => {
    'worklet';
    return { x: (w * (s - 1)) / 2, y: (h * (s - 1)) / 2 };
  };

  const reset = () => {
    'worklet';
    scale.value = withSpring(1, SPRING);
    savedScale.value = 1;
    tx.value = withSpring(0, SPRING);
    ty.value = withSpring(0, SPRING);
    savedX.value = 0;
    savedY.value = 0;
    scheduleOnRN(report, false);
  };

  const gesture = useMemo(() => {
    const pinch = Gesture.Pinch()
      .onUpdate((e) => {
        scale.value = clampW(savedScale.value * e.scale, 0.8, MAX_ZOOM + 0.5);
      })
      .onEnd(() => {
        if (scale.value <= 1.05) return reset();
        const s = clampW(scale.value, 1, MAX_ZOOM);
        scale.value = withSpring(s, SPRING);
        savedScale.value = s;
        const b = bound(s);
        tx.value = withSpring(clampW(tx.value, -b.x, b.x), SPRING);
        ty.value = withSpring(clampW(ty.value, -b.y, b.y), SPRING);
        savedX.value = clampW(tx.value, -b.x, b.x);
        savedY.value = clampW(ty.value, -b.y, b.y);
        scheduleOnRN(report, true);
      });

    const doubleTap = Gesture.Tap()
      .numberOfTaps(2)
      .maxDuration(300)
      .onEnd((e) => {
        if (savedScale.value > 1) return reset();
        const s = 2.5;
        // Zoom towards where they tapped.
        const b = bound(s);
        const x = clampW((w / 2 - e.x) * (s - 1), -b.x, b.x);
        const y = clampW((h / 2 - e.y) * (s - 1), -b.y, b.y);
        scale.value = withSpring(s, SPRING);
        tx.value = withSpring(x, SPRING);
        ty.value = withSpring(y, SPRING);
        savedScale.value = s;
        savedX.value = x;
        savedY.value = y;
        scheduleOnRN(report, true);
      });

    // Zoomed: drag to look around. Not zoomed: drag down to close.
    const pan = zoomed
      ? Gesture.Pan()
          .averageTouches(true)
          .onUpdate((e) => {
            const b = bound(scale.value);
            tx.value = clampW(savedX.value + e.translationX, -b.x - 40, b.x + 40);
            ty.value = clampW(savedY.value + e.translationY, -b.y - 40, b.y + 40);
          })
          .onEnd(() => {
            const b = bound(scale.value);
            const x = clampW(tx.value, -b.x, b.x);
            const y = clampW(ty.value, -b.y, b.y);
            tx.value = withSpring(x, SPRING);
            ty.value = withSpring(y, SPRING);
            savedX.value = x;
            savedY.value = y;
          })
      : Gesture.Pan()
          .activeOffsetY([-14, 14])
          .failOffsetX([-14, 14])
          .onUpdate((e) => {
            dragY.value = e.translationY;
          })
          .onEnd((e) => {
            if (Math.abs(e.translationY) > 120 || Math.abs(e.velocityY) > 900) {
              dragY.value = withTiming(e.translationY > 0 ? h : -h, { duration: 180 });
              scheduleOnRN(onClose);
            } else dragY.value = withSpring(0, SPRING);
          });

    return Gesture.Simultaneous(pinch, pan, doubleTap);
  }, [zoomed, w, h, report, onClose]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }, { translateY: ty.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <View style={{ width: w, height: h, overflow: 'hidden', justifyContent: 'center', alignItems: 'center' }} collapsable={false}>
        <Animated.View style={[{ width: w, height: h }, style]}>
          <Img source={uri} size={Math.min(1600, Math.round(w * 2.5))} style={{ width: w, height: h }} contentFit="contain" transition={120} />
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

export function PhotoViewer({ images, start, visible, onClose }: { images: string[]; start: number; visible: boolean; onClose: (index: number) => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [idx, setIdx] = useState(start);
  const [paging, setPaging] = useState(true);
  const list = useRef<FlatList<string>>(null);
  const thumbs = useRef<FlatList<string>>(null);
  const dragY = useSharedValue(0);
  const idxRef = useRef(start);

  useEffect(() => {
    if (!visible) return;
    dragY.value = 0;
    setIdx(start);
    idxRef.current = start;
    setPaging(true);
  }, [visible, start]);

  const close = useCallback(() => onClose(idxRef.current), [onClose]);
  const onZoomed = useCallback((z: boolean) => setPaging(!z), []);

  const go = (i: number) => {
    if (i < 0 || i >= images.length) return;
    list.current?.scrollToIndex({ index: i, animated: true });
    setIdx(i);
    idxRef.current = i;
  };

  const bg = useAnimatedStyle(() => ({ opacity: interpolate(Math.abs(dragY.value), [0, height * 0.4], [1, 0.2], 'clamp') }));
  const move = useAnimatedStyle(() => ({ transform: [{ translateY: dragY.value }, { scale: interpolate(Math.abs(dragY.value), [0, height], [1, 0.85], 'clamp') }] }));
  const chrome = useAnimatedStyle(() => ({ opacity: interpolate(Math.abs(dragY.value), [0, 80], [1, 0], 'clamp') }));

  if (!images.length) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        {visible && Platform.OS !== 'web' && <StatusBar barStyle="light-content" />}
        <Animated.View style={[{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000' }, bg]} />
        <Animated.View style={[{ flex: 1 }, move]}>
          <FlatList
            ref={list}
            data={images}
            keyExtractor={(u, i) => `${i}:${u}`}
            horizontal
            pagingEnabled
            scrollEnabled={paging && images.length > 1}
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={Math.min(start, images.length - 1)}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            initialNumToRender={2}
            windowSize={3}
            onMomentumScrollEnd={(e) => {
              const i = Math.round(e.nativeEvent.contentOffset.x / width);
              setIdx(i);
              idxRef.current = i;
              thumbs.current?.scrollToIndex({ index: i, animated: true, viewPosition: 0.5 });
            }}
            renderItem={({ item }) => <ZoomPhoto uri={item} w={width} h={height} onZoomed={onZoomed} onClose={close} dragY={dragY} />}
          />
        </Animated.View>

        {/* Top: counter and close */}
        <Animated.View pointerEvents="box-none" style={[{ position: 'absolute', top: insets.top + 10, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, chrome]}>
          <View style={{ backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 13, color: '#fff' }}>
              {idx + 1} / {images.length}
            </Text>
          </View>
          <Pressable onPress={close} hitSlop={12} accessibilityLabel="Close photos" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' }}>
            <MaterialCommunityIcons name="close" size={22} color="#fff" />
          </Pressable>
        </Animated.View>

        {/* Bottom: thumbnails */}
        {images.length > 1 && (
          <Animated.View style={[{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 14 }, chrome]}>
            <FlatList
              ref={thumbs}
              data={images}
              horizontal
              keyExtractor={(u, i) => `t${i}:${u}`}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
              getItemLayout={(_, i) => ({ length: 64, offset: 16 + 64 * i, index: i })}
              onScrollToIndexFailed={() => {}}
              renderItem={({ item, index }) => (
                <Pressable onPress={() => go(index)} style={{ width: 56, height: 56, borderRadius: 10, overflow: 'hidden', borderWidth: 2, borderColor: index === idx ? '#F3D48B' : 'transparent', opacity: index === idx ? 1 : 0.6, backgroundColor: '#1a1a1a' }}>
                  <Img source={item} size={120} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                </Pressable>
              )}
            />
          </Animated.View>
        )}
      </GestureHandlerRootView>
    </Modal>
  );
}
