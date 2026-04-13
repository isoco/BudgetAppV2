import { useCallback } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getSavingsHistory, SavingsMonth } from '../../src/db/queries';
import { useQuery } from '../../src/hooks/useQuery';
import { useTheme } from '../../src/theme/useTheme';
import { colors as staticColors, spacing, radius, typography } from '../../src/theme';

const fmt = (n: number) => `€${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function SavingsScreen() {
  const { colors } = useTheme();
  const { data, loading, refetch } = useQuery(getSavingsHistory);
  const months: SavingsMonth[] = data?.months ?? [];
  const total = data?.total ?? 0;

  useFocusEffect(useCallback(() => { refetch(); }, []));

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      <View style={s.header}>
        <Text style={[s.title, { color: colors.text }]}>Savings</Text>
      </View>

      {/* Total card */}
      <View style={[s.totalCard, { backgroundColor: staticColors.primary + '18', borderColor: staticColors.primary + '44' }]}>
        <Text style={[s.totalLabel, { color: colors.textMuted }]}>Total Saved</Text>
        <Text style={[s.totalAmount, { color: staticColors.primary }]}>{fmt(total)}</Text>
      </View>

      <FlatList
        data={months}
        keyExtractor={item => `${item.year}-${item.month}`}
        refreshing={loading}
        onRefresh={refetch}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          !loading
            ? <Text style={[s.empty, { color: colors.textMuted }]}>No savings recorded yet</Text>
            : null
        }
        renderItem={({ item }) => (
          <View style={[s.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={s.rowLeft}>
              <Text style={[s.monthLabel, { color: colors.text }]}>{item.label}</Text>
              <Text style={[s.sub, { color: colors.textMuted }]}>Cumulative: {fmt(item.cumulative)}</Text>
            </View>
            <Text style={[s.amount, { color: staticColors.primary }]}>+{fmt(item.savings)}</Text>
          </View>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container:   { flex: 1 },
  header:      { padding: spacing.md, paddingTop: 56 },
  title:       { ...typography['2xl'], fontWeight: '700' },
  totalCard:   { marginHorizontal: spacing.md, marginBottom: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center' },
  totalLabel:  { ...typography.sm, marginBottom: 4 },
  totalAmount: { ...typography['3xl'], fontWeight: '800' },
  list:        { padding: spacing.md, paddingBottom: 80 },
  row:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.sm },
  rowLeft:     { flex: 1 },
  monthLabel:  { ...typography.base, fontWeight: '600' },
  sub:         { ...typography.xs, marginTop: 2 },
  amount:      { ...typography.base, fontWeight: '700' },
  empty:       { ...typography.base, textAlign: 'center', marginTop: spacing.xl },
});
