import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Rect, Path, Line, Text as SvgText, Circle, Polyline, G } from 'react-native-svg';
import { useTheme } from '../../src/theme/useTheme';
import { getYearOverview, getDashboardData } from '../../src/db/queries';

const SCREEN_W = Dimensions.get('window').width;
const CHART_W  = SCREEN_W - 48;
const MONTH_LABELS = ['J','F','M','A','M','J','J','A','S','O','N','D'];

export default function StatisticsScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const s = makeStyles(colors, spacing, radius);

  const [year, setYear]         = useState(new Date().getFullYear());
  const [overview, setOverview] = useState<any[]>([]);
  const [catData, setCatData]   = useState<any[]>([]);
  const [loading, setLoading]   = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, dash] = await Promise.all([
        getYearOverview(year),
        getDashboardData(),
      ]);
      setOverview(ov);
      setCatData(dash.category_breakdown ?? []);
    } finally {
      setLoading(false);
    }
  }, [year]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const maxVal = Math.max(...overview.map(m => Math.max(m.income, m.expense)), 1);
  const BAR_H  = 160;
  const BAR_W  = Math.floor(CHART_W / 12) - 4;

  // Pie chart for categories
  const totalCat = catData.reduce((s, c) => s + parseFloat(c.total), 0) || 1;
  const PIE_R = 70;
  const PIE_CX = CHART_W / 2;
  const PIE_CY = 90;
  let pieAngle = -Math.PI / 2;

  function arc(cx: number, cy: number, r: number, startA: number, endA: number) {
    const x1 = cx + r * Math.cos(startA);
    const y1 = cy + r * Math.sin(startA);
    const x2 = cx + r * Math.cos(endA);
    const y2 = cy + r * Math.sin(endA);
    const large = endA - startA > Math.PI ? 1 : 0;
    return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
  }

  // Line chart for 6-month expense trend (last 6 months from overview)
  const last6 = overview.slice(-6);
  const maxExp = Math.max(...last6.map(m => m.expense), 1);
  const LINE_H = 100;
  const linePoints = last6.map((m, i) => {
    const x = (i / Math.max(last6.length - 1, 1)) * (CHART_W - 40) + 20;
    const y = LINE_H - (m.expense / maxExp) * (LINE_H - 20);
    return `${x},${y}`;
  }).join(' ');

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      {/* Header + Year Picker */}
      <View style={s.yearRow}>
        <Text style={s.title}>Statistics</Text>
        <View style={s.yearPicker}>
          <TouchableOpacity onPress={() => setYear(y => y - 1)} style={s.yearBtn}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={s.yearLabel}>{year}</Text>
          <TouchableOpacity onPress={() => setYear(y => y + 1)} style={s.yearBtn}>
            <Ionicons name="chevron-forward" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Bar Chart — Income vs Expense */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Monthly Income vs Expenses</Text>
        <View style={s.legend}>
          <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: colors.success }]} /><Text style={s.legendText}>Income</Text></View>
          <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: colors.danger }]} /><Text style={s.legendText}>Expenses</Text></View>
        </View>
        <Svg width={CHART_W} height={BAR_H + 30}>
          {overview.map((m, i) => {
            const x = i * (CHART_W / 12);
            const incH = (m.income / maxVal) * BAR_H;
            const expH = (m.expense / maxVal) * BAR_H;
            const hw = BAR_W / 2 - 1;
            return (
              <G key={i}>
                <Rect x={x + 2}        y={BAR_H - incH} width={hw} height={Math.max(incH, 1)} fill={colors.success} rx={2} />
                <Rect x={x + 2 + hw + 2} y={BAR_H - expH} width={hw} height={Math.max(expH, 1)} fill={colors.danger}  rx={2} />
                <SvgText x={x + BAR_W / 2} y={BAR_H + 16} textAnchor="middle" fill={colors.textMuted} fontSize={9}>
                  {MONTH_LABELS[m.month - 1]}
                </SvgText>
              </G>
            );
          })}
          <Line x1={0} y1={BAR_H} x2={CHART_W} y2={BAR_H} stroke={colors.border} strokeWidth={1} />
        </Svg>
      </View>

      {/* Line Chart — Expense Trend */}
      <View style={s.card}>
        <Text style={s.cardTitle}>6-Month Expense Trend</Text>
        <Svg width={CHART_W} height={LINE_H + 30}>
          <Polyline points={linePoints} fill="none" stroke={colors.danger} strokeWidth={2} />
          {last6.map((m, i) => {
            const x = (i / Math.max(last6.length - 1, 1)) * (CHART_W - 40) + 20;
            const y = LINE_H - (m.expense / maxExp) * (LINE_H - 20);
            return (
              <G key={i}>
                <Circle cx={x} cy={y} r={4} fill={colors.danger} />
                <SvgText x={x} y={LINE_H + 18} textAnchor="middle" fill={colors.textMuted} fontSize={9}>
                  {m.label}
                </SvgText>
              </G>
            );
          })}
          <Line x1={0} y1={LINE_H} x2={CHART_W} y2={LINE_H} stroke={colors.border} strokeWidth={1} />
        </Svg>
      </View>

      {/* Pie Chart — This Month Category Breakdown */}
      {catData.length > 0 && (
        <View style={s.card}>
          <Text style={s.cardTitle}>This Month by Category</Text>
          <Svg width={CHART_W} height={PIE_CY * 2 + 20}>
            {catData.map((c, i) => {
              const fraction = parseFloat(c.total) / totalCat;
              const endAngle = pieAngle + fraction * 2 * Math.PI;
              const d = arc(PIE_CX, PIE_CY, PIE_R, pieAngle, endAngle);
              pieAngle = endAngle;
              return <Path key={i} d={d} fill={c.color} stroke={colors.bg} strokeWidth={1} />;
            })}
          </Svg>
          {catData.map((c: any, i: number) => (
            <View key={i} style={s.catRow}>
              <View style={[s.catDot, { backgroundColor: c.color }]} />
              <Text style={s.catName}>{c.name}</Text>
              <Text style={s.catAmt}>€{parseFloat(c.total).toFixed(0)}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Year Summary Table */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Year Summary</Text>
        <View style={[s.tableRow, { borderBottomColor: colors.border, borderBottomWidth: 1, paddingBottom: spacing.xs }]}>
          <Text style={[s.tableCell, s.tableHeader]}>Month</Text>
          <Text style={[s.tableCell, s.tableHeader, { color: colors.success }]}>Income</Text>
          <Text style={[s.tableCell, s.tableHeader, { color: colors.danger }]}>Expense</Text>
          <Text style={[s.tableCell, s.tableHeader]}>Balance</Text>
        </View>
        {overview.map((m, i) => (
          <View key={i} style={[s.tableRow, { borderBottomColor: colors.border, borderBottomWidth: 1 }]}>
            <Text style={s.tableCell}>{m.label}</Text>
            <Text style={[s.tableCell, { color: colors.success }]}>€{m.income.toFixed(0)}</Text>
            <Text style={[s.tableCell, { color: colors.danger }]}>€{m.expense.toFixed(0)}</Text>
            <Text style={[s.tableCell, { color: m.balance >= 0 ? colors.success : colors.danger }]}>
              ${m.balance.toFixed(0)}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

function makeStyles(colors: any, spacing: any, radius: any) {
  return StyleSheet.create({
    container:   { flex: 1, backgroundColor: colors.bg },
    content:     { padding: spacing.md, paddingBottom: 100 },
    yearRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: spacing.xl, marginBottom: spacing.lg },
    title:       { fontSize: 24, color: colors.text, fontWeight: '700' },
    yearPicker:  { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    yearBtn:     { padding: spacing.xs },
    yearLabel:   { fontSize: 16, color: colors.text, fontWeight: '600', minWidth: 50, textAlign: 'center' },
    card:        { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
    cardTitle:   { fontSize: 15, color: colors.text, fontWeight: '600', marginBottom: spacing.md },
    legend:      { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.sm },
    legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 4 },
    legendDot:   { width: 8, height: 8, borderRadius: 4 },
    legendText:  { fontSize: 12, color: colors.textMuted },
    catRow:      { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs },
    catDot:      { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
    catName:     { flex: 1, fontSize: 13, color: colors.text },
    catAmt:      { fontSize: 13, color: colors.textMuted, fontWeight: '600' },
    tableRow:    { flexDirection: 'row', paddingVertical: spacing.xs },
    tableCell:   { flex: 1, fontSize: 12, color: colors.text, textAlign: 'right' },
    tableHeader: { fontWeight: '700', color: colors.textMuted },
  });
}
