import { useState, useCallback, useMemo, useEffect } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, Modal, TextInput } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import {
  getTransactions, deleteTransaction, deleteAllRecurringByCategory,
  deleteRecurringFuture, deleteRecurringPast,
  markTransactionPaid, markTransactionUnchecked, cascadeOpeningBalances, Transaction,
  getBudgets,
} from '../../src/db/queries';
import { useTheme } from '../../src/theme/useTheme';
import { colors as staticColors, spacing, radius, typography } from '../../src/theme';
import { TransactionItem } from '../../src/components/TransactionItem';
import { useIncomeHidden } from '../../src/store/privacyStore';

type Filter    = 'all' | 'income' | 'expense' | 'budget';
type SortField = 'date' | 'amount';
type SortDir   = 'desc' | 'asc';

export default function TransactionsScreen() {
  const { colors } = useTheme();
  const hide = useIncomeHidden();
  const [allTxns, setAllTxns]           = useState<Transaction[]>([]);
  const [budgetCatIds, setBudgetCatIds] = useState<Set<string>>(new Set());
  const [loading, setLoading]           = useState(true);
  const [filter, setFilter]             = useState<Filter>('all');
  const [sortField, setSortField]       = useState<SortField>('date');
  const [sortDir, setSortDir]           = useState<SortDir>('desc');
  const [selectedTx, setSelectedTx]     = useState<Transaction | null>(null);
  const [search, setSearch]             = useState('');
  const now   = new Date();
  const today = format(now, 'yyyy-MM-dd');

  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
  const [viewYear,  setViewYear]  = useState(now.getFullYear());

  const isCurrentMonth = viewMonth === now.getMonth() + 1 && viewYear === now.getFullYear();

  function prevMonth() {
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (isCurrentMonth) return;
    if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1); }
    else setViewMonth(m => m + 1);
  }

  const monthLabel = new Date(viewYear, viewMonth - 1, 1)
    .toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Load ALL transactions for the month once — filter/sort applied client-side
  const load = useCallback(async () => {
    setLoading(true);
    const monthDate = new Date(viewYear, viewMonth - 1, 1);
    const from = format(startOfMonth(monthDate), 'yyyy-MM-dd');
    const to   = format(endOfMonth(monthDate),   'yyyy-MM-dd');

    let data = await getTransactions({ from, to, limit: 500 });

    // Auto-check past transactions not manually unchecked
    const toCheck = data.filter(tx => tx.date <= today && !tx.paid_date && !tx.manually_unchecked);
    if (toCheck.length > 0) {
      await Promise.all(toCheck.map(tx => markTransactionPaid(tx.id, tx.date)));
      data = await getTransactions({ from, to, limit: 500 });
    }
    setAllTxns(data);
    setLoading(false);
  }, [viewMonth, viewYear]);

  // Load budget category IDs whenever budget filter is active
  useEffect(() => {
    if (filter === 'budget') {
      getBudgets(viewMonth, viewYear).then(b => setBudgetCatIds(new Set(b.map(x => x.category_id))));
    }
  }, [filter, viewMonth, viewYear]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleToggle(tx: Transaction) {
    if (tx.paid_date) {
      await markTransactionUnchecked(tx.id);
      const updated = { ...tx, paid_date: null, manually_unchecked: 1 };
      setAllTxns(prev => prev.map(t => t.id === tx.id ? updated : t));
      if (selectedTx?.id === tx.id) setSelectedTx(updated);
    } else {
      await markTransactionPaid(tx.id, today);
      const updated = { ...tx, paid_date: today, manually_unchecked: 0 };
      setAllTxns(prev => prev.map(t => t.id === tx.id ? updated : t));
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
          setAllTxns(prev => prev.filter(t => t.id !== tx.id));
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
          setAllTxns(prev => prev.filter(t => t.id !== tx.id));
          setSelectedTx(null);
        }},
      ]);
    }
  }

  // Summary — always computed from ALL txns (checked only), never affected by filter/search
  const checkedTxs     = allTxns.filter(tx => tx.paid_date);
  const checkedIncome  = checkedTxs.filter(tx => tx.type === 'income').reduce((s, tx) => s + tx.amount, 0);
  const checkedExpense = checkedTxs.filter(tx => tx.type === 'expense').reduce((s, tx) => s + tx.amount, 0);
  const checkedBalance = checkedIncome - checkedExpense;

  // Filtered + sorted list — client-side
  const listData = useMemo(() => {
    const q = search.trim().toLowerCase();

    let result = allTxns.filter(tx => {
      if (filter === 'income')  return tx.type === 'income';
      if (filter === 'expense') return tx.type === 'expense';
      if (filter === 'budget')  return budgetCatIds.has(tx.category_id ?? '');
      return true;
    });

    if (q) {
      result = result.filter(tx =>
        (tx.category_name ?? '').toLowerCase().includes(q) ||
        (tx.merchant ?? '').toLowerCase().includes(q) ||
        (tx.note ?? '').toLowerCase().includes(q)
      );
    }

    result = [...result].sort((a, b) => {
      let cmp = 0;
      if (sortField === 'date') {
        cmp = a.date.localeCompare(b.date);
        if (cmp === 0) cmp = (a.created_at ?? '').localeCompare(b.created_at ?? '');
      } else {
        cmp = a.amount - b.amount;
      }
      return sortDir === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [allTxns, filter, budgetCatIds, search, sortField, sortDir]);

  function toggleSort(field: SortField) {
    if (sortField === field) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
    else { setSortField(field); setSortDir('desc'); }
  }

  const sortIcon = (field: SortField) =>
    sortField === field
      ? (sortDir === 'desc' ? 'chevron-down' : 'chevron-up')
      : 'swap-vertical';

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      <View style={s.header}>
        <Text style={[s.title, { color: colors.text }]}>Transactions</Text>
        <View style={s.monthNav}>
          <TouchableOpacity onPress={prevMonth} style={s.monthBtn}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={[s.monthLabel, { color: colors.text }]}>{monthLabel}</Text>
          <TouchableOpacity onPress={nextMonth} style={s.monthBtn} disabled={isCurrentMonth}>
            <Ionicons name="chevron-forward" size={20} color={isCurrentMonth ? colors.textSubtle : colors.text} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Summary — only changes when transactions are checked/unchecked */}
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

      {/* Filter chips */}
      <View style={s.filters}>
        {(['all', 'income', 'expense', 'budget'] as Filter[]).map(f => (
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

      {/* Sort controls */}
      <View style={s.sortRow}>
        <Text style={[s.sortLabel, { color: colors.textMuted }]}>Sort:</Text>
        <TouchableOpacity
          style={[s.sortBtn, { borderColor: colors.border }, sortField === 'date' && s.sortBtnActive]}
          onPress={() => toggleSort('date')}
        >
          <Text style={[s.sortBtnText, { color: sortField === 'date' ? '#fff' : colors.textMuted }]}>Date</Text>
          <Ionicons name={sortIcon('date')} size={12} color={sortField === 'date' ? '#fff' : colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.sortBtn, { borderColor: colors.border }, sortField === 'amount' && s.sortBtnActive]}
          onPress={() => toggleSort('amount')}
        >
          <Text style={[s.sortBtnText, { color: sortField === 'amount' ? '#fff' : colors.textMuted }]}>Amount</Text>
          <Ionicons name={sortIcon('amount')} size={12} color={sortField === 'amount' ? '#fff' : colors.textMuted} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={listData}
        keyExtractor={item => item.id}
        refreshing={loading}
        onRefresh={load}
        renderItem={({ item }) => (
          <TransactionItem
            transaction={item}
            onPress={() => setSelectedTx(item)}
            onDelete={() => handleDelete(item)}
            checked={!!item.paid_date}
            onToggle={() => handleToggle(item)}
            hideAmount={hide && item.type === 'income'}
          />
        )}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          !loading
            ? <Text style={[s.empty, { color: colors.textMuted }]}>
                {search.trim() ? 'No matches found' : 'No transactions this month'}
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
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, paddingTop: 56, flexWrap: 'wrap', gap: 4 },
  monthNav:       { flexDirection: 'row', alignItems: 'center', gap: 4 },
  monthBtn:       { padding: 4 },
  monthLabel:     { ...typography.sm, fontWeight: '600', minWidth: 110, textAlign: 'center' },
  title:          { ...typography['2xl'], fontWeight: '700' },
  fab:            { position: 'absolute', bottom: spacing.xl, right: spacing.md, width: 56, height: 56, borderRadius: radius.full, backgroundColor: staticColors.primary, justifyContent: 'center', alignItems: 'center', shadowColor: staticColors.primary, shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  summary:        { flexDirection: 'row', marginHorizontal: spacing.md, marginBottom: spacing.sm, borderRadius: radius.md, borderWidth: 1, padding: spacing.sm },
  summaryCol:     { flex: 1, alignItems: 'center', gap: 2 },
  summaryDivider: { width: 1, marginVertical: 4 },
  summaryLabel:   { ...typography.xs },
  summaryValue:   { ...typography.sm, fontWeight: '700' },
  searchRow:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginHorizontal: spacing.md, marginBottom: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1 },
  searchInput:    { flex: 1, ...typography.sm, padding: 0 },
  filters:        { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.xs },
  chip:           { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full, borderWidth: 1 },
  chipActive:     { backgroundColor: staticColors.primary, borderColor: staticColors.primary },
  chipText:       { ...typography.sm },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  sortRow:        { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  sortLabel:      { ...typography.xs, marginRight: 2 },
  sortBtn:        { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.full, borderWidth: 1 },
  sortBtnActive:  { backgroundColor: staticColors.primary, borderColor: staticColors.primary },
  sortBtnText:    { ...typography.xs, fontWeight: '600' },
  list:           { padding: spacing.md, paddingBottom: 80 },
  empty:          { ...typography.base, textAlign: 'center', marginTop: spacing.xl },
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
