import { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/useTheme';
import { getYearOverview } from '../src/db/queries';

export default function YearOverviewScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const s = makeStyles(colors, spacing, radius);

  const now = new Date();
  const [year, setYear]     = useState(now.getFullYear());
  const [overview, setOverview] = useState<any[]>([]);

  const load = useCallback(async () => {
    const data = await getYearOverview(year);
    setOverview(data);
  }, [year]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const totalIncome  = overview.reduce((sum, m) => sum + m.income, 0);
  const totalExpense = overview.reduce((sum, m) => sum + m.expense, 0);
  const totalBalance = overview.reduce((sum, m) => sum + m.balance, 0);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={s.yearNav}>
          <TouchableOpacity onPress={() => setYear(y => y - 1)} style={s.yearBtn}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={s.yearLabel}>{year}</Text>
          <TouchableOpacity onPress={() => setYear(y => y + 1)} style={s.yearBtn}>
            <Ionicons name="chevron-forward" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={{ width: 24 }} />
      </View>

      {/* Year totals */}
      <View style={s.totals}>
        <TotalChip label="Income"  value={totalIncome}  color={colors.success} />
        <TotalChip label="Expense" value={totalExpense} color={colors.danger} />
        <TotalChip label="Balance" value={totalBalance} color={totalBalance >= 0 ? colors.success : colors.danger} />
      </View>

      <ScrollView contentContainerStyle={s.grid}>
        {overview.map((m, i) => {
          const isCurrentMonth = m.month === now.getMonth() + 1 && year === now.getFullYear();
          const balanceColor = m.balance >= 0 ? colors.success : colors.danger;
          return (
            <View
              key={i}
              style={[s.monthCard, isCurrentMonth && { borderColor: colors.primary, borderWidth: 2 }]}
            >
              <Text style={[s.monthName, isCurrentMonth && { color: colors.primary }]}>{m.label}</Text>
              {m.income === 0 && m.expense === 0 ? (
                <Text style={s.noData}>No data</Text>
              ) : (
                <>
                  <Text style={[s.monthValue, { color: colors.success }]}>€{m.income.toFixed(0)}</Text>
                  <Text style={[s.monthValue, { color: colors.danger }]}>-€{m.expense.toFixed(0)}</Text>
                  <View style={[s.balanceBadge, { backgroundColor: balanceColor + '22' }]}>
                    <Text style={[s.balanceText, { color: balanceColor }]}>
                      {m.balance >= 0 ? '+' : ''}{m.balance.toFixed(0)}
                    </Text>
                  </View>
                </>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

function TotalChip({ label, value, color }: { label: string; value: number; color: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 2 }}>{label}</Text>
      <Text style={{ fontSize: 16, color, fontWeight: '700' }}>€{Math.abs(value).toFixed(0)}</Text>
    </View>
  );
}

function makeStyles(colors: any, spacing: any, radius: any) {
  return StyleSheet.create({
    container:    { flex: 1, backgroundColor: colors.bg },
    header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, paddingTop: 56 },
    yearNav:      { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    yearBtn:      { padding: spacing.xs },
    yearLabel:    { fontSize: 20, color: colors.text, fontWeight: '700', minWidth: 60, textAlign: 'center' },
    totals:       { flexDirection: 'row', backgroundColor: colors.surface, margin: spacing.md, borderRadius: radius.lg, padding: spacing.md },
    grid:         { flexDirection: 'row', flexWrap: 'wrap', padding: spacing.md, gap: spacing.sm, paddingBottom: 80 },
    monthCard:    { width: '31%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.sm, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    monthName:    { fontSize: 13, color: colors.text, fontWeight: '700', marginBottom: spacing.xs },
    monthValue:   { fontSize: 12, fontWeight: '600', marginBottom: 2 },
    noData:       { fontSize: 11, color: colors.textSubtle, marginTop: spacing.xs },
    balanceBadge: { borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2, marginTop: 4 },
    balanceText:  { fontSize: 12, fontWeight: '700' },
  });
}
