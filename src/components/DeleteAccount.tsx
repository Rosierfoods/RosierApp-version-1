/** "Delete my account" — confirmation sheet (Google Play & App Store requirement). */
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useContent } from '../config/remote';
import { deleteMyAccount } from '../store/auth';
import { fonts, useTheme } from '../theme';
import { toast } from './Toast';

export function DeleteAccountSheet({ onClose }: { onClose: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const c = (useContent('legal' as any) ?? {}) as any;
  const days = String(c.deletionDays || 7);
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const ready = typed.trim().toUpperCase() === 'DELETE';

  const go = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setErr('');
    try {
      await deleteMyAccount(reason);
      onClose();
      toast(`Request received. We’ll delete your account within ${days} days.`, 'ok');
      router.replace('/home');
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={{ backgroundColor: t.cardStrong, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' }}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Ionicons name="warning-outline" size={24} color="#C0392B" />
              <Text style={{ flex: 1, fontFamily: fonts.serif, fontSize: 21, color: t.heading }}>{c.deleteTitle || 'Delete my account'}</Text>
              <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
                <Ionicons name="close" size={24} color={t.textSoft} />
              </Pressable>
            </View>
            <Text style={{ fontFamily: fonts.sans, fontSize: 14, lineHeight: 21, color: t.textSoft, marginTop: 10 }}>{String(c.deleteBody || '').replaceAll('{days}', days)}</Text>
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: t.textMute, marginTop: 16, marginBottom: 6 }}>Why are you leaving? (optional)</Text>
            <TextInput value={reason} onChangeText={setReason} multiline maxLength={500} placeholder="Tell us how we can do better" placeholderTextColor={t.textMute} style={{ minHeight: 80, textAlignVertical: 'top', borderRadius: 12, borderWidth: 1, borderColor: t.border, backgroundColor: t.card, padding: 12, fontFamily: fonts.sans, color: t.text }} />
            <Text style={{ fontFamily: fonts.sansMedium, fontSize: 12.5, color: t.textMute, marginTop: 16, marginBottom: 6 }}>Type DELETE to confirm</Text>
            <TextInput value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} placeholder="DELETE" placeholderTextColor={t.textMute} style={{ height: 50, borderRadius: 12, borderWidth: 1.5, borderColor: ready ? '#C0392B' : t.border, backgroundColor: t.card, paddingHorizontal: 14, fontFamily: fonts.sansSemi, color: t.text, letterSpacing: 2 }} />
            {!!err && <Text style={{ fontFamily: fonts.sans, color: '#C0392B', marginTop: 10 }}>{err}</Text>}
            <Pressable onPress={go} disabled={!ready || busy} style={{ marginTop: 18, height: 52, borderRadius: 16, backgroundColor: '#C0392B', opacity: ready ? 1 : 0.45, alignItems: 'center', justifyContent: 'center' }}>
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ fontFamily: fonts.sansSemi, fontSize: 16, color: '#fff' }}>Delete my account</Text>}
            </Pressable>
            <Pressable onPress={onClose} style={{ alignItems: 'center', padding: 14 }}>
              <Text style={{ fontFamily: fonts.sansMedium, color: t.textSoft }}>Keep my account</Text>
            </Pressable>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
