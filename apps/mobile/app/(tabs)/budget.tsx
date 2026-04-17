import { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getBudgets } from '../../src/db/queries';
import { useQuery } from '../../src/hooks/useQuery';
import { colors, spacing, radius, typography } from '../../src/theme';
import { BudgetCard } from '../../src/components/BudgetCard';

export default function BudgetScreen() {
  const now = new Date();
  const { data = [], loading, refetch } = useQuery(
    () => getBudgets(now.getMonth() + 1, now.getFullYear()),
    [now.getMonth(), now.getFullYear()]
  );
  const [showHelp, setShowHelp] = useState(false);

  useFocusEffect(useCallback(() => { refetch(); }, []));

  const totalBudget = (data as any[]).reduce((s, b) => s + b.amount, 0);
  const totalSpent  = (data as any[]).reduce((s, b) => s + (b.spent ?? 0), 0);
  const overCount   = (data as any[]).filter(b => b.pct >= 100).length;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Budget</Text>
        <View style={s.headerRight}>
          <TouchableOpacity style={s.helpBtn} onPress={() => setShowHelp(v => !v)}>
            <Ionicons name={showHelp ? 'close-circle-outline' : 'help-circle-outline'} size={22} color={colors.dark.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={s.addBtn} onPress={() => router.push('/set-budget')}>
            <Ionicons name="add" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      {showHelp && (
        <View style={s.helpCard}>
          <Text style={s.helpTitle}>How Budgets Work</Text>
          <Text style={s.helpText}>
            {'• Set a monthly spending limit per expense category.\n'}
            {'• As you record expenses, each card shows % used.\n'}
            {'• Green = under budget, Red = over budget.\n'}
            {'• Budgets are per-month — they don\'t roll over.\n'}
            {'• Tap + to add or update a budget for any category.'}
          </Text>
        </View>
      )}

      <View style={s.summary}>
        <SummaryItem label="Spent"     value={`€${totalSpent.toFixed(0)}`} />
        <View style={s.summaryDivider} />
        <SummaryItem label="Remaining" value={`€${(totalBudget - totalSpent).toFixed(0)}`} />
        <View style={s.summaryDivider} />
        <SummaryItem label="Over"      value={String(overCount)} danger={overCount > 0} />
      </View>

      <FlatList
        data={data as any[]}
        keyExtractor={b => b.id}
        refreshing={loading}
        onRefresh={refetch}
        renderItem={({ item }) => <BudgetCard budget={item} />}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          !loading ? (
            <View style={s.empty}>
              <Text style={s.emptyText}>No budgets set</Text>
              <TouchableOpacity onPress={() => router.push('/set-budget')}>
                <Text style={s.emptyAction}>Set your first budget →</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
      />
    </View>
  );
}

function SummaryItem({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={[{ ...typography.xl, color: colors.dark.text, fontWeight: '700' }, danger && { color: colors.danger }]}>{value}</Text>
      <Text style={{ ...typography.xs, color: colors.dark.textMuted, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: colors.dark.bg },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, paddingTop: 56 },
  title:          { ...typography['2xl'], color: colors.dark.text, fontWeight: '700' },
  headerRight:    { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  helpBtn:        { padding: 4 },
  addBtn:         { width: 36, height: 36, borderRadius: radius.full, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  helpCard:       { marginHorizontal: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.dark.surface, borderRadius: radius.lg, padding: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.primary },
  helpTitle:      { ...typography.base, color: colors.dark.text, fontWeight: '700', marginBottom: spacing.xs },
  helpText:       { ...typography.sm, color: colors.dark.textMuted, lineHeight: 20 },
  summary:        { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: colors.dark.surface, marginHorizontal: spacing.md, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  summaryDivider: { width: 1, backgroundColor: colors.dark.border },
  list:           { padding: spacing.md, paddingBottom: 80 },
  empty:          { alignItems: 'center', marginTop: spacing.xl },
  emptyText:      { ...typography.base, color: colors.dark.textMuted, marginBottom: spacing.sm },
  emptyAction:    { ...typography.base, color: colors.primary, fontWeight: '600' },
});
