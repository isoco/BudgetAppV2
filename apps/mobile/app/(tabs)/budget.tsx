import { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getBudgets, createTransaction, deleteTransaction, cascadeOpeningBalances, getTransactions } from '../../src/db/queries';
import type { Transaction } from '../../src/db/queries';
import { useQuery } from '../../src/hooks/useQuery';
import { colors, spacing, radius, typography } from '../../src/theme';
import { BudgetCard } from '../../src/components/BudgetCard';
import { format } from 'date-fns';

export default function BudgetScreen() {
  const now = new Date();
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

  const { data = [], loading, refetch } = useQuery(
    () => getBudgets(viewMonth, viewYear),
    [viewMonth, viewYear]
  );
  const [showHelp, setShowHelp] = useState(false);
  const [txns, setTxns] = useState<Transaction[]>([]);

  const loadTxns = useCallback(async () => {
    const from = `${viewYear}-${String(viewMonth).padStart(2, '0')}-01`;
    const to   = `${viewYear}-${String(viewMonth).padStart(2, '0')}-31`;
    const rows = await getTransactions({ from, to, type: 'expense', limit: 500 });
    setTxns(rows);
  }, [viewMonth, viewYear]);

  useFocusEffect(useCallback(() => {
    refetch();
    loadTxns();
  }, [refetch, loadTxns]));

  async function handleAddExpense(categoryId: string, amount: number, note: string) {
    await createTransaction({
      amount,
      type: 'expense',
      date: format(new Date(), 'yyyy-MM-dd'),
      category_id: categoryId,
      note: note || null,
    });
    await cascadeOpeningBalances(viewMonth, viewYear);
    refetch();
    loadTxns();
  }

  async function handleDeleteExpense(txId: string) {
    await deleteTransaction(txId);
    await cascadeOpeningBalances(viewMonth, viewYear);
    refetch();
    loadTxns();
  }

  const totalBudget = (data as any[]).reduce((s, b) => s + b.amount, 0);
  const totalSpent  = (data as any[]).reduce((s, b) => s + (b.spent ?? 0), 0);
  const overCount   = (data as any[]).filter(b => b.pct >= 100).length;

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Budget</Text>
        <View style={s.headerRight}>
          <TouchableOpacity style={s.helpBtn} onPress={() => setShowHelp(v => !v)}>
            <Ionicons name={showHelp ? 'close-circle-outline' : 'help-circle-outline'} size={22} color={colors.dark.textMuted} />
          </TouchableOpacity>
          {isCurrentMonth && (
            <TouchableOpacity style={s.addBtn} onPress={() => router.push('/set-budget')}>
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={s.monthNav}>
        <TouchableOpacity onPress={prevMonth} style={s.monthBtn}>
          <Ionicons name="chevron-back" size={20} color={colors.dark.text} />
        </TouchableOpacity>
        <Text style={s.monthLabel}>{monthLabel}</Text>
        <TouchableOpacity onPress={nextMonth} style={s.monthBtn} disabled={isCurrentMonth}>
          <Ionicons name="chevron-forward" size={20} color={isCurrentMonth ? colors.dark.textSubtle : colors.dark.text} />
        </TouchableOpacity>
      </View>

      {showHelp && (
        <View style={s.helpCard}>
          <Text style={s.helpTitle}>How Budgets Work</Text>
          <Text style={s.helpText}>
            {'• Set a monthly spending limit per expense category.\n'}
            {'• As you record expenses, each card shows % used.\n'}
            {'• Green = under budget, Red = over budget.\n'}
            {'• Budgets are per-month — they don\'t roll over.\n'}
            {'• Tap + to add or update a budget for any category.'}
          </Text>
        </View>
      )}

      <View style={s.summary}>
        <SummaryItem label="Spent"     value={`€${totalSpent.toFixed(0)}`} />
        <View style={s.summaryDivider} />
        <SummaryItem label="Remaining" value={`€${(totalBudget - totalSpent).toFixed(0)}`} />
        <View style={s.summaryDivider} />
        <SummaryItem label="Over"      value={String(overCount)} danger={overCount > 0} />
      </View>

      <FlatList
        data={data as any[]}
        keyExtractor={b => b.id}
        refreshing={loading}
        onRefresh={refetch}
        renderItem={({ item }) => (
          <BudgetCard
            budget={item}
            transactions={txns.filter(t => t.category_id === item.category_id)}
            onAddExpense={isCurrentMonth ? handleAddExpense : undefined}
            onDeleteExpense={isCurrentMonth ? handleDeleteExpense : undefined}
          />
        )}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          !loading ? (
            <View style={s.empty}>
              <Text style={s.emptyText}>No budgets set</Text>
              <TouchableOpacity onPress={() => router.push('/set-budget')}>
                <Text style={s.emptyAction}>Set your first budget →</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
      />
    </View>
  );
}

function SummaryItem({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text style={[{ ...typography.xl, color: colors.dark.text, fontWeight: '700' }, danger && { color: colors.danger }]}>{value}</Text>
      <Text style={{ ...typography.xs, color: colors.dark.textMuted, marginTop: 2 }}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: colors.dark.bg },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, paddingTop: 56 },
  title:          { ...typography['2xl'], color: colors.dark.text, fontWeight: '700' },
  headerRight:    { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  helpBtn:        { padding: 4 },
  addBtn:         { width: 36, height: 36, borderRadius: radius.full, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  helpCard:       { marginHorizontal: spacing.md, marginBottom: spacing.sm, backgroundColor: colors.dark.surface, borderRadius: radius.lg, padding: spacing.md, borderLeftWidth: 3, borderLeftColor: colors.primary },
  helpTitle:      { ...typography.base, color: colors.dark.text, fontWeight: '700', marginBottom: spacing.xs },
  helpText:       { ...typography.sm, color: colors.dark.textMuted, lineHeight: 20 },
  monthNav:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.xs, marginBottom: spacing.xs },
  monthBtn:       { padding: spacing.sm },
  monthLabel:     { ...typography.base, color: colors.dark.text, fontWeight: '600', minWidth: 140, textAlign: 'center' },
  summary:        { flexDirection: 'row', justifyContent: 'space-around', backgroundColor: colors.dark.surface, marginHorizontal: spacing.md, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
  summaryDivider: { width: 1, backgroundColor: colors.dark.border },
  list:           { padding: spacing.md, paddingBottom: 80 },
  empty:          { alignItems: 'center', marginTop: spacing.xl },
  emptyText:      { ...typography.base, color: colors.dark.textMuted, marginBottom: spacing.sm },
  emptyAction:    { ...typography.base, color: colors.primary, fontWeight: '600' },
});
