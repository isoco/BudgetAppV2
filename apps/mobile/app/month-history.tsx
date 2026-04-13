import { useState } from 'react';
import { View, Text, FlatList, StyleSheet, Modal, ScrollView, ActivityIndicator, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getMonthHistory, getMonthDetail, Transaction } from '../src/db/queries';
import { useQuery } from '../src/hooks/useQuery';
import { useTheme } from '../src/theme/useTheme';
import { colors as staticColors, spacing, radius, typography } from '../src/theme';

const fmt     = (n: number) => `€${Math.abs(n).toFixed(0)}`;
const fmtFull = (n: number) => `€${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Parse "Apr '25" label back into month/year numbers
function parseLabelToMonthYear(label: string): { month: number; year: number } | null {
  const MONTHS: Record<string, number> = {
    Jan: 1, Feb: 2, Mar: 3, Apr: 4, May: 5, Jun: 6,
    Jul: 7, Aug: 8, Sep: 9, Oct: 10, Nov: 11, Dec: 12,
  };
  const parts = label.replace("'", '').split(' ');
  if (parts.length < 2) return null;
  const month = MONTHS[parts[0]];
  const year  = parseInt('20' + parts[1]);
  if (!month || isNaN(year)) return null;
  return { month, year };
}

type MonthRow = {
  label: string; income: number; expense: number;
  savings: number; opening: number; closing: number;
};

export default function MonthHistoryScreen() {
  const { colors } = useTheme();

  const { data = [], loading, refetch } = useQuery(() => getMonthHistory(24));
  const months = (data as MonthRow[]).slice().reverse(); // most-recent first

  const [selected, setSelected]       = useState<MonthRow | null>(null);
  const [detail, setDetail]           = useState<Awaited<ReturnType<typeof getMonthDetail>> | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  async function openDetail(item: MonthRow) {
    setSelected(item);
    const parsed = parseLabelToMonthYear(item.label);
    if (!parsed) return;
    setDetailLoading(true);
    setDetail(null);
    try {
      const d = await getMonthDetail(parsed.month, parsed.year);
      setDetail(d);
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setSelected(null);
    setDetail(null);
  }

  // For the detail modal: group transactions by type
  const incomeTxs  = detail?.transactions.filter(t => t.type === 'income')  ?? [];
  const expenseTxs = detail?.transactions.filter(t => t.type === 'expense') ?? [];

  // Recurring items not yet covered by actual transactions (for future months)
  const now = new Date();
  const parsed = selected ? parseLabelToMonthYear(selected.label) : null;
  const isFuture = parsed
    ? (parsed.year > now.getFullYear() || (parsed.year === now.getFullYear() && parsed.month > now.getMonth() + 1))
    : false;

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
        renderItem={({ item, index }: { item: MonthRow; index: number }) => {
          const isPositive  = item.closing >= 0;
          const hasCarryover = item.opening > 0;
          const hasData     = item.income > 0 || item.expense > 0;

          return (
            <View>
              {hasCarryover && index > 0 && (
                <View style={[s.carryoverRow, { borderColor: colors.border }]}>
                  <Ionicons name="return-down-forward" size={14} color={staticColors.primary} />
                  <Text style={[s.carryoverText, { color: staticColors.primary }]}>
                    ↩ {fmtFull(item.opening)} carried over
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={[s.card, { backgroundColor: colors.surface }]}
                onPress={() => openDetail(item)}
                activeOpacity={0.75}
              >
                <View style={s.cardHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <Text style={[s.label, { color: colors.text }]}>{item.label}</Text>
                    {!hasData && (
                      <Text style={{ fontSize: 11, color: colors.textSubtle }}>no data</Text>
                    )}
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                    <View style={[s.badge, { backgroundColor: isPositive ? `${staticColors.success}22` : `${staticColors.danger}22` }]}>
                      <Text style={[s.badgeText, { color: isPositive ? staticColors.success : staticColors.danger }]}>
                        {isPositive ? '+' : '-'}{fmt(item.closing)}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={16} color={colors.textSubtle} />
                  </View>
                </View>

                <View style={s.rows}>
                  {item.opening > 0 && <Row label="Opening balance" value={fmt(item.opening)} color={staticColors.primary} colors={colors} />}
                  <Row label="Income"   value={fmt(item.income)}  color={staticColors.success} colors={colors} />
                  <Row label="Expenses" value={fmt(item.expense)} color={staticColors.danger}  sign="-" colors={colors} />
                  {item.savings > 0 && <Row label="Savings" value={fmt(item.savings)} color={staticColors.warning} sign="-" colors={colors} />}
                </View>

                <View style={[s.track, { backgroundColor: colors.surfaceHigh }]}>
                  {item.income > 0 && (
                    <View style={[s.bar, {
                      width: `${Math.min(100, ((item.expense + item.savings) / item.income) * 100)}%` as any,
                      backgroundColor: staticColors.danger,
                    }]} />
                  )}
                </View>
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={!loading ? <Text style={[s.empty, { color: colors.textMuted }]}>No history yet</Text> : null}
      />

      {/* ── Detail Modal ── */}
      <Modal visible={!!selected} transparent animationType="slide" onRequestClose={closeDetail}>
        <View style={s.modalOverlay}>
          <View style={[s.modalCard, { backgroundColor: colors.surface }]}>
            {/* Modal header */}
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.text }]}>{selected?.label}</Text>
              <TouchableOpacity onPress={closeDetail}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Summary pills */}
            {selected && (
              <View style={s.pillRow}>
                <Pill label="Income"   value={fmtFull(selected.income)}  color={staticColors.success} />
                <Pill label="Expenses" value={fmtFull(selected.expense)} color={staticColors.danger} />
                <Pill label="Balance"  value={fmtFull(selected.closing)} color={selected.closing >= 0 ? staticColors.success : staticColors.danger} />
              </View>
            )}

            {detailLoading ? (
              <ActivityIndicator color={staticColors.primary} style={{ marginTop: 40 }} />
            ) : (
              <ScrollView contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>

                {/* Recurring / expected */}
                {(detail?.recurring ?? []).length > 0 && (
                  <>
                    <SectionLabel
                      label={isFuture ? 'Expected (recurring)' : 'Recurring items'}
                      color={colors.textMuted}
                    />
                    {detail!.recurring.map((r, i) => (
                      <View key={i} style={[s.txRow, { borderColor: colors.border }]}>
                        <View style={[s.dot, { backgroundColor: r.color }]} />
                        <Ionicons name={r.icon as any} size={15} color={r.color} style={{ marginRight: 4 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={[s.txName, { color: colors.text }]}>{r.name}</Text>
                          {r.due_day ? <Text style={[s.txSub, { color: colors.textSubtle }]}>Due day {r.due_day}</Text> : null}
                        </View>
                        <Text style={[s.txAmt, { color: r.type === 'income' ? staticColors.success : staticColors.danger }]}>
                          {r.type === 'income' ? '+' : '-'}{fmtFull(r.amount)}
                        </Text>
                      </View>
                    ))}
                  </>
                )}

                {/* Income transactions */}
                {incomeTxs.length > 0 && (
                  <>
                    <SectionLabel label={`Income (${incomeTxs.length})`} color={staticColors.success} />
                    {incomeTxs.map(t => (
                      <TxRow key={t.id} tx={t} colors={colors} sign="+" color={staticColors.success} fmtFull={fmtFull} />
                    ))}
                  </>
                )}

                {/* Expense transactions */}
                {expenseTxs.length > 0 && (
                  <>
                    <SectionLabel label={`Expenses (${expenseTxs.length})`} color={staticColors.danger} />
                    {expenseTxs.map(t => (
                      <TxRow key={t.id} tx={t} colors={colors} sign="-" color={staticColors.danger} fmtFull={fmtFull} />
                    ))}
                  </>
                )}

                {!detailLoading && incomeTxs.length === 0 && expenseTxs.length === 0 && (
                  <Text style={[s.empty, { color: colors.textSubtle, marginTop: spacing.lg }]}>
                    {isFuture ? 'No transactions yet — recurring items shown above.' : 'No transactions recorded.'}
                  </Text>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
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

function Pill({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>{label}</Text>
      <Text style={{ fontSize: 15, color, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

function SectionLabel({ label, color }: { label: string; color: string }) {
  return (
    <Text style={{ fontSize: 11, color, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.md, marginBottom: spacing.xs }}>
      {label}
    </Text>
  );
}

function TxRow({ tx, colors, sign, color, fmtFull }: { tx: Transaction; colors: any; sign: string; color: string; fmtFull: (n: number) => string }) {
  return (
    <View style={[s.txRow, { borderColor: colors.border }]}>
      {tx.category_color && <View style={[s.dot, { backgroundColor: tx.category_color }]} />}
      <View style={{ flex: 1 }}>
        <Text style={[s.txName, { color: colors.text }]}>{tx.category_name ?? 'Uncategorized'}</Text>
        {(tx.merchant || tx.note) && (
          <Text style={[s.txSub, { color: colors.textSubtle }]}>{tx.merchant ?? tx.note}</Text>
        )}
        <Text style={[s.txSub, { color: colors.textSubtle }]}>{tx.date}</Text>
      </View>
      <Text style={[s.txAmt, { color }]}>{sign}{fmtFull(tx.amount)}</Text>
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
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalCard:    { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 16, maxHeight: '88%' },
  modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle:   { ...typography.xl, fontWeight: '700' },
  pillRow:      { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  txRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.sm },
  dot:          { width: 8, height: 8, borderRadius: 4 },
  txName:       { fontSize: 14, fontWeight: '500' },
  txSub:        { fontSize: 11, marginTop: 1 },
  txAmt:        { fontSize: 14, fontWeight: '700' },
});
