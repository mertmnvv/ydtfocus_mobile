import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { KVKK_TEXT, PRIVACY_POLICY, TERMS_OF_SERVICE } from '@/constants/legal-text';

type Props = {
  visible: boolean;
  onClose: () => void;
  initialTab?: 'privacy' | 'terms' | 'kvkk';
};

export function LegalModal({ visible, onClose, initialTab = 'privacy' }: Props) {
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState<'privacy' | 'terms' | 'kvkk'>(initialTab);



  const getLegalText = () => {
    switch (activeTab) {
      case 'privacy':
        return PRIVACY_POLICY;
      case 'terms':
        return TERMS_OF_SERVICE;
      case 'kvkk':
        return KVKK_TEXT;
      default:
        return PRIVACY_POLICY;
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <ThemedView
          type="bgCard"
          style={[
            styles.card,
            {
              backgroundColor: 'rgba(26, 26, 26, 0.95)',
              borderColor: theme.accent,
              borderWidth: 1.5,
              shadowColor: theme.accent,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.3,
              shadowRadius: 15,
              elevation: 8,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <ThemedText type="subtitle" themeColor="accent" style={styles.title}>
              Hukuki Belgeler
            </ThemedText>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <MaterialCommunityIcons name="close" size={24} color={theme.accent} />
            </Pressable>
          </View>

          {/* Tabs */}
          <View style={styles.tabsRow}>
            {(
              [
                { id: 'privacy', label: 'Gizlilik' },
                { id: 'terms', label: 'Koşullar' },
                { id: 'kvkk', label: 'KVKK' },
              ] as const
            ).map((tab) => {
              const active = activeTab === tab.id;
              return (
                <Pressable
                  key={tab.id}
                  onPress={() => setActiveTab(tab.id)}
                  style={({ pressed }) => [
                    styles.tabButton,
                    {
                      backgroundColor: active ? theme.accent : 'transparent',
                      borderColor: active ? theme.accent : theme.border,
                      transform: [{ scale: pressed ? 0.95 : 1 }],
                    },
                  ]}
                >
                  <ThemedText
                    type="smallBold"
                    themeColor={active ? 'bg' : 'textMuted'}
                  >
                    {tab.label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </View>

          {/* Scrollable Text Content */}
          <ScrollView
            style={[styles.scroll, { backgroundColor: theme.bgElevated, borderColor: theme.border }]}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator
          >
            <ThemedText style={styles.legalText} type="small">
              {getLegalText()}
            </ThemedText>
          </ScrollView>

          {/* Bottom Close Button */}
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.doneButton,
              {
                backgroundColor: theme.accent,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              },
            ]}
          >
            <ThemedText type="smallBold" themeColor="bg">
              Kabul Ediyorum & Kapat
            </ThemedText>
          </Pressable>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  card: {
    borderRadius: 24,
    padding: Spacing.four,
    gap: Spacing.three,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.one,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
  },
  closeButton: {
    padding: 4,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginBottom: Spacing.one,
  },
  tabButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    maxHeight: 400,
  },
  scrollContent: {
    padding: Spacing.three,
  },
  legalText: {
    lineHeight: 20,
    letterSpacing: 0.2,
  },
  doneButton: {
    borderRadius: 12,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
});