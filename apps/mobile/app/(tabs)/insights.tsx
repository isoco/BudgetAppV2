import { useState, useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, RefreshControl, Dimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Rect, Path, Line, Text as SvgText, Circle, Polyline, G } from 'react-native-svg';
import { getDashboardData, getMonthlySummary, getSmartTips, getYearOverview } from '../../src/db/queries';
import { useQuery } from '../../src/hooks/useQuery';
import { useTheme } from '../../src/theme/useTheme';
import { colors as C, spacing, radius, typography } from '../../src/theme';
import { SpendingChart } from '../../src/components/SpendingChart';

type Tab = 'insights' | 'stats';

const SCREEN_W = Dimensions.get('window').width;
const CHART_W  = SCREEN_W - 48;
const MONTH_LABELS = ['J','F','M','A','M','J','J','A','S','O','N','D'];

export default function AnalyticsScreen() {
  const { colors } = useTheme();
  const [tab, setTab] = useState<Tab>('insights');
  const [year, setYear]         = useState(new Date().getFullYear());
  const [overview, setOverview] = useState<any[]>([]);
  const [loadingStats, setLoadingStats] = useState(false);

  const { data: dashboard, loading, refetch: r1 } = useQuery(getDashboardData);
  const { data: trend = [],           refetch: r2 } = useQuery(getMonthlySummary);
  const { data: tips  = [],           refetch: r3 } = useQuery(getSmartTips);

  function refetchInsights() { r1(); r2(); r3(); }

  const loadStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const ov = await getYearOverview(year);
      setOverview(ov);
    } finally {
      setLoadingStats(false);
    }
  }, [year]);

  useFocusEffect(useCallback(() => {
    refetchInsights();
    loadStats();
  }, [loadStats]));

  // ── Bar chart values ───────────────────────────────────────────────────────
  const BAR_H  = 160;
  const BAR_W  = Math.floor(CHART_W / 12) - 4;
  const maxVal = Math.max(...overview.map(m => Math.max(m.income, m.expense)), 1);

  // ── Line chart ─────────────────────────────────────────────────────────────
  const last6 = overview.slice(-6);
  const maxExp = Math.max(...last6.map(m => m.expense), 1);
  const LINE_H = 100;
  const linePoints = last6.map((m, i) => {
    const x = (i / Math.max(last6.length - 1, 1)) * (CHART_W - 40) + 20;
    const y = LINE_H - (m.expense / maxExp) * (LINE_H - 20);
    return `${x},${y}`;
  }).join(' ');

  // ── Pie chart ──────────────────────────────────────────────────────────────
  const catData = dashboard?.category_breakdown ?? [];
  const totalCat = catData.reduce((s: number, c: any) => s + parseFloat(c.total), 0) || 1;
  const PIE_R = 70; const PIE_CX = CHART_W / 2; const PIE_CY = 90;
  let pieAngle = -Math.PI / 2;

  function arc(cx: number, cy: number, r: number, startA: number, endA: number) {
    const x1 = cx + r * Math.cos(startA); const y1 = cy + r * Math.sin(startA);
    const x2 = cx + r * Math.cos(endA);   const y2 = cy + r * Math.sin(endA);
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${endA - startA > Math.PI ? 1 : 0} 1 ${x2} ${y2} Z`;
  }

  // ── Trend chart data for insights tab ──────────────────────────────────────
  const trendChartData = (trend as any[]).map((t: any) => ({
    name:  t.month?.slice(5) ?? '',
    total: t.expense ?? 0,
    color: C.danger,
  }));

  const s = makeStyles(colors);

  return (
    <ScrollView
      style={[s.container, { backgroundColor: colors.bg }]}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={loading || loadingStats} onRefresh={() => { refetchInsights(); loadStats(); }} tintColor={C.primary} />}
    >
      <Text style={[s.title, { color: colors.text }]}>Analytics</Text>

      {/* Segmented control */}
      <View style={[s.segmented, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        {(['insights', 'stats'] as Tab[]).map(t => (
          <TouchableOpacity
            key={t}
            style={[s.seg, tab === t && { backgroundColor: C.primary }]}
            onPress={() => setTab(t)}
          >
            <Text style={[s.segText, { color: tab === t ? '#fff' : colors.textMuted }]}>
              {t[0].toUpperCase() + t.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── INSIGHTS tab ───────────────────────────────────────────────────── */}
      {tab === 'insights' && (
        <>
          {(tips as string[]).length > 0 && (
            <Section title="Smart Tips" colors={colors}>
              {(tips as string[]).map((tip, i) => (
                <View key={i} style={[s.tip, { backgroundColor: colors.surface, borderLeftColor: C.primary }]}>
                  <Text style={[s.tipText, { color: colors.text }]}>{tip}</Text>
                </View>
              ))}
            </Section>
          )}

          {dashboard && (
            <Section title="This Month vs Last" colors={colors}>
              <View style={s.compareRow}>
                <CompareCard label="Income"  current={dashboard.income.this_month}  last={dashboard.income.last_month}  change={dashboard.income.change_pct}  color={C.success} colors={colors} />
                <CompareCard label="Expense" current={dashboard.expense.this_month} last={dashboard.expense.last_month} change={dashboard.expense.change_pct} color={C.danger}  colors={colors} />
              </View>
            </Section>
          )}

          {catData.length > 0 && (
            <Section title="Top Categories" colors={colors}>
              {catData.map((c: any) => (
                <View key={c.name} style={[s.catRow, { borderBottomColor: colors.border }]}>
                  <View style={[s.dot, { backgroundColor: c.color }]} />
                  <Text style={[s.catName, { color: colors.text }]}>{c.name}</Text>
                  <Text style={[s.catAmount, { color: colors.textMuted }]}>€{parseFloat(c.total).toFixed(0)}</Text>
                </View>
              ))}
            </Section>
          )}

          {trendChartData.length > 0 && (
            <Section title="6-Month Spending" colors={colors}>
              <SpendingChart data={trendChartData} />
            </Section>
          )}
        </>
      )}

      {/* ── STATS tab ──────────────────────────────────────────────────────── */}
      {tab === 'stats' && (
        <>
          {/* Year picker */}
          <View style={s.yearRow}>
            <TouchableOpacity onPress={() => setYear(y => y - 1)} style={s.yearBtn}>
              <Ionicons name="chevron-back" size={20} color={colors.text} />
            </TouchableOpacity>
            <Text style={[s.yearLabel, { color: colors.text }]}>{year}</Text>
            <TouchableOpacity onPress={() => setYear(y => y + 1)} style={s.yearBtn}>
              <Ionicons name="chevron-forward" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Bar chart */}
          <View style={[s.card, { backgroundColor: colors.surface }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Monthly Income vs Expenses</Text>
            <View style={s.legend}>
              <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: C.success }]} /><Text style={[s.legendText, { color: colors.textMuted }]}>Income</Text></View>
              <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: C.danger }]} /><Text style={[s.legendText, { color: colors.textMuted }]}>Expenses</Text></View>
            </View>
            <Svg width={CHART_W} height={BAR_H + 30}>
              {overview.map((m, i) => {
                const x = i * (CHART_W / 12);
                const incH = (m.income / maxVal) * BAR_H;
                const expH = (m.expense / maxVal) * BAR_H;
                const hw = BAR_W / 2 - 1;
                return (
                  <G key={i}>
                    <Rect x={x + 2}          y={BAR_H - incH} width={hw} height={Math.max(incH, 1)} fill={C.success} rx={2} />
                    <Rect x={x + 2 + hw + 2} y={BAR_H - expH} width={hw} height={Math.max(expH, 1)} fill={C.danger}  rx={2} />
                    <SvgText x={x + BAR_W / 2} y={BAR_H + 16} textAnchor="middle" fill={colors.textMuted} fontSize={9}>
                      {MONTH_LABELS[m.month - 1]}
                    </SvgText>
                  </G>
                );
              })}
              <Line x1={0} y1={BAR_H} x2={CHART_W} y2={BAR_H} stroke={colors.border} strokeWidth={1} />
            </Svg>
          </View>

          {/* Line chart */}
          <View style={[s.card, { backgroundColor: colors.surface }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>6-Month Expense Trend</Text>
            <Svg width={CHART_W} height={LINE_H + 30}>
              <Polyline points={linePoints} fill="none" stroke={C.danger} strokeWidth={2} />
              {last6.map((m, i) => {
                const x = (i / Math.max(last6.length - 1, 1)) * (CHART_W - 40) + 20;
                const y = LINE_H - (m.expense / maxExp) * (LINE_H - 20);
                return (
                  <G key={i}>
                    <Circle cx={x} cy={y} r={4} fill={C.danger} />
                    <SvgText x={x} y={LINE_H + 18} textAnchor="middle" fill={colors.textMuted} fontSize={9}>{m.label}</SvgText>
                  </G>
                );
              })}
              <Line x1={0} y1={LINE_H} x2={CHART_W} y2={LINE_H} stroke={colors.border} strokeWidth={1} />
            </Svg>
          </View>

          {/* Pie chart */}
          {catData.length > 0 && (
            <View style={[s.card, { backgroundColor: colors.surface }]}>
              <Text style={[s.cardTitle, { color: colors.text }]}>This Month by Category</Text>
              <Svg width={CHART_W} height={PIE_CY * 2 + 20}>
                {catData.map((c: any, i: number) => {
                  const fraction = parseFloat(c.total) / totalCat;
                  const endAngle = pieAngle + fraction * 2 * Math.PI;
                  const d = arc(PIE_CX, PIE_CY, PIE_R, pieAngle, endAngle);
                  pieAngle = endAngle;
                  return <Path key={i} d={d} fill={c.color} stroke={colors.bg} strokeWidth={1} />;
                })}
              </Svg>
              {catData.map((c: any, i: number) => (
                <View key={i} style={s.catRow}>
                  <View style={[s.dot, { backgroundColor: c.color }]} />
                  <Text style={[s.catName, { color: colors.text }]}>{c.name}</Text>
                  <Text style={[s.catAmount, { color: colors.textMuted }]}>€{parseFloat(c.total).toFixed(0)}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Year summary table */}
          <View style={[s.card, { backgroundColor: colors.surface }]}>
            <Text style={[s.cardTitle, { color: colors.text }]}>Year Summary</Text>
            <View style={[s.tableRow, { borderBottomColor: colors.border, borderBottomWidth: 1, paddingBottom: spacing.xs }]}>
              <Text style={[s.tableCell, s.tableHeader, { color: colors.textMuted }]}>Month</Text>
              <Text style={[s.tableCell, s.tableHeader, { color: C.success }]}>Income</Text>
              <Text style={[s.tableCell, s.tableHeader, { color: C.danger }]}>Expense</Text>
              <Text style={[s.tableCell, s.tableHeader, { color: colors.textMuted }]}>Balance</Text>
            </View>
            {overview.map((m, i) => (
              <View key={i} style={[s.tableRow, { borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
                <Text style={[s.tableCell, { color: colors.text }]}>{m.label}</Text>
                <Text style={[s.tableCell, { color: C.success }]}>€{m.income.toFixed(0)}</Text>
                <Text style={[s.tableCell, { color: C.danger }]}>€{m.expense.toFixed(0)}</Text>
                <Text style={[s.tableCell, { color: m.balance >= 0 ? C.success : C.danger }]}>
                  €{m.balance.toFixed(0)}
                </Text>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

function Section({ title, children, colors }: { title: string; children: React.ReactNode; colors: any }) {
  return (
    <View style={sBase.section}>
      <Text style={[sBase.sectionTitle, { color: colors.text }]}>{title}</Text>
      {children}
    </View>
  );
}

function CompareCard({ label, current, last, change, color, colors }: {
  label: string; current: number; last: number; change: number; color: string; colors: any;
}) {
  return (
    <View style={[sBase.compareCard, { backgroundColor: colors.surface }]}>
      <Text style={[typography.xs, { color: colors.textMuted, marginBottom: 4 }]}>{label}</Text>
      <Text style={[typography.xl, { color, fontWeight: '700', marginBottom: 4 }]}>€{current.toFixed(0)}</Text>
      <Text style={[typography.xs, { color: change >= 0 ? C.danger : C.success }]}>
        {change >= 0 ? '↑' : '↓'} {Math.abs(change)}% vs last
      </Text>
    </View>
  );
}

function makeStyles(colors: any) {
  return StyleSheet.create({
    container:   { flex: 1 },
    content:     { padding: spacing.md, paddingBottom: 80 },
    title:       { ...typography['2xl'], fontWeight: '700', marginTop: spacing.xl, marginBottom: spacing.md },
    segmented:   { flexDirection: 'row', borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden', marginBottom: spacing.lg },
    seg:         { flex: 1, paddingVertical: spacing.sm, alignItems: 'center', borderRadius: radius.lg },
    segText:     { ...typography.sm, fontWeight: '600' },
    tip:         { borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, borderLeftWidth: 3 },
    tipText:     { ...typography.sm },
    compareRow:  { flexDirection: 'row', gap: spacing.sm },
    catRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1 },
    dot:         { width: 10, height: 10, borderRadius: radius.full, marginRight: spacing.sm },
    catName:     { ...typography.base, flex: 1 },
    catAmount:   { ...typography.base, fontWeight: '600' },
    yearRow:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.md, marginBottom: spacing.md },
    yearBtn:     { padding: spacing.xs },
    yearLabel:   { fontSize: 16, fontWeight: '600', minWidth: 50, textAlign: 'center' },
    card:        { borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
    cardTitle:   { fontSize: 15, fontWeight: '600', marginBottom: spacing.md },
    legend:      { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
    legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendDot:   { width: 8, height: 8, borderRadius: 4 },
    legendText:  { fontSize: 12 },
    tableRow:    { flexDirection: 'row', paddingVertical: spacing.xs },
    tableCell:   { flex: 1, fontSize: 12, textAlign: 'right' },
    tableHeader: { fontWeight: '700' },
  });
}

const sBase = StyleSheet.create({
  section:      { marginBottom: spacing.lg },
  sectionTitle: { ...typography.lg, fontWeight: '600', marginBottom: spacing.sm },
  compareCard:  { flex: 1, borderRadius: radius.lg, padding: spacing.md },
});
