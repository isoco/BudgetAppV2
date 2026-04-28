import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { createDailySpend, getDailySpendTotal } from '../src/db/queries';
import { colors, spacing, radius, typography } from '../src/theme';

export default function WidgetDailySpendScreen() {
  const today    = format(new Date(), 'yyyy-MM-dd');
  const label    = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  const [amount, setAmount]   = useState('');
  const [note, setNote]       = useState('');
  const [total, setTotal]     = useState(0);
  const [saving, setSaving]   = useState(false);

  useEffect(() => {
    getDailySpendTotal(today).then(setTotal);
  }, []);

  async function handleSave() {
    const num = parseFloat(amount);
    if (!num || num <= 0) return;
    setSaving(true);
    try {
      await createDailySpend({ date: today, amount: num, note: note || null });
      const newTotal = await getDailySpendTotal(today);
      setTotal(newTotal);
      setAmount('');
      setNote('');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={s.overlay}>
      <View style={s.sheet}>
        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.title}>Log Spending</Text>
            <Text style={s.date}>{label}</Text>
          </View>
          <TouchableOpacity onPress={() => router.back()} style={s.closeBtn}>
            <Ionicons name="close" size={20} color={colors.dark.textMuted} />
          </TouchableOpacity>
        </View>

        {/* Today's total */}
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>Spent today</Text>
          <Text style={s.totalValue}>€{total.toFixed(2)}</Text>
        </View>

        {/* Input */}
        <TextInput
          style={s.amountInput}
          placeholder="€ Amount"
          placeholderTextColor={colors.dark.textSubtle}
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
          autoFocus
        />
        <TextInput
          style={s.noteInput}
          placeholder="Note (optional)"
          placeholderTextColor={colors.dark.textSubtle}
          value={note}
          onChangeText={setNote}
          returnKeyType="done"
          onSubmitEditing={handleSave}
        />

        <TouchableOpacity
          style={[s.saveBtn, (!amount || saving) && { opacity: 0.5 }]}
          onPress={handleSave}
          disabled={!amount || saving}
        >
          {saving
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={s.saveBtnText}>Add Expense</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity style={s.openFullBtn} onPress={() => router.replace('/(tabs)')}>
          <Text style={s.openFullText}>Open full app →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  overlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  sheet:        { backgroundColor: colors.dark.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: spacing.lg, paddingBottom: 40 },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.md },
  title:        { ...typography.xl, color: colors.dark.text, fontWeight: '700' },
  date:         { ...typography.sm, color: colors.dark.textMuted, marginTop: 2 },
  closeBtn:     { padding: 4 },
  totalRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.dark.surfaceHigh, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md },
  totalLabel:   { ...typography.sm, color: colors.dark.textMuted },
  totalValue:   { ...typography.xl, color: colors.primary, fontWeight: '800' },
  amountInput:  { backgroundColor: colors.dark.surfaceHigh, borderRadius: radius.md, padding: spacing.md, color: colors.dark.text, ...typography.xl, fontWeight: '600', marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.dark.border },
  noteInput:    { backgroundColor: colors.dark.surfaceHigh, borderRadius: radius.md, padding: spacing.md, color: colors.dark.text, ...typography.base, marginBottom: spacing.md, borderWidth: 1, borderColor: colors.dark.border },
  saveBtn:      { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginBottom: spacing.sm },
  saveBtnText:  { color: '#fff', fontWeight: '700', ...typography.base },
  openFullBtn:  { alignItems: 'center', paddingVertical: spacing.sm },
  openFullText: { ...typography.sm, color: colors.dark.textMuted },
});
