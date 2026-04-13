import { useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getDashboardData, getMonthlySummary, getSmartTips } from '../../src/db/queries';
import { useQuery } from '../../src/hooks/useQuery';
import { colors, spacing, radius, typography } from '../../src/theme';
import { SpendingChart } from '../../src/components/SpendingChart';

export default function InsightsScreen() {
  const { data: dashboard, loading, refetch: r1 } = useQuery(getDashboardData);
  const { data: trend = [],           refetch: r2 } = useQuery(getMonthlySummary);
  const { data: tips  = [],           refetch: r3 } = useQuery(getSmartTips);

  function refetch() { r1(); r2(); r3(); }
  useFocusEffect(useCallback(() => { refetch(); }, []));

  const trendChartData = (trend as any[]).map((t: any) => ({
    name:  t.month?.slice(5) ?? '',
    total: t.expense ?? 0,
    color: colors.danger,
  }));

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={colors.primary} />}
    >
      <Text style={s.title}>Insights</Text>

      {/* Smart Tips */}
      {(tips as string[]).length > 0 && (
        <Section title="Smart Tips">
          {(tips as string[]).map((tip, i) => (
            <View key={i} style={s.tip}>
              <Text style={s.tipText}>{tip}</Text>
            </View>
          ))}
        </Section>
      )}

      {/* Month comparison */}
      {dashboard && (
        <Section title="This Month vs Last">
          <View style={s.compareRow}>
            <CompareCard label="Income"  current={dashboard.income.this_month}  last={dashboard.income.last_month}  change={dashboard.income.change_pct}  color={colors.success} />
            <CompareCard label="Expense" current={dashboard.expense.this_month} last={dashboard.expense.last_month} change={dashboard.expense.change_pct} color={colors.danger} />
          </View>
        </Section>
      )}

      {/* Category breakdown */}
      {(dashboard?.category_breakdown?.length ?? 0) > 0 && (
        <Section title="Top Categories">
          {dashboard!.category_breakdown.map((c: any) => (
            <View key={c.name} style={s.catRow}>
              <View style={[s.dot, { backgroundColor: c.color }]} />
              <Text style={s.catName}>{c.name}</Text>
              <Text style={s.catAmount}>€{parseFloat(c.total).toFixed(0)}</Text>
            </View>
          ))}
        </Section>
      )}

      {/* Trend chart */}
      {trendChartData.length > 0 && (
        <Section title="6-Month Spending">
          <SpendingChart data={trendChartData} />
        </Section>
      )}
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function CompareCard({ label, current, last, change, color }: { label: string; current: number; last: number; change: number; color: string }) {
  return (
    <View style={s.compareCard}>
      <Text style={{ ...typography.xs, color: colors.dark.textMuted, marginBottom: 4 }}>{label}</Text>
      <Text style={{ ...typography.xl, color, fontWeight: '700', marginBottom: 4 }}>€{current.toFixed(0)}</Text>
      <Text style={{ ...typography.xs, color: change >= 0 ? colors.danger : colors.success }}>
        {change >= 0 ? '↑' : '↓'} {Math.abs(change)}% vs last
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: colors.dark.bg },
  content:      { padding: spacing.md, paddingBottom: 80 },
  title:        { ...typography['2xl'], color: colors.dark.text, fontWeight: '700', marginTop: spacing.xl, marginBottom: spacing.lg },
  section:      { marginBottom: spacing.lg },
  sectionTitle: { ...typography.lg, color: colors.dark.text, fontWeight: '600', marginBottom: spacing.sm },
  tip:          { backgroundColor: colors.dark.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderLeftWidth: 3, borderLeftColor: colors.primary },
  tipText:      { ...typography.sm, color: colors.dark.text },
  compareRow:   { flexDirection: 'row', gap: spacing.sm },
  compareCard:  { flex: 1, backgroundColor: colors.dark.surface, borderRadius: radius.lg, padding: spacing.md },
  catRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.dark.border },
  dot:          { width: 10, height: 10, borderRadius: radius.full, marginRight: spacing.sm },
  catName:      { ...typography.base, color: colors.dark.text, flex: 1 },
  catAmount:    { ...typography.base, color: colors.dark.textMuted, fontWeight: '600' },
});
