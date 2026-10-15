import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Linking, Modal, Platform, Pressable, Text, useWindowDimensions, View } from 'react-native';
import Animated, { BounceIn, FadeIn, FadeInDown, FadeInUp, FlipInXUp, PinwheelIn, SlideInDown, SlideInUp, ZoomIn } from 'react-native-reanimated';
import { create } from 'zustand';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_VERSION, compareVersions, isLive, useContent, useRemote } from '../config/remote';
import { openLink } from '../lib/links';
import { useApp } from '../store/app';
import { fonts } from '../theme';
import { RosierLogo } from './Logo';
import { Button, Img } from './ui';

const DAY = 24 * 60 * 60 * 1000;

/** Admin preview: "Show popup in preview" bumps this to show the popup again. */
export const useTryPopup = create<{ n: number }>(() => ({ n: 0 }));

function clamp(v: unknown, def: number, min: number, max: number) {
  const n = Number(v);
  return Number.isFinite(n) && v !== '' && v != null ? Math.min(max, Math.max(min, n)) : def;
}

/** The popup's entrance animation chosen in the admin panel. Unknown values fall back to zoom. */
function popupEntering(kind: string | undefined, speed: number) {
  const ms = (base: number) => Math.round(base / speed);
  try {
    switch (kind) {
      case 'none':
        return undefined;
      case 'fade':
        return FadeIn.duration(ms(350));
      case 'pop':
        return ZoomIn.duration(ms(220));
      case 'slideUp':
        return SlideInDown.duration(ms(420));
      case 'slideDown':
        return SlideInUp.duration(ms(420));
      case 'bounce':
        return BounceIn.duration(ms(650));
      case 'flip':
        return FlipInXUp.duration(ms(500));
      case 'rotate':
        return PinwheelIn.duration(ms(500));
      case 'fadeUp':
        return FadeInUp.duration(ms(400));
      default:
        return ZoomIn.springify().damping(14).mass(1 / speed);
    }
  } catch {
    return FadeIn;
  }
}

/** Full-screen notice used for maintenance and forced updates. */
function Blocker({ icon, title, message, image, action }: { icon: any; title: string; message: string; image?: string; action?: { label: string; onPress: () => void } }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  return (
    <Animated.View entering={FadeIn} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#FBEBD8', alignItems: 'center', justifyContent: 'center', padding: 28, paddingTop: insets.top + 28, zIndex: 100 }}>
      <RosierLogo width={120} color="#3E2415" />
      {image ? (
        <Img source={image} size={width} style={{ width: width - 56, height: (width - 56) * 0.75, marginTop: 24, borderRadius: 20 }} contentFit="contain" />
      ) : (
        <Animated.View entering={ZoomIn.springify()} style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: '#F4DFC0', alignItems: 'center', justifyContent: 'center', marginTop: 28 }}>
          <MaterialCommunityIcons name={icon} size={48} color="#A56312" />
        </Animated.View>
      )}
      <Text style={{ fontFamily: fonts.serif, fontSize: 26, color: '#3E2415', textAlign: 'center', marginTop: 22 }}>{title}</Text>
      <Text style={{ fontFamily: fonts.sans, fontSize: 15, color: '#7A6453', textAlign: 'center', marginTop: 8, lineHeight: 22 }}>{message}</Text>
      {action && <Button label={action.label} onPress={action.onPress} style={{ alignSelf: 'stretch', marginTop: 28 }} />}
    </Animated.View>
  );
}

function storeUrl(u: { androidUrl: string; iosUrl: string }) {
  return Platform.OS === 'ios' ? u.iosUrl : u.androidUrl;
}

/**
 * Everything the admin panel can switch on app-wide:
 * maintenance mode, update prompts, the launch popup and the "preview" banner.
 */
export function RemoteGate() {
  const general = useContent('general');
  const popup = useContent('popup');
  const preview = useRemote((s) => s.preview);
  const endPreview = useRemote((s) => s.endPreview);
  const popupSeen = useRemote((s) => s.popupSeen);
  const markPopup = useRemote((s) => s.markPopup);
  const onboarded = useApp((s) => s.onboarded);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [updateDismissed, setUpdateDismissed] = useState(false);
  const [popupReady, setPopupReady] = useState(false);
  const [popupClosed, setPopupClosed] = useState(false);
  const tryN = useTryPopup((s) => s.n);
  const [trying, setTrying] = useState(false);
  const delayMs = clamp((popup as any).delaySeconds, 1.5, 0, 30) * 1000;

  // Let the home screen settle before a popup appears.
  useEffect(() => {
    if (!onboarded) return;
    const id = setTimeout(() => setPopupReady(true), delayMs);
    return () => clearTimeout(id);
  }, [onboarded]);

  // Admin preview: show the popup now, whatever its schedule or "how often" says.
  useEffect(() => {
    if (!tryN) return;
    setTrying(false);
    const id = setTimeout(() => setTrying(true), 150);
    return () => clearTimeout(id);
  }, [tryN]);

  const outdated = !!general.update.minVersion && compareVersions(APP_VERSION, general.update.minVersion) < 0;
  const url = storeUrl(general.update);

  if (general.maintenance.enabled && !preview) {
    return <Blocker icon="tools" title={general.maintenance.title} message={general.maintenance.message} image={general.maintenance.image} />;
  }
  if (outdated && general.update.force) {
    return <Blocker icon="cellphone-arrow-down" title={general.update.title} message={general.update.message} action={url ? { label: 'Update now', onPress: () => Linking.openURL(url) } : undefined} />;
  }

  const last = popupSeen[popup.id] ?? 0;
  const due = popup.frequency === 'every_launch' ? true : popup.frequency === 'daily' ? Date.now() - last > DAY : !last;
  const hasContent = !!popup.image || !!popup.title;
  const showPopup = (trying && hasContent) || (onboarded && popupReady && !popupClosed && !!popup.enabled && !!popup.id && isLive(popup) && due && hasContent);
  const closePopup = () => {
    if (trying) return setTrying(false);
    markPopup(popup.id);
    setPopupClosed(true);
  };
  const p = popup as any;
  const entering = popupEntering(p.animation, clamp(p.animSpeed, 1, 0.25, 4));
  const shade = clamp(p.backdrop, 60, 0, 95) / 100;
  const tapOutside = p.closeOnTapOutside !== false;
  const showUpdate = outdated && !updateDismissed && onboarded && !showPopup;

  return (
    <>
      {preview && (
        <Animated.View entering={FadeInDown} pointerEvents="box-none" style={{ position: 'absolute', left: 12, right: 12, bottom: insets.bottom + 92, zIndex: 90, alignItems: 'center' }}>
          <Pressable onPress={endPreview} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#3E2415', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 8, elevation: 6 }}>
            <MaterialCommunityIcons name="eye-outline" size={16} color="#F3D48B" />
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12, color: '#FBE6CF' }}>Preview of unpublished changes · Tap to exit</Text>
          </Pressable>
        </Animated.View>
      )}

      <Modal visible={showPopup} transparent animationType={p.animation === 'none' ? 'none' : 'fade'} onRequestClose={closePopup}>
        <Pressable onPress={tapOutside ? closePopup : undefined} style={{ flex: 1, backgroundColor: `rgba(30,18,10,${shade})`, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <Animated.View key={`${tryN}:${p.animation}`} entering={entering} style={{ width: Math.min(width - 48, 380), backgroundColor: '#FFFBF5', borderRadius: 26, overflow: 'hidden' }}>
            <Pressable onPress={() => {}}>
              {!!popup.image && (
                <Pressable
                  onPress={() => {
                    closePopup();
                    openLink(popup.link);
                  }}
                >
                  <Img source={popup.image} size={400} style={{ width: '100%', aspectRatio: popup.title || popup.body ? 1.25 : 0.8 }} contentFit="cover" />
                </Pressable>
              )}
              {(!!popup.title || !!popup.body || !!popup.buttonLabel) && (
                <View style={{ padding: 20 }}>
                  {!!popup.title && <Text style={{ fontFamily: fonts.serif, fontSize: 22, color: '#3E2415' }}>{popup.title}</Text>}
                  {!!popup.body && <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: '#7A6453', marginTop: 6, lineHeight: 21 }}>{popup.body}</Text>}
                  {!!popup.buttonLabel && !!popup.link && (
                    <Button
                      label={popup.buttonLabel}
                      style={{ marginTop: 16 }}
                      onPress={() => {
                        closePopup();
                        openLink(popup.link);
                      }}
                    />
                  )}
                </View>
              )}
              <Pressable onPress={closePopup} hitSlop={10} style={{ position: 'absolute', top: 12, right: 12, width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center', justifyContent: 'center' }}>
                <MaterialCommunityIcons name="close" size={20} color="#3E2415" />
              </Pressable>
            </Pressable>
          </Animated.View>
        </Pressable>
      </Modal>

      <Modal visible={showUpdate} transparent animationType="fade" onRequestClose={() => setUpdateDismissed(true)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(30,18,10,0.6)', justifyContent: 'flex-end' }}>
          <Animated.View entering={FadeInDown.springify().damping(16)} style={{ backgroundColor: '#FFFBF5', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: insets.bottom + 24, alignItems: 'center' }}>
            <MaterialCommunityIcons name="cellphone-arrow-down" size={44} color="#A56312" />
            <Text style={{ fontFamily: fonts.serif, fontSize: 22, color: '#3E2415', marginTop: 8, textAlign: 'center' }}>{general.update.title}</Text>
            <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: '#7A6453', marginTop: 6, textAlign: 'center', lineHeight: 21 }}>{general.update.message}</Text>
            {!!url && <Button label="Update now" onPress={() => Linking.openURL(url)} style={{ alignSelf: 'stretch', marginTop: 18 }} />}
            <Pressable onPress={() => setUpdateDismissed(true)} style={{ padding: 12, marginTop: 4 }}>
              <Text style={{ fontFamily: fonts.sansMedium, color: '#8B7B6E' }}>Later</Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}
