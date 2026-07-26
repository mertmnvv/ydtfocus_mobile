import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { getGrammarTopics, type GrammarTopic } from '@/lib/firestore';
import { useTheme } from '@/hooks/use-theme';

// Gramer Ansiklopedisi — web'deki GrammarPanel.js ile ayni: statik,
// admin tarafindan yazilan icerik (grammarTopics koleksiyonu), AI
// uretimi yok. Basit acilir-kapanir liste.
export default function GrammarScreen() {
  const theme = useTheme();
  const [topics, setTopics] = useState<GrammarTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    getGrammarTopics()
      .then(setTopics)
      .finally(() => setLoading(false));
  }, []);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <ThemedText type="smallBold" themeColor="accent">
              ‹ Geri
            </ThemedText>
          </Pressable>
          <ThemedText type="subtitle" style={styles.title}>
            Gramer Ansiklopedisi
          </ThemedText>
        </View>

        {loading && (
          <View style={styles.centerBox}>
            <ActivityIndicator color={theme.accent} />
          </View>
        )}

        {!loading && topics.length === 0 && (
          <ThemedText themeColor="textMuted" style={styles.centerBox}>
            Henüz gramer içeriği eklenmemiş.
          </ThemedText>
        )}

        <ScrollView contentContainerStyle={styles.list}>
          {topics.map((topic) => {
            const expanded = expandedId === topic.id;
            return (
              <ThemedView key={topic.id} type="bgCard" style={[styles.topicCard, { borderColor: theme.border }]}>
                <Pressable onPress={() => setExpandedId(expanded ? null : topic.id)} style={styles.topicHeader}>
                  <ThemedText type="smallBold" style={styles.topicTitle}>
                    {topic.title}
                  </ThemedText>
                  <ThemedText themeColor="accent" type="smallBold">
                    {expanded ? '−' : '+'}
                  </ThemedText>
                </Pressable>

                {expanded && (
                  <View style={styles.topicBody}>
                    <ThemedText themeColor="textMuted" style={styles.topicContent}>
                      {topic.content}
                    </ThemedText>
                    {topic.tactics ? (
                      <>
                        <ThemedText type="smallBold" themeColor="accent" style={styles.tacticsLabel}>
                          ÖSYM Taktikleri
                        </ThemedText>
                        <ThemedText themeColor="textMuted" style={styles.topicContent}>
                          {topic.tactics}
                        </ThemedText>
                      </>
                    ) : null}
                  </View>
                )}
              </ThemedView>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four, paddingTop: Spacing.four, gap: Spacing.three },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginBottom: Spacing.two },
  backButton: { paddingVertical: Spacing.one },
  title: { fontWeight: '800' },
  centerBox: { paddingTop: Spacing.six, textAlign: 'center' },
  list: { gap: Spacing.two, paddingBottom: Spacing.six },
  topicCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, padding: Spacing.three },
  topicHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topicTitle: { flex: 1 },
  topicBody: { marginTop: Spacing.two, gap: Spacing.one },
  topicContent: { lineHeight: 22 },
  tacticsLabel: { marginTop: Spacing.two },
});
