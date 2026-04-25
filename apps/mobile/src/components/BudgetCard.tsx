import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/useTheme';
import { colors as staticColors, spacing, radius, typography, shadow } from '../theme';

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
  const { colors } = useTheme();
  const isOver  = b.pct >= 100;
  const isWarn  = b.pct >= 80;
  const barColor = isOver ? staticColors.danger : isWarn ? staticColors.warning : staticColors.success;

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
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Left accent stripe */}
      <View style={[s.accentStripe, { backgroundColor: b.category_color }]} />

      <View style={s.inner}>
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
          <TouchableOpacity
            onPress={() => setShowForm(v => !v)}
            style={[s.addBtn, { backgroundColor: showForm ? colors.surfaceHigh : staticColors.primary + '18' }]}
          >
            <Ionicons name={showForm ? 'close' : 'add'} size={18} color={showForm ? colors.textMuted : staticColors.primary} />
          </TouchableOpacity>
        </View>

        {/* Progress bar */}
        <View style={[s.track, { backgroundColor: colors.surfaceHigh }]}>
          <View style={[s.bar, { width: `${Math.min(100, b.pct)}%` as any, backgroundColor: barColor }]} />
        </View>

        {showForm && (
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
  right:       { alignItems: 'flex-end', marginRight: spacing.sm },
  pct:         { ...typography.sm, fontWeight: '800' },
  remaining:   { ...typography.xs, marginTop: 1 },
  addBtn:      { width: 32, height: 32, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  track:       { height: 8, borderRadius: radius.full, overflow: 'hidden' },
  bar:         { height: '100%', borderRadius: radius.full },
  form:        { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.sm, alignItems: 'center', paddingTop: spacing.sm, borderTopWidth: 1 },
  amtInput:    { width: 90, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 7, fontSize: 14, borderWidth: 1 },
  noteInput:   { flex: 1, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 7, fontSize: 14, borderWidth: 1 },
  saveBtn:     { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.md },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
