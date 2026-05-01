import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/useTheme';
import { colors as staticColors, spacing, radius, typography } from '../theme';
import type { Transaction } from '../db/queries';

interface Budget {
  id: string;
  amount: string;
  spent: number;
  remaining: number;
  pct: number;
  category_name: string;
  category_icon: string;
  category_color: string;
  category_id: string;
}

interface Props {
  budget: Budget;
  transactions?: Transaction[];
  onAddExpense?: (categoryId: string, amount: number, note: string) => Promise<void>;
  onDeleteExpense?: (txId: string) => Promise<void>;
}

export function BudgetCard({ budget: b, transactions = [], onAddExpense, onDeleteExpense }: Props) {
  const { colors } = useTheme();
  const isOver  = b.pct >= 100;
  const isWarn  = b.pct >= 80;
  const barColor = isOver ? staticColors.danger : isWarn ? staticColors.warning : staticColors.success;

  const [tab, setTab]       = useState<'add' | 'list' | null>(null);
  const [amount, setAmount] = useState('');
  const [note, setNote]     = useState('');
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!onAddExpense) return;
    const num = parseFloat(amount);
    if (!num || num <= 0) return Alert.alert('Enter a valid amount');
    setSaving(true);
    try {
      await onAddExpense(b.category_id, num, note);
      setAmount('');
      setNote('');
      setTab(null);
    } finally {
      setSaving(false);
    }
  }

  function handleEditBudget() {
    router.push(`/set-budget?categoryId=${b.category_id}&amount=${b.amount}`);
  }

  function confirmDelete(tx: Transaction) {
    Alert.alert('Delete expense', `Delete ${tx.note ?? tx.merchant ?? 'this expense'}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDeleteExpense?.(tx.id) },
    ]);
  }

  return (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[s.accentStripe, { backgroundColor: b.category_color }]} />
      <View style={s.inner}>
        {/* Header row */}
        <View style={s.row}>
          <View style={[s.icon, { backgroundColor: b.category_color + '20' }]}>
            <Text style={s.iconText}>{iconToEmoji(b.category_icon)}</Text>
          </View>
          <View style={s.body}>
            <Text style={[s.name, { color: colors.text }]}>{b.category_name}</Text>
            <Text style={[s.sub, { color: colors.textMuted }]}>
              €{b.spent.toFixed(2)} <Text style={{ color: colors.textSubtle }}>of €{parseFloat(b.amount).toFixed(2)}</Text>
            </Text>
          </View>
          <View style={s.right}>
            <Text style={[s.pct, { color: barColor }]}>{b.pct}%</Text>
            <Text style={[s.remaining, { color: isOver ? staticColors.danger : colors.textMuted }]}>
              {isOver ? `-€${Math.abs(b.remaining).toFixed(2)}` : `€${b.remaining.toFixed(2)} left`}
            </Text>
          </View>

          {/* Edit budget amount */}
          <TouchableOpacity onPress={handleEditBudget} style={[s.iconBtn, { backgroundColor: colors.surfaceHigh }]}>
            <Ionicons name="pencil-outline" size={15} color={colors.textMuted} />
          </TouchableOpacity>

          {/* Toggle add form — hidden for past months */}
          {onAddExpense && (
            <TouchableOpacity
              onPress={() => setTab(t => t === 'add' ? null : 'add')}
              style={[s.iconBtn, { backgroundColor: tab === 'add' ? colors.surfaceHigh : staticColors.primary + '18' }]}
            >
              <Ionicons name={tab === 'add' ? 'close' : 'add'} size={17} color={tab === 'add' ? colors.textMuted : staticColors.primary} />
            </TouchableOpacity>
          )}

          {/* Toggle expense list */}
          <TouchableOpacity
            onPress={() => setTab(t => t === 'list' ? null : 'list')}
            style={[s.iconBtn, { backgroundColor: tab === 'list' ? colors.surfaceHigh : staticColors.warning + '18' }]}
          >
            <Ionicons name="list-outline" size={17} color={tab === 'list' ? colors.textMuted : staticColors.warning} />
          </TouchableOpacity>
        </View>

        {/* Progress bar */}
        <View style={[s.track, { backgroundColor: colors.surfaceHigh }]}>
          <View style={[s.bar, { width: `${Math.min(100, b.pct)}%` as any, backgroundColor: barColor }]} />
        </View>

        {/* Add expense form */}
        {tab === 'add' && (
          <View style={[s.form, { borderTopColor: colors.border }]}>
            <TextInput
              style={[s.amtInput, { backgroundColor: colors.surfaceHigh, color: colors.text, borderColor: colors.border }]}
              placeholder="€ Amount"
              placeholderTextColor={colors.textSubtle}
              keyboardType="decimal-pad"
              value={amount}
              onChangeText={setAmount}
            />
            <TextInput
              style={[s.noteInput, { backgroundColor: colors.surfaceHigh, color: colors.text, borderColor: colors.border }]}
              placeholder="Note (optional)"
              placeholderTextColor={colors.textSubtle}
              value={note}
              onChangeText={setNote}
            />
            <TouchableOpacity
              style={[s.saveBtn, { backgroundColor: staticColors.primary, opacity: saving ? 0.6 : 1 }]}
              onPress={handleAdd}
              disabled={saving}
            >
              <Text style={s.saveBtnText}>Add</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Expense list */}
        {tab === 'list' && (
          <View style={[s.txList, { borderTopColor: colors.border }]}>
            {transactions.length === 0 ? (
              <Text style={[s.txEmpty, { color: colors.textSubtle }]}>No expenses recorded this month</Text>
            ) : (
              transactions.map(tx => (
                <View key={tx.id} style={[s.txRow, { borderBottomColor: colors.border }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.txLabel, { color: colors.text }]}>{tx.note ?? tx.merchant ?? tx.category_name ?? 'Expense'}</Text>
                    <Text style={[s.txDate, { color: colors.textSubtle }]}>{tx.date}</Text>
                  </View>
                  <Text style={[s.txAmt, { color: staticColors.danger }]}>-€{tx.amount.toFixed(2)}</Text>
                  <View style={s.txActions}>
                    <TouchableOpacity
                      onPress={() => router.push(`/add-transaction?txId=${tx.id}`)}
                      style={s.txBtn}
                    >
                      <Ionicons name="pencil-outline" size={14} color={staticColors.primary} />
                    </TouchableOpacity>
                    {onDeleteExpense && (
                      <TouchableOpacity onPress={() => confirmDelete(tx)} style={s.txBtn}>
                        <Ionicons name="trash-outline" size={14} color={staticColors.danger} />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </View>
    </View>
  );
}

function iconToEmoji(icon: string): string {
  const map: Record<string, string> = {
    restaurant: '🍽️', car: '🚗', 'bag-handle': '🛍️', flash: '⚡',
    heart: '❤️', tv: '📺', airplane: '✈️', book: '📚',
    briefcase: '💼', laptop: '💻', 'trending-up': '📈', 'ellipsis-horizontal': '•',
    shield: '🛡️', utensils: '🍽️', 'shopping-bag': '🛍️', zap: '⚡',
  };
  return map[icon] ?? '📂';
}

const s = StyleSheet.create({
  card:        { borderRadius: radius.lg, marginBottom: spacing.sm, borderWidth: 1, flexDirection: 'row', overflow: 'hidden' },
  accentStripe:{ width: 3 },
  inner:       { flex: 1, padding: spacing.md },
  row:         { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  icon:        { width: 42, height: 42, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center', marginRight: spacing.sm },
  iconText:    { fontSize: 19 },
  body:        { flex: 1 },
  name:        { ...typography.base, fontWeight: '600' },
  sub:         { ...typography.xs, marginTop: 2 },
  right:       { alignItems: 'flex-end', marginRight: spacing.xs },
  pct:         { ...typography.sm, fontWeight: '800' },
  remaining:   { ...typography.xs, marginTop: 1 },
  iconBtn:     { width: 30, height: 30, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center', marginLeft: 4 },
  track:       { height: 8, borderRadius: radius.full, overflow: 'hidden' },
  bar:         { height: '100%', borderRadius: radius.full },
  form:        { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm, alignItems: 'center', paddingTop: spacing.sm, borderTopWidth: 1 },
  amtInput:    { width: 90, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 7, fontSize: 14, borderWidth: 1 },
  noteInput:   { flex: 1, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 7, fontSize: 14, borderWidth: 1 },
  saveBtn:     { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.md },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  txList:      { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1 },
  txEmpty:     { ...typography.xs, textAlign: 'center', paddingVertical: spacing.sm },
  txRow:       { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  txLabel:     { ...typography.sm, fontWeight: '500' },
  txDate:      { ...typography.xs, marginTop: 1 },
  txAmt:       { ...typography.sm, fontWeight: '700', marginHorizontal: spacing.sm },
  txActions:   { flexDirection: 'row', gap: 6 },
  txBtn:       { padding: 4 },
});
