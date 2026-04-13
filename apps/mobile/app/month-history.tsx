import { View, Text, FlatList, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getMonthHistory } from '../src/db/queries';
import { useQuery } from '../src/hooks/useQuery';
import { useTheme } from '../src/theme/useTheme';
import { colors as staticColors, spacing, radius, typography } from '../src/theme';

export default function MonthHistoryScreen() {
  const { colors } = useTheme();
  const { data = [], loading, refetch } = useQuery(() => getMonthHistory(12));

  const fmt = (n: number) => `€${Math.abs(n).toFixed(0)}`;
  const fmtFull = (n: number) => `€${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const months = (data as any[]).slice().reverse();

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.title, { color: colors.text }]}>Month History</Text>
        <View style={{ width: 24 }} />
      </View>

      <FlatList
        data={months}
        keyExtractor={(item: any) => item.label}
        refreshing={loading}
        onRefresh={refetch}
        contentContainerStyle={s.list}
        renderItem={({ item, index }: any) => {
          const isPositive = item.closing >= 0;
          const nextItem   = months[index + 1]; // older month
          const hasCarryover = item.opening > 0;
          return (
            <View>
              {/* Carryover arrow connecting from previous month */}
              {hasCarryover && index > 0 && (
                <View style={[s.carryoverRow, { borderColor: colors.border }]}>
                  <Ionicons name="return-down-forward" size={14} color={staticColors.primary} />
                  <Text style={[s.carryoverText, { color: staticColors.primary }]}>
                    ↩ {fmtFull(item.opening)} carried over
                  </Text>
                </View>
              )}

              <View style={[s.card, { backgroundColor: colors.surface }]}>
                <View style={s.cardHeader}>
                  <Text style={[s.label, { color: colors.text }]}>{item.label}</Text>
                  <View style={[s.badge, { backgroundColor: isPositive ? `${staticColors.success}22` : `${staticColors.danger}22` }]}>
                    <Text style={[s.badgeText, { color: isPositive ? staticColors.success : staticColors.danger }]}>
                      {isPositive ? '+' : '-'}{fmt(item.closing)}
                    </Text>
                  </View>
                </View>

                <View style={s.rows}>
                  {item.opening > 0 && <Row label="Opening balance" value={fmt(item.opening)} color={staticColors.primary} colors={colors} />}
                  <Row label="Income"   value={fmt(item.income)}  color={staticColors.success} colors={colors} />
                  <Row label="Expenses" value={fmt(item.expense)} color={staticColors.danger}  sign="-" colors={colors} />
                  {item.savings > 0 && <Row label="Savings" value={fmt(item.savings)} color={staticColors.warning} sign="-" colors={colors} />}
                </View>

                {/* Balance bar */}
                <View style={[s.track, { backgroundColor: colors.surfaceHigh }]}>
                  {item.income > 0 && (
                    <View style={[s.bar, {
                      width: `${Math.min(100, ((item.expense + item.savings) / item.income) * 100)}%` as any,
                      backgroundColor: staticColors.danger,
                    }]} />
                  )}
                </View>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={!loading ? <Text style={[s.empty, { color: colors.textMuted }]}>No history yet</Text> : null}
      />
    </View>
  );
}

function Row({ label, value, color, sign = '', colors }: { label: string; value: string; color: string; sign?: string; colors: any }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
      <Text style={{ ...typography.sm, color: colors.textMuted }}>{label}</Text>
      <Text style={{ ...typography.sm, color, fontWeight: '600' }}>{sign}{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1 },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, paddingTop: 56 },
  title:        { ...typography.lg, fontWeight: '600' },
  list:         { padding: spacing.md, paddingBottom: 40 },
  carryoverRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderLeftWidth: 2, marginLeft: spacing.lg, marginBottom: 2 },
  carryoverText:{ ...typography.xs, fontWeight: '600' },
  card:         { borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  cardHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  label:        { ...typography.lg, fontWeight: '700' },
  badge:        { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full },
  badgeText:    { ...typography.sm, fontWeight: '700' },
  rows:         { marginBottom: spacing.sm },
  track:        { height: 6, borderRadius: radius.full, overflow: 'hidden' },
  bar:          { height: '100%', borderRadius: radius.full },
  empty:        { ...typography.base, textAlign: 'center', marginTop: spacing.xl },
});
