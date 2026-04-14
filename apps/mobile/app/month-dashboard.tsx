import { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput,
} from 'react-native';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getDashboardDataForMonth, Transaction, deleteTransaction,
  autoPopulateRecurring, cascadeOpeningBalances, updateMonthlySavings,
} from '../src/db/queries';
import { useTheme } from '../src/theme/useTheme';
import { colors as staticColors, spacing, radius, typography } from '../src/theme';

const fmt = (n: number) => `€${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function MonthDashboardScreen() {
  const { colors } = useTheme();
  const { month: mParam, year: yParam } = useLocalSearchParams<{ month: string; year: string }>();
  const month = parseInt(mParam ?? '0');
  const year  = parseInt(yParam ?? '0');

  const now       = new Date();
  const isCurrent = month === now.getMonth() + 1 && year === now.getFullYear();
  const isFuture  = year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth() + 1);

  const monthLabel = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const [data, setData]             = useState<Awaited<ReturnType<typeof getDashboardDataForMonth>> | null>(null);
  const [loading, setLoading]       = useState(true);
  const [editingSavings, setEditingSavings] = useState(false);
  const [savingsInput, setSavingsInput]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await autoPopulateRecurring(year, month);
      // Cascade opening balances so this month and all following are fresh
      await cascadeOpeningBalances(month, year);
      const d = await getDashboardDataForMonth(month, year);
      setData(d);
    } finally {
      setLoading(false);
    }
  }, [month, year]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function getDefaultDate() {
    if (isCurrent) return undefined;
    if (isFuture)  return `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    return `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }

  function handleAdd() {
    const defaultDate = getDefaultDate();
    router.push(defaultDate ? `/add-transaction?defaultDate=${defaultDate}` : '/add-transaction');
  }

  async function handleDelete(id: string) {
    Alert.alert('Delete transaction', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await deleteTransaction(id);
        load();
      }},
    ]);
  }

  async function saveSavings() {
    const num = parseFloat(savingsInput);
    if (isNaN(num) || num < 0) return Alert.alert('Enter a valid amount');
    await updateMonthlySavings(month, year, num);
    setEditingSavings(false);
    load();
  }

  const incomeTxs  = data?.transactions.filter(t => t.type === 'income')  ?? [];
  const expenseTxs = data?.transactions.filter(t => t.type === 'expense') ?? [];

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={{ alignItems: 'center' }}>
          <Text style={[s.title, { color: colors.text }]}>{monthLabel}</Text>
          {isCurrent && <Text style={[s.badge, { color: staticColors.primary }]}>Current Month</Text>}
          {isFuture  && <Text style={[s.badge, { color: colors.textMuted }]}>Upcoming</Text>}
        </View>
        <View style={{ width: 24 }} />
      </View>

      {loading ? (
        <ActivityIndicator color={staticColors.primary} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>

          {/* Summary card — balance = income - expense (savings separate) */}
          <View style={[s.summaryCard, { backgroundColor: staticColors.primary + '18' }]}>
            <SummaryChip label="Income"   value={fmt((data?.income ?? 0) + (data?.opening ?? 0))}  color={staticColors.success} />
            <View style={[s.vDivider, { backgroundColor: colors.border }]} />
            <SummaryChip label="Expenses" value={fmt(data?.expense ?? 0)} color={staticColors.danger} />
            <View style={[s.vDivider, { backgroundColor: colors.border }]} />
            <SummaryChip
              label="Balance"
              value={fmt(data?.balance ?? 0)}
              color={(data?.balance ?? 0) >= 0 ? staticColors.success : staticColors.danger}
            />
          </View>

          {/* Savings row — always shown, editable */}
          <View style={[s.savingsRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Ionicons name="wallet-outline" size={18} color={staticColors.warning} style={{ marginRight: spacing.sm }} />
            <View style={{ flex: 1 }}>
              <Text style={[s.savingsLabel, { color: colors.textMuted }]}>Savings this month</Text>
              {editingSavings ? (
                <View style={s.savingsEditRow}>
                  <TextInput
                    value={savingsInput}
                    onChangeText={setSavingsInput}
                    keyboardType="decimal-pad"
                    autoFocus
                    style={[s.savingsInput, { color: colors.text, borderColor: colors.border }]}
                  />
                  <TouchableOpacity onPress={saveSavings} style={s.savingsBtn}>
                    <Ionicons name="checkmark" size={18} color={staticColors.success} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditingSavings(false)} style={s.savingsBtn}>
                    <Ionicons name="close" size={18} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => { setSavingsInput(String(data?.savings ?? 0)); setEditingSavings(true); }}>
                  <Text style={[s.savingsValue, { color: staticColors.warning }]}>
                    {fmt(data?.savings ?? 0)}
                    <Text style={[s.savingsHint, { color: colors.textSubtle }]}> · tap to edit</Text>
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* Leftover from previous month */}
          {(data?.opening ?? 0) > 0 && (
            <Section label="Leftover from previous month" color={staticColors.primary}>
              <View style={[s.txRow, { borderColor: colors.border }]}>
                <View style={[s.dot, { backgroundColor: staticColors.primary }]} />
                <Ionicons name="return-down-forward" size={14} color={staticColors.primary} />
                <Text style={[s.txName, { color: colors.text, flex: 1 }]}>Carried over</Text>
                <Text style={[s.txAmt, { color: staticColors.primary }]}>+{fmt(data!.opening)}</Text>
              </View>
            </Section>
          )}

          {/* Recurring items — visible for all months */}
          {(data?.recurring ?? []).length > 0 && (
            <Section
              label={isFuture ? 'Expected (recurring)' : 'Recurring'}
              color={colors.textMuted}
            >
              {data!.recurring.map((r, i) => (
                <View key={i} style={[s.txRow, { borderColor: colors.border }]}>
                  <View style={[s.dot, { backgroundColor: r.color }]} />
                  <Ionicons name={r.icon as any} size={14} color={r.color} />
                  <View style={{ flex: 1 }}>
                    <Text style={[s.txName, { color: colors.text }]}>{r.name}</Text>
                    {r.due_day != null && (
                      <Text style={[s.txSub, { color: colors.textSubtle }]}>Day {r.due_day} · {fmt(r.amount)}</Text>
                    )}
                  </View>
                  <Text style={[s.txAmt, { color: r.type === 'income' ? staticColors.success : staticColors.danger }]}>
                    {r.type === 'income' ? '+' : '-'}{fmt(r.amount)}
                  </Text>
                </View>
              ))}
            </Section>
          )}

          {/* Income transactions */}
          {incomeTxs.length > 0 && (
            <Section label={`Income (${incomeTxs.length})`} color={staticColors.success}>
              {incomeTxs.map(t => (
                <TxRow key={t.id} tx={t} sign="+" color={staticColors.success} colors={colors} onDelete={handleDelete} />
              ))}
            </Section>
          )}

          {/* Expense transactions */}
          {expenseTxs.length > 0 && (
            <Section label={`Expenses (${expenseTxs.length})`} color={staticColors.danger}>
              {expenseTxs.map(t => (
                <TxRow key={t.id} tx={t} sign="-" color={staticColors.danger} colors={colors} onDelete={handleDelete} />
              ))}
            </Section>
          )}

          {incomeTxs.length === 0 && expenseTxs.length === 0 && (
            <Text style={[s.empty, { color: colors.textMuted }]}>
              {isFuture ? 'No transactions yet.' : 'No transactions recorded.'}
            </Text>
          )}

        </ScrollView>
      )}

      <TouchableOpacity style={[s.fab, { backgroundColor: staticColors.primary }]} onPress={handleAdd}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

function SummaryChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: '700', color }}>{value}</Text>
    </View>
  );
}

function Section({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <>
      <Text style={[s.sectionLabel, { color }]}>{label}</Text>
      {children}
    </>
  );
}

function TxRow({ tx, sign, color, colors, onDelete }: {
  tx: Transaction; sign: string; color: string; colors: any;
  onDelete: (id: string) => void;
}) {
  return (
    <TouchableOpacity
      style={[s.txRow, { borderColor: colors.border }]}
      onLongPress={() => onDelete(tx.id)}
      delayLongPress={400}
    >
      {tx.category_color && <View style={[s.dot, { backgroundColor: tx.category_color }]} />}
      {tx.is_recurring === 1 && <Ionicons name="repeat" size={12} color={colors.textSubtle} />}
      <View style={{ flex: 1 }}>
        <Text style={[s.txName, { color: colors.text }]}>{tx.category_name ?? 'Uncategorized'}</Text>
        {(tx.merchant || tx.note) && (
          <Text style={[s.txSub, { color: colors.textSubtle }]}>{tx.merchant ?? tx.note}</Text>
        )}
        <Text style={[s.txSub, { color: colors.textSubtle }]}>{tx.date}</Text>
      </View>
      <Text style={[s.txAmt, { color }]}>{sign}{fmt(tx.amount)}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1 },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, paddingTop: 56 },
  title:        { ...typography.lg, fontWeight: '700' },
  badge:        { fontSize: 11, fontWeight: '600', marginTop: 2 },
  fab:          { position: 'absolute', bottom: spacing.xl, right: spacing.md, width: 56, height: 56, borderRadius: radius.full, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  content:      { padding: spacing.md, paddingBottom: 100 },
  summaryCard:  { flexDirection: 'row', borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  vDivider:     { width: 1, marginHorizontal: spacing.sm },
  savingsRow:   { flexDirection: 'row', alignItems: 'center', borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm, borderWidth: 1 },
  savingsLabel: { fontSize: 11, marginBottom: 2 },
  savingsValue: { fontSize: 15, fontWeight: '700' },
  savingsHint:  { fontSize: 11, fontWeight: '400' },
  savingsEditRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  savingsInput: { flex: 1, fontSize: 15, borderBottomWidth: 1, paddingVertical: 2 },
  savingsBtn:   { padding: 4 },
  sectionLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: spacing.md, marginBottom: spacing.xs },
  txRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, gap: spacing.sm },
  dot:          { width: 8, height: 8, borderRadius: 4 },
  txName:       { fontSize: 14, fontWeight: '500' },
  txSub:        { fontSize: 11, marginTop: 1 },
  txAmt:        { fontSize: 14, fontWeight: '700' },
  empty:        { textAlign: 'center', marginTop: spacing.xl, ...typography.base },
});
