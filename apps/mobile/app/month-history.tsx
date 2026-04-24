import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getMonthHistory } from '../src/db/queries';
import { useQuery } from '../src/hooks/useQuery';
import { useTheme } from '../src/theme/useTheme';
import { colors as staticColors, spacing, radius, typography } from '../src/theme';

const fmt = (n: number) => `€${Math.abs(n).toFixed(0)}`;

// Expense segment colors
const COLOR_INCOME    = staticColors.success;   // green
const COLOR_OPENING   = staticColors.primary;   // blue/indigo
const COLOR_FUEL      = '#f97316';              // orange
const COLOR_DAILY     = '#f59e0b';              // amber
const COLOR_BILLS     = '#8b5cf6';              // purple
const COLOR_OTHER     = '#94a3b8';              // slate
const COLOR_SAVINGS   = '#10b981';              // teal

type MonthRow = {
  label: string; income: number; expense: number;
  savings: number; opening: number; closing: number;
  month: number; year: number;
  expense_fuel: number; expense_daily: number;
  expense_bills: number; expense_other: number;
};

export default function MonthHistoryScreen() {
  const { colors } = useTheme();

  const { data = [], loading, refetch } = useQuery(() => getMonthHistory(3, 12));
  const months = data as MonthRow[];

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear  = now.getFullYear();

  function openMonth(item: MonthRow) {
    router.push(`/month-dashboard?month=${item.month}&year=${item.year}`);
  }

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.title, { color: colors.text }]}>Month Overview</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Legend */}
      <View style={[s.legend, { backgroundColor: colors.surface }]}>
        <LegendDot color={COLOR_INCOME}  label="Income" />
        <LegendDot color={COLOR_OPENING} label="Opening" />
        <LegendDot color={COLOR_FUEL}    label="Fuel" />
        <LegendDot color={COLOR_DAILY}   label="Daily" />
        <LegendDot color={COLOR_BILLS}   label="Bills" />
        <LegendDot color={COLOR_OTHER}   label="Other" />
        <LegendDot color={COLOR_SAVINGS} label="Savings" />
      </View>

      <FlatList
        data={months}
        keyExtractor={(item: any) => `${item.year}-${item.month}`}
        refreshing={loading}
        onRefresh={refetch}
        contentContainerStyle={s.list}
        renderItem={({ item }: { item: MonthRow }) => {
          const isCurrent = item.month === currentMonth && item.year === currentYear;
          const isFuture  = item.year > currentYear || (item.year === currentYear && item.month > currentMonth);
          const isPositive = item.closing >= 0;
          const hasData    = item.income > 0 || item.expense > 0;

          // Bar 1 scale: total inflow = income + opening
          const totalIn  = item.income + Math.max(0, item.opening);
          // Bar 2 scale: total out = expense + savings (capped to totalIn for visual)
          const totalOut = item.expense + item.savings;

          // Bar 1 segments (% of totalIn)
          const incomePct  = totalIn > 0 ? Math.min(100, (item.income / totalIn) * 100) : 0;
          const openPct    = totalIn > 0 ? Math.min(100 - incomePct, (Math.max(0, item.opening) / totalIn) * 100) : 0;

          // Bar 2 segments (% of totalIn for same scale)
          const scale = totalIn > 0 ? 100 / totalIn : 0;
          const fuelPct    = Math.min(100, item.expense_fuel  * scale);
          const dailyPct   = Math.min(100 - fuelPct, item.expense_daily * scale);
          const billsPct   = Math.min(100 - fuelPct - dailyPct, item.expense_bills * scale);
          const otherPct   = Math.min(100 - fuelPct - dailyPct - billsPct, item.expense_other * scale);
          const savingsPct = Math.min(100 - fuelPct - dailyPct - billsPct - otherPct, item.savings * scale);

          return (
            <View>
              {isCurrent && (
                <View style={s.dividerRow}>
                  <View style={[s.dividerLine, { backgroundColor: staticColors.primary }]} />
                  <Text style={[s.dividerLabel, { color: staticColors.primary }]}>Current Month</Text>
                  <View style={[s.dividerLine, { backgroundColor: staticColors.primary }]} />
                </View>
              )}

              <TouchableOpacity
                style={[
                  s.card,
                  { backgroundColor: colors.surface },
                  isCurrent && { borderColor: staticColors.primary, borderWidth: 1.5 },
                ]}
                onPress={() => openMonth(item)}
                activeOpacity={0.75}
              >
                <View style={s.cardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Text style={[s.label, { color: isCurrent ? staticColors.primary : colors.text }]}>
                      {item.label}
                    </Text>
                    {isFuture && !hasData && (
                      <Text style={{ fontSize: 11, color: colors.textSubtle }}>upcoming</Text>
                    )}
                    {!isFuture && !hasData && (
                      <Text style={{ fontSize: 11, color: colors.textSubtle }}>no data</Text>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    {hasData && (
                      <View style={[s.badge, { backgroundColor: isPositive ? `${staticColors.success}22` : `${staticColors.danger}22` }]}>
                        <Text style={[s.badgeText, { color: isPositive ? staticColors.success : staticColors.danger }]}>
                          {isPositive ? '+' : '-'}{fmt(item.closing)}
                        </Text>
                      </View>
                    )}
                    <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
                  </View>
                </View>

                {hasData && (
                  <View style={s.rows}>
                    {item.opening > 0 && <Row label="Opening" value={fmt(item.opening)} color={COLOR_OPENING} colors={colors} />}
                    <Row label="Income"   value={fmt(item.income)}  color={COLOR_INCOME}  colors={colors} />
                    <Row label="Expenses" value={fmt(item.expense)} color={staticColors.danger} sign="-" colors={colors} />
                    {item.savings > 0 && <Row label="Savings" value={fmt(item.savings)} color={COLOR_SAVINGS} sign="-" colors={colors} />}
                  </View>
                )}

                {hasData && totalIn > 0 && (
                  <View style={s.barsContainer}>
                    {/* Bar 1: Inflow = Income + Opening */}
                    <View style={s.barLabelRow}>
                      <Text style={[s.barLabel, { color: colors.textSubtle }]}>In</Text>
                      <View style={[s.track, { backgroundColor: colors.surfaceHigh }]}>
                        {incomePct > 0 && <View style={[s.bar, { width: `${incomePct}%` as any, backgroundColor: COLOR_INCOME }]} />}
                        {openPct   > 0 && <View style={[s.bar, { width: `${openPct}%`   as any, backgroundColor: COLOR_OPENING }]} />}
                      </View>
                    </View>
                    {/* Bar 2: Outflow = Fuel + Daily + Bills + Other + Savings */}
                    <View style={s.barLabelRow}>
                      <Text style={[s.barLabel, { color: colors.textSubtle }]}>Out</Text>
                      <View style={[s.track, { backgroundColor: colors.surfaceHigh }]}>
                        {fuelPct    > 0 && <View style={[s.bar, { width: `${fuelPct}%`    as any, backgroundColor: COLOR_FUEL }]} />}
                        {dailyPct   > 0 && <View style={[s.bar, { width: `${dailyPct}%`   as any, backgroundColor: COLOR_DAILY }]} />}
                        {billsPct   > 0 && <View style={[s.bar, { width: `${billsPct}%`   as any, backgroundColor: COLOR_BILLS }]} />}
                        {otherPct   > 0 && <View style={[s.bar, { width: `${otherPct}%`   as any, backgroundColor: COLOR_OTHER }]} />}
                        {savingsPct > 0 && <View style={[s.bar, { width: `${savingsPct}%` as any, backgroundColor: COLOR_SAVINGS }]} />}
                      </View>
                    </View>
                  </View>
                )}
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={!loading ? <Text style={[s.empty, { color: colors.textMuted }]}>No data</Text> : null}
      />
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ fontSize: 10, color: '#94a3b8' }}>{label}</Text>
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
  legend:       { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginHorizontal: spacing.md, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.xs },
  list:         { padding: spacing.md, paddingBottom: 40 },
  dividerRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm, marginTop: spacing.xs },
  dividerLine:  { flex: 1, height: 1, opacity: 0.4 },
  dividerLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  card:         { borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  cardHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  label:        { ...typography.lg, fontWeight: '700' },
  badge:        { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full },
  badgeText:    { ...typography.sm, fontWeight: '700' },
  rows:         { marginBottom: spacing.sm },
  barsContainer:{ gap: 5, marginTop: spacing.xs },
  barLabelRow:  { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  barLabel:     { fontSize: 10, fontWeight: '600', width: 22, textAlign: 'right' },
  track:        { flex: 1, height: 8, borderRadius: radius.full, overflow: 'hidden', flexDirection: 'row' },
  bar:          { height: '100%' },
  empty:        { ...typography.base, textAlign: 'center', marginTop: spacing.xl },
});
