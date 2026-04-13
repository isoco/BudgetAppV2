import { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { getTransactions, deleteTransaction, markTransactionPaid, Transaction } from '../../src/db/queries';
import { useTheme } from '../../src/theme/useTheme';
import { colors as staticColors, spacing, radius, typography } from '../../src/theme';
import { TransactionItem } from '../../src/components/TransactionItem';

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
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading]           = useState(true);
  const [filter, setFilter]             = useState<Filter>('all');
  const now = new Date();

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getTransactions({
      from:  format(startOfMonth(now), 'yyyy-MM-dd'),
      to:    format(endOfMonth(now),   'yyyy-MM-dd'),
      type:  filter === 'all' ? undefined : filter,
      limit: 200,
    });
    setTransactions(data);
    setLoading(false);
  }, [filter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function handleDelete(id: string) {
    Alert.alert('Delete', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await deleteTransaction(id);
        setTransactions(prev => prev.filter(t => t.id !== id));
      }},
    ]);
  }

  const listData: ListItem[] = filter === 'expense'
    ? groupExpensesByDay(transactions).map(d => ({ type: 'daily', date: d.date, total: d.total }))
    : transactions.map(tx => ({ type: 'tx', tx }));

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      <View style={s.header}>
        <Text style={[s.title, { color: colors.text }]}>Transactions</Text>
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
              <View style={[s.dailyRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
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
            <View>
              <TransactionItem
                transaction={item.tx}
                onDelete={() => handleDelete(item.tx.id)}
                onLongPress={async () => {
                  const newPaidDate = item.tx.paid_date ? null : new Date().toISOString().split('T')[0];
                  await markTransactionPaid(item.tx.id, newPaidDate);
                  load();
                }}
              />
              {item.tx.paid_date && (
                <View style={s.paidBadge}>
                  <Ionicons name="checkmark-circle" size={12} color={staticColors.success} />
                  <Text style={s.paidText}>Paid</Text>
                </View>
              )}
            </View>
          );
        }}
        contentContainerStyle={s.list}
        ListEmptyComponent={!loading ? <Text style={[s.empty, { color: colors.textMuted }]}>No transactions this month</Text> : null}
      />

      <TouchableOpacity style={s.fab} onPress={() => router.push('/add-transaction')}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1 },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, paddingTop: 56 },
  title:          { ...typography['2xl'], fontWeight: '700' },
  fab:            { position: 'absolute', bottom: spacing.xl, right: spacing.md, width: 56, height: 56, borderRadius: radius.full, backgroundColor: staticColors.primary, justifyContent: 'center', alignItems: 'center', shadowColor: staticColors.primary, shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 8 },
  filters:        { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  chip:           { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full, borderWidth: 1 },
  chipActive:     { backgroundColor: staticColors.primary, borderColor: staticColors.primary },
  chipText:       { ...typography.sm },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  list:           { padding: spacing.md, paddingBottom: 80 },
  empty:          { ...typography.base, textAlign: 'center', marginTop: spacing.xl },
  paidBadge:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.md, paddingBottom: 4, marginTop: -8 },
  paidText:       { ...typography.xs, color: staticColors.success, fontWeight: '600' },
  dailyRow:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.sm },
  dailyLabel:     { ...typography.base, fontWeight: '600' },
  dailyDate:      { ...typography.xs, marginTop: 2 },
  dailyAmount:    { ...typography.base, fontWeight: '700' },
});
