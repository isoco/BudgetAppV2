import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing, radius, typography } from '../theme';

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
  onAddExpense: (categoryId: string, amount: number, note: string) => Promise<void>;
}

export function BudgetCard({ budget: b, onAddExpense }: Props) {
  const isOver  = b.pct >= 100;
  const isWarn  = b.pct >= 80;
  const barColor = isOver ? colors.danger : isWarn ? colors.warning : colors.success;

  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount]     = useState('');
  const [note, setNote]         = useState('');
  const [saving, setSaving]     = useState(false);

  async function handleAdd() {
    const num = parseFloat(amount);
    if (!num || num <= 0) return Alert.alert('Enter a valid amount');
    setSaving(true);
    try {
      await onAddExpense(b.category_id, num, note);
      setAmount('');
      setNote('');
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={s.card}>
      <View style={s.row}>
        <View style={[s.icon, { backgroundColor: b.category_color + '22' }]}>
          <Text style={s.iconText}>{iconToEmoji(b.category_icon)}</Text>
        </View>
        <View style={s.body}>
          <Text style={s.name}>{b.category_name}</Text>
          <Text style={s.sub}>
            €{b.spent.toFixed(2)} of €{parseFloat(b.amount).toFixed(2)}
          </Text>
        </View>
        <View style={s.right}>
          <Text style={[s.pct, { color: barColor }]}>{b.pct}%</Text>
          <Text style={[s.remaining, { color: isOver ? colors.danger : colors.dark.textMuted }]}>
            {isOver ? `-€${Math.abs(b.remaining).toFixed(2)}` : `€${b.remaining.toFixed(2)} left`}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowForm(v => !v)}
          style={[s.addBtn, { backgroundColor: showForm ? colors.dark.surfaceHigh : colors.primary + '22' }]}
        >
          <Ionicons name={showForm ? 'close' : 'add'} size={18} color={showForm ? colors.dark.textMuted : colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={s.track}>
        <View style={[s.bar, { width: `${Math.min(100, b.pct)}%` as any, backgroundColor: barColor }]} />
      </View>

      {showForm && (
        <View style={s.form}>
          <TextInput
            style={s.amtInput}
            placeholder="€ Amount"
            placeholderTextColor={colors.dark.textSubtle}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
          />
          <TextInput
            style={s.noteInput}
            placeholder="Note (optional)"
            placeholderTextColor={colors.dark.textSubtle}
            value={note}
            onChangeText={setNote}
          />
          <TouchableOpacity
            style={[s.saveBtn, { backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }]}
            onPress={handleAdd}
            disabled={saving}
          >
            <Text style={s.saveBtnText}>Add</Text>
          </TouchableOpacity>
        </View>
      )}
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
  card:      { backgroundColor: colors.dark.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  row:       { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  icon:      { width: 40, height: 40, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center', marginRight: spacing.sm },
  iconText:  { fontSize: 18 },
  body:      { flex: 1 },
  name:      { ...typography.base, color: colors.dark.text, fontWeight: '500' },
  sub:       { ...typography.xs, color: colors.dark.textMuted, marginTop: 2 },
  right:     { alignItems: 'flex-end', marginRight: spacing.sm },
  pct:       { ...typography.sm, fontWeight: '700' },
  remaining: { ...typography.xs },
  addBtn:    { width: 30, height: 30, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  track:     { height: 6, backgroundColor: colors.dark.surfaceHigh, borderRadius: radius.full, overflow: 'hidden' },
  bar:       { height: '100%', borderRadius: radius.full },
  form:      { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm, alignItems: 'center' },
  amtInput:  { width: 90, backgroundColor: colors.dark.surfaceHigh, color: colors.dark.text, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 6, fontSize: 14 },
  noteInput: { flex: 1, backgroundColor: colors.dark.surfaceHigh, color: colors.dark.text, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 6, fontSize: 14 },
  saveBtn:   { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.md },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
