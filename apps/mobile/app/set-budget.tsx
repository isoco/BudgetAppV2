import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getCategories, upsertBudget } from '../src/db/queries';
import { useQuery } from '../src/hooks/useQuery';
import { colors, spacing, radius, typography } from '../src/theme';

function iconToEmoji(icon: string): string {
  const map: Record<string, string> = { utensils:'🍽️',car:'🚗','shopping-bag':'🛍️',zap:'⚡',heart:'❤️',tv:'📺',plane:'✈️',book:'📚',briefcase:'💼',laptop:'💻','trending-up':'📈','more-horizontal':'•••' };
  return map[icon] ?? '📂';
}

export default function SetBudgetScreen() {
  const now = new Date();
  const params = useLocalSearchParams<{ categoryId?: string; amount?: string }>();
  const { data: categories = [] } = useQuery(getCategories);
  const [catId, setCatId]   = useState<string | null>(params.categoryId ?? null);
  const [amount, setAmount] = useState(params.amount ?? '');
  const [saving, setSaving] = useState(false);

  const expenseCats = (categories as any[]).filter(c => c.type === 'expense' || c.type === 'both');

  async function handleSave() {
    if (!catId)  return Alert.alert('Select a category');
    const num = parseFloat(amount);
    if (!num || num <= 0) return Alert.alert('Enter a valid amount');
    setSaving(true);
    try {
      await upsertBudget({ category_id: catId, amount: num, month: now.getMonth() + 1, year: now.getFullYear() });
      router.back();
    } catch {
      Alert.alert('Error', 'Could not save budget');
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={colors.dark.text} />
        </TouchableOpacity>
        <Text style={s.title}>Set Budget</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.label}>Category</Text>
        <View style={s.grid}>
          {expenseCats.map((c: any) => (
            <TouchableOpacity
              key={c.id}
              style={[s.chip, catId === c.id && { backgroundColor: c.color + '33', borderColor: c.color }]}
              onPress={() => setCatId(c.id)}
            >
              <Text>{iconToEmoji(c.icon)}</Text>
              <Text style={[s.chipLabel, catId === c.id && { color: c.color }]}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.label}>Monthly Limit</Text>
        <TextInput
          style={s.input}
          placeholder="€0.00"
          placeholderTextColor={colors.dark.textSubtle}
          keyboardType="decimal-pad"
          value={amount}
          onChangeText={setAmount}
        />

        <TouchableOpacity style={[s.btn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          <Text style={s.btnText}>{saving ? 'Saving…' : 'Save Budget'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.dark.bg },
  header:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, paddingTop: 56 },
  title:     { ...typography.lg, color: colors.dark.text, fontWeight: '600' },
  content:   { padding: spacing.md, paddingBottom: 40 },
  label:     { ...typography.sm, color: colors.dark.textMuted, marginBottom: spacing.sm, marginTop: spacing.md },
  grid:      { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip:      { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1, borderColor: colors.dark.border, backgroundColor: colors.dark.surface },
  chipLabel: { ...typography.sm, color: colors.dark.textMuted },
  input:     { backgroundColor: colors.dark.surface, borderRadius: radius.md, padding: spacing.md, color: colors.dark.text, ...typography.base, borderWidth: 1, borderColor: colors.dark.border },
  btn:       { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.lg },
  btnText:   { color: '#fff', fontWeight: '600', ...typography.base },
});
