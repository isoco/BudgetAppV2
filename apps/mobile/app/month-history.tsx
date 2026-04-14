import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getMonthHistory } from '../src/db/queries';
import { useQuery } from '../src/hooks/useQuery';
import { useTheme } from '../src/theme/useTheme';
import { colors as staticColors, spacing, radius, typography } from '../src/theme';

const fmt = (n: number) => `€${Math.abs(n).toFixed(0)}`;

type MonthRow = {
  label: string; income: number; expense: number;
  savings: number; opening: number; closing: number;
  month: number; year: number;
};

export default function MonthHistoryScreen() {
  const { colors } = useTheme();

  // 3 past months + current + 12 future months
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

      <FlatList
        data={months}
        keyExtractor={(item: any) => `${item.year}-${item.month}`}
        refreshing={loading}
        onRefresh={refetch}
        contentContainerStyle={s.list}
        renderItem={({ item, index }: { item: MonthRow; index: number }) => {
          const isCurrent = item.month === currentMonth && item.year === currentYear;
          const isFuture  = item.year > currentYear || (item.year === currentYear && item.month > currentMonth);
          const isPositive = item.closing >= 0;
          const hasData    = item.income > 0 || item.expense > 0;

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
                    {item.opening > 0 && <Row label="Opening" value={fmt(item.opening)} color={staticColors.primary} colors={colors} />}
                    <Row label="Income"   value={fmt(item.income)}  color={staticColors.success} colors={colors} />
                    <Row label="Expenses" value={fmt(item.expense)} color={staticColors.danger}  sign="-" colors={colors} />
                    {item.savings > 0 && <Row label="Savings" value={fmt(item.savings)} color={staticColors.warning} sign="-" colors={colors} />}
                  </View>
                )}

                {hasData && (() => {
                  const total = item.opening + item.income;
                  if (total <= 0) return null;
                  const openPct   = Math.min(100, (item.opening  / total) * 100);
                  const expPct    = Math.min(100 - openPct, (item.expense / total) * 100);
                  const savPct    = Math.min(100 - openPct - expPct, (item.savings / total) * 100);
                  return (
                    <View style={[s.track, { backgroundColor: colors.surfaceHigh }]}>
                      {openPct > 0 && <View style={[s.bar, { width: `${openPct}%` as any, backgroundColor: staticColors.primary }]} />}
                      {expPct  > 0 && <View style={[s.bar, { width: `${expPct}%`  as any, backgroundColor: staticColors.danger  }]} />}
                      {savPct  > 0 && <View style={[s.bar, { width: `${savPct}%`  as any, backgroundColor: staticColors.warning }]} />}
                    </View>
                  );
                })()}
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={!loading ? <Text style={[s.empty, { color: colors.textMuted }]}>No data</Text> : null}
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
  dividerRow:   { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm, marginTop: spacing.xs },
  dividerLine:  { flex: 1, height: 1, opacity: 0.4 },
  dividerLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  card:         { borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  cardHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  label:        { ...typography.lg, fontWeight: '700' },
  badge:        { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full },
  badgeText:    { ...typography.sm, fontWeight: '700' },
  rows:         { marginBottom: spacing.sm },
  track:        { height: 6, borderRadius: radius.full, overflow: 'hidden', flexDirection: 'row' },
  bar:          { height: '100%', borderRadius: radius.full },
  empty:        { ...typography.base, textAlign: 'center', marginTop: spacing.xl },
});
