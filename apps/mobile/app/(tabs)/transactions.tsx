import { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, Modal, TextInput } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import {
  getTransactions, deleteTransaction, deleteAllRecurringByCategory,
  deleteRecurringFuture, deleteRecurringPast,
  markTransactionPaid, markTransactionUnchecked, cascadeOpeningBalances, Transaction,
} from '../../src/db/queries';
import { useTheme } from '../../src/theme/useTheme';
import { colors as staticColors, spacing, radius, typography } from '../../src/theme';
import { TransactionItem } from '../../src/components/TransactionItem';
import { useIncomeHidden } from '../../src/store/privacyStore';

type Filter = 'all' | 'income' | 'expense';
type DailyExpense = { date: string; total: number };
type ListItem = { type: 'tx'; tx: Transaction } | { type: 'daily'; date: string; total: number };

function groupExpensesByDay(txs: Transaction[]): DailyExpense[] {
  const map: Record<string, number> = {};
  for (const tx of txs) {
    map[tx.date] = (map[tx.date] ?? 0) + tx.amount;
  }
  return Object.entries(map)
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => b.date.localeCompare(a.date));
}

export default function TransactionsScreen() {
  const { colors } = useTheme();
  const hide = useIncomeHidden();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading]           = useState(true);
  const [filter, setFilter]             = useState<Filter>('all');
  const [selectedTx, setSelectedTx]     = useState<Transaction | null>(null);
  const [search, setSearch]             = useState('');
  const now   = new Date();
  const today = format(now, 'yyyy-MM-dd');

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getTransactions({
      from:  format(startOfMonth(now), 'yyyy-MM-dd'),
      to:    format(endOfMonth(now),   'yyyy-MM-dd'),
      type:  filter === 'all' ? undefined : filter,
      limit: 200,
    });

    // Auto-check past transactions that haven't been checked and weren't manually unchecked
    const toCheck = data.filter(tx => tx.date <= today && !tx.paid_date && !tx.manually_unchecked);
    if (toCheck.length > 0) {
      await Promise.all(toCheck.map(tx => markTransactionPaid(tx.id, tx.date)));
      // Re-fetch with updated paid_dates
      const refreshed = await getTransactions({
        from:  format(startOfMonth(now), 'yyyy-MM-dd'),
        to:    format(endOfMonth(now),   'yyyy-MM-dd'),
        type:  filter === 'all' ? undefined : filter,
        limit: 200,
      });
      setTransactions(refreshed);
    } else {
      setTransactions(data);
    }
    setLoading(false);
  }, [filter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleToggle(tx: Transaction) {
    if (tx.paid_date) {
      // User is unchecking — mark as manually unchecked so auto-check won't re-check it
      await markTransactionUnchecked(tx.id);
      const updated = { ...tx, paid_date: null, manually_unchecked: 1 };
      setTransactions(prev => prev.map(t => t.id === tx.id ? updated : t));
      if (selectedTx?.id === tx.id) setSelectedTx(updated);
    } else {
      await markTransactionPaid(tx.id, today);
      const updated = { ...tx, paid_date: today, manually_unchecked: 0 };
      setTransactions(prev => prev.map(t => t.id === tx.id ? updated : t));
      if (selectedTx?.id === tx.id) setSelectedTx(updated);
    }
  }

  async function handleDelete(tx: Transaction) {
    const [y, m] = tx.date.split('-').map(Number);
    if (tx.is_recurring) {
      Alert.alert('Delete Recurring Transaction', 'Which occurrences to delete?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'This Only', onPress: async () => {
          await deleteTransaction(tx.id);
          await cascadeOpeningBalances(m, y);
          setTransactions(prev => prev.filter(t => t.id !== tx.id));
          setSelectedTx(null);
        }},
        { text: 'This & Future', onPress: async () => {
          if (tx.category_id) await deleteRecurringFuture(tx.category_id, tx.date);
          else await deleteTransaction(tx.id);
          await cascadeOpeningBalances(m, y);
          setSelectedTx(null);
          load();
        }},
        { text: 'This & Past', onPress: async () => {
          if (tx.category_id) await deleteRecurringPast(tx.category_id, tx.date);
          else await deleteTransaction(tx.id);
          await cascadeOpeningBalances(m, y);
          setSelectedTx(null);
          load();
        }},
        { text: 'All', style: 'destructive', onPress: async () => {
          if (tx.category_id) await deleteAllRecurringByCategory(tx.category_id);
          else await deleteTransaction(tx.id);
          await cascadeOpeningBalances(m, y);
          setSelectedTx(null);
          load();
        }},
      ]);
    } else {
      Alert.alert('Delete', 'This cannot be undone.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: async () => {
          await deleteTransaction(tx.id);
          await cascadeOpeningBalances(m, y);
          setTransactions(prev => prev.filter(t => t.id !== tx.id));
          setSelectedTx(null);
        }},
      ]);
    }
  }

  // Checked summary (based on full transaction list, not search filter)
  const checkedTxs     = transactions.filter(tx => tx.paid_date);
  const checkedIncome  = checkedTxs.filter(tx => tx.type === 'income').reduce((s, tx) => s + tx.amount, 0);
  const checkedExpense = checkedTxs.filter(tx => tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0);
  const checkedBalance = checkedIncome - checkedExpense;

  // Filter transactions by search query
  const q = search.trim().toLowerCase();
  const filtered = q
    ? transactions.filter(tx =>
        (tx.category_name ?? '').toLowerCase().includes(q) ||
        (tx.merchant ?? '').toLowerCase().includes(q) ||
        (tx.note ?? '').toLowerCase().includes(q)
      )
    : transactions;

  const listData: ListItem[] = filter === 'expense'
    ? groupExpensesByDay(filtered).map(d => ({ type: 'daily', date: d.date, total: d.total }))
    : filtered.map(tx => ({ type: 'tx', tx }));

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      <View style={s.header}>
        <Text style={[s.title, { color: colors.text }]}>Transactions</Text>
      </View>

      {/* Checked summary */}
      <View style={[s.summary, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={s.summaryCol}>
          <Text style={[s.summaryLabel, { color: colors.textMuted }]}>Income</Text>
          <Text style={[s.summaryValue, { color: staticColors.success }]}>
            {hide ? '€ ••••' : `+€${checkedIncome.toFixed(2)}`}
          </Text>
        </View>
        <View style={[s.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={s.summaryCol}>
          <Text style={[s.summaryLabel, { color: colors.textMuted }]}>Expenses</Text>
          <Text style={[s.summaryValue, { color: staticColors.danger }]}>-€{checkedExpense.toFixed(2)}</Text>
        </View>
        <View style={[s.summaryDivider, { backgroundColor: colors.border }]} />
        <View style={s.summaryCol}>
          <Text style={[s.summaryLabel, { color: colors.textMuted }]}>Balance</Text>
          <Text style={[s.summaryValue, { color: checkedBalance >= 0 ? staticColors.success : staticColors.danger }]}>
            {hide ? '€ ••••' : `${checkedBalance >= 0 ? '+' : ''}€${checkedBalance.toFixed(2)}`}
          </Text>
        </View>
      </View>

      {/* Search */}
      <View style={[s.searchRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Ionicons name="search" size={16} color={colors.textMuted} />
        <TextInput
          style={[s.searchInput, { color: colors.text }]}
          placeholder="Search category, merchant, note…"
          placeholderTextColor={colors.textMuted}
          value={search}
          onChangeText={setSearch}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={16} color={colors.textMuted} />
          </TouchableOpacity>
        )}
      </View>

      <View style={s.filters}>
        {(['all', 'income', 'expense'] as Filter[]).map(f => (
          <TouchableOpacity
            key={f}
            style={[s.chip, { borderColor: colors.border }, filter === f && s.chipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.chipText, { color: colors.textMuted }, filter === f && s.chipTextActive]}>
              {f[0].toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={listData}
        keyExtractor={(item, i) => item.type === 'daily' ? `daily-${item.date}` : item.tx.id}
        refreshing={loading}
        onRefresh={load}
        renderItem={({ item }) => {
          if (item.type === 'daily') {
            return (
              <View style={[s.dailyRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View>
                  <Text style={[s.dailyLabel, { color: colors.text }]}>Life Expenses</Text>
                  <Text style={[s.dailyDate, { color: colors.textMuted }]}>
                    {format(new Date(item.date), 'MMM d, yyyy')}
                  </Text>
                </View>
                <Text style={[s.dailyAmount, { color: staticColors.dark.text }]}>
                  -€{item.total.toFixed(2)}
                </Text>
              </View>
            );
          }
          return (
            <TransactionItem
              transaction={item.tx}
              onPress={() => setSelectedTx(item.tx)}
              onDelete={() => handleDelete(item.tx)}
              checked={!!item.tx.paid_date}
              onToggle={() => handleToggle(item.tx)}
              hideAmount={hide && item.tx.type === 'income'}
            />
          );
        }}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          !loading
            ? <Text style={[s.empty, { color: colors.textMuted }]}>
                {q ? 'No matches found' : 'No transactions this month'}
              </Text>
            : null
        }
      />

      <TouchableOpacity style={s.fab} onPress={() => router.push('/add-transaction')}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <Modal visible={!!selectedTx} transparent animationType="slide" onRequestClose={() => setSelectedTx(null)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setSelectedTx(null)}>
          <TouchableOpacity activeOpacity={1} style={[s.modalSheet, { backgroundColor: colors.surface }]}>
            {selectedTx && (
              <>
                <View style={s.modalHandle} />
                <Text style={[s.modalTitle, { color: colors.text }]}>Transaction Details</Text>
                <DetailRow label="Category"  value={selectedTx.category_name ?? '—'}    colors={colors} />
                <DetailRow label="Amount"    value={hide && selectedTx.type === 'income' ? '€ ••••' : `${selectedTx.type === 'income' ? '+' : '-'}€${selectedTx.amount.toFixed(2)}`} colors={colors} />
                <DetailRow label="Type"      value={selectedTx.type}                     colors={colors} />
                <DetailRow label="Date"      value={selectedTx.date}                     colors={colors} />
                {selectedTx.merchant && <DetailRow label="Merchant" value={selectedTx.merchant} colors={colors} />}
                {selectedTx.note     && <DetailRow label="Note"     value={selectedTx.note}     colors={colors} />}
                <DetailRow label="Recurring" value={selectedTx.is_recurring ? 'Yes 🔁' : 'No'} colors={colors} />
                <DetailRow label="Done"      value={selectedTx.paid_date ? `Yes (${selectedTx.paid_date})` : 'No'} colors={colors} />
                <View style={s.modalActions}>
                  <TouchableOpacity
                    style={[s.modalBtn, { borderColor: colors.primary }]}
                    onPress={() => { setSelectedTx(null); router.push(`/add-transaction?txId=${selectedTx.id}`); }}
                  >
                    <Ionicons name="pencil-outline" size={16} color={colors.primary} />
                    <Text style={[s.modalBtnText, { color: colors.primary }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[s.modalBtn, { borderColor: selectedTx.paid_date ? colors.border : staticColors.success }]}
                    onPress={() => handleToggle(selectedTx)}
                  >
                    <Ionicons
                      name={selectedTx.paid_date ? 'square-outline' : 'checkbox'}
                      size={16}
                      color={selectedTx.paid_date ? colors.textMuted : staticColors.success}
                    />
                    <Text style={[s.modalBtnText, { color: selectedTx.paid_date ? colors.textMuted : staticColors.success }]}>
                      {selectedTx.paid_date ? 'Uncheck' : 'Done'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.modalBtn, { borderColor: staticColors.danger }]} onPress={() => handleDelete(selectedTx)}>
                    <Ionicons name="trash-outline" size={16} color={staticColors.danger} />
                    <Text style={[s.modalBtnText, { color: staticColors.danger }]}>Delete</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.modalBtn, { borderColor: colors.border }]} onPress={() => setSelectedTx(null)}>
                    <Text style={[s.modalBtnText, { color: colors.text }]}>Close</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

function DetailRow({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={s.detailRow}>
      <Text style={[s.detailLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[s.detailValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1 },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, paddingTop: 56 },
  title:          { ...typography['2xl'], fontWeight: '700' },
  fab:            { position: 'absolute', bottom: spacing.xl, right: spacing.md, width: 56, height: 56, borderRadius: radius.full, backgroundColor: staticColors.primary, justifyContent: 'center', alignItems: 'center', shadowColor: staticColors.primary, shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  summary:        { flexDirection: 'row', marginHorizontal: spacing.md, marginBottom: spacing.sm, borderRadius: radius.md, borderWidth: 1, padding: spacing.sm },
  summaryCol:     { flex: 1, alignItems: 'center', gap: 2 },
  summaryDivider: { width: 1, marginVertical: 4 },
  summaryLabel:   { ...typography.xs },
  summaryValue:   { ...typography.sm, fontWeight: '700' },
  searchRow:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.md, marginBottom: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1 },
  searchInput:    { flex: 1, ...typography.sm, padding: 0 },
  filters:        { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  chip:           { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full, borderWidth: 1 },
  chipActive:     { backgroundColor: staticColors.primary, borderColor: staticColors.primary },
  chipText:       { ...typography.sm },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  list:           { padding: spacing.md, paddingBottom: 80 },
  empty:          { ...typography.base, textAlign: 'center', marginTop: spacing.xl },
  dailyRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.sm },
  dailyLabel:     { ...typography.base, fontWeight: '600' },
  dailyDate:      { ...typography.xs, marginTop: 2 },
  dailyAmount:    { ...typography.base, fontWeight: '700' },
  modalOverlay:   { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet:     { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 40 },
  modalHandle:    { width: 40, height: 4, borderRadius: 2, backgroundColor: '#555', alignSelf: 'center', marginBottom: spacing.md },
  modalTitle:     { ...typography.lg, fontWeight: '700', marginBottom: spacing.md },
  detailRow:      { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#333' },
  detailLabel:    { ...typography.sm },
  detailValue:    { ...typography.sm, fontWeight: '500', flex: 1, textAlign: 'right' },
  modalActions:   { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  modalBtn:       { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, minWidth: '45%' },
  modalBtnText:   { ...typography.xs, fontWeight: '600' },
});
