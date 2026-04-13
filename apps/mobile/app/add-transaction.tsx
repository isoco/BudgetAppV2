import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert, Switch } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { getCategories, createTransaction, updateCategory } from '../src/db/queries';
import { useQuery } from '../src/hooks/useQuery';
import { useTheme } from '../src/theme/useTheme';

type TxType = 'expense' | 'income' | 'transfer';

export default function AddTransactionScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const { defaultDate } = useLocalSearchParams<{ defaultDate?: string }>();
  const { data: categories = [] } = useQuery(getCategories);
  const [type, setType]         = useState<TxType>('expense');
  const [amount, setAmount]     = useState('');
  const [note, setNote]         = useState('');
  const [merchant, setMerchant] = useState('');
  const [catId, setCatId]       = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const [recurring, setRecurring] = useState(false);
  const [recurringDay, setRecurringDay] = useState('');

  const filtered = (categories as any[]).filter((c: any) => c.type === type || c.type === 'both');

  async function handleSave() {
    const num = parseFloat(amount);
    if (!amount || isNaN(num) || num <= 0) return Alert.alert('Enter a valid amount');
    if (recurring && catId) {
      const day = parseInt(recurringDay);
      if (!recurringDay || isNaN(day) || day < 1 || day > 31) {
        return Alert.alert('Enter a valid day of month (1–31)');
      }
    }
    setSaving(true);
    try {
      await createTransaction({
        amount: num, type, date: defaultDate ?? format(new Date(), 'yyyy-MM-dd'),
        category_id: catId, note: note || null, merchant: merchant || null,
      });
      // If recurring, update the category
      if (recurring && catId) {
        const day = parseInt(recurringDay);
        await updateCategory(catId, {
          is_recurring: 1,
          default_amount: num,
          due_day: day,
        });
      }
      router.back();
    } catch (e) {
      Alert.alert('Error', 'Could not save transaction');
    } finally {
      setSaving(false);
    }
  }

  const s = makeStyles(colors, spacing, radius);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>Add Transaction</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {/* Type */}
        <View style={s.typeRow}>
          {(['expense', 'income', 'transfer'] as TxType[]).map(t => (
            <TouchableOpacity key={t} style={[s.typeBtn, type === t && s.typeBtnActive]} onPress={() => setType(t)}>
              <Text style={[s.typeBtnText, type === t && s.typeBtnTextActive]}>
                {t[0].toUpperCase() + t.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Amount */}
        <View style={s.amountRow}>
          <Text style={s.currency}>€</Text>
          <TextInput
            style={s.amountInput}
            placeholder="0.00"
            placeholderTextColor={colors.textSubtle}
            keyboardType="decimal-pad"
            value={amount}
            onChangeText={setAmount}
            autoFocus
          />
        </View>

        <TextInput style={s.input} placeholder="Merchant (optional)" placeholderTextColor={colors.textSubtle} value={merchant} onChangeText={setMerchant} />
        <TextInput style={s.input} placeholder="Note (optional)"     placeholderTextColor={colors.textSubtle} value={note}     onChangeText={setNote} />

        {/* Category */}
        <Text style={s.label}>Category</Text>
        <View style={s.catGrid}>
          {(filtered as any[]).map((c: any) => (
            <TouchableOpacity
              key={c.id}
              style={[s.chip, catId === c.id && { backgroundColor: c.color + '33', borderColor: c.color }]}
              onPress={() => setCatId(c.id === catId ? null : c.id)}
            >
              <Ionicons name={c.icon as any} size={16} color={catId === c.id ? c.color : colors.textMuted} />
              <Text style={[s.chipLabel, catId === c.id && { color: c.color }]}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Recurring toggle — only for expense/income, requires a category */}
        {type !== 'transfer' && (
          <View style={s.recurringBox}>
            <View style={s.recurringRow}>
              <View style={{ flex: 1 }}>
                <Text style={s.recurringTitle}>Repeat Monthly</Text>
                <Text style={s.recurringDesc}>Auto-add this transaction every month</Text>
              </View>
              <Switch
                value={recurring}
                onValueChange={v => { setRecurring(v); if (!v) setRecurringDay(''); }}
                trackColor={{ true: colors.primary }}
                thumbColor="#fff"
              />
            </View>
            {recurring && (
              <View style={s.recurringDayRow}>
                <Text style={s.recurringDayLabel}>Day of month:</Text>
                <TextInput
                  style={s.recurringDayInput}
                  value={recurringDay}
                  onChangeText={setRecurringDay}
                  placeholder="1–31"
                  placeholderTextColor={colors.textSubtle}
                  keyboardType="number-pad"
                  maxLength={2}
                />
                {!catId && (
                  <Text style={s.recurringNote}>⚠ Select a category to enable</Text>
                )}
              </View>
            )}
          </View>
        )}

        <TouchableOpacity style={[s.saveBtn, saving && s.saveBtnDisabled]} onPress={handleSave} disabled={saving}>
          <Text style={s.saveBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

function makeStyles(colors: any, spacing: any, radius: any) {
  return StyleSheet.create({
    container:        { flex: 1, backgroundColor: colors.bg },
    header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, paddingTop: 56 },
    title:            { fontSize: 17, color: colors.text, fontWeight: '600' },
    content:          { padding: spacing.md, paddingBottom: 40 },
    typeRow:          { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
    typeBtn:          { flex: 1, padding: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    typeBtnActive:    { backgroundColor: colors.primary, borderColor: colors.primary },
    typeBtnText:      { fontSize: 13, color: colors.textMuted, fontWeight: '500' },
    typeBtnTextActive:{ color: '#fff' },
    amountRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.lg },
    currency:         { fontSize: 24, color: colors.textMuted, marginRight: 4 },
    amountInput:      { fontSize: 52, fontWeight: '700', color: colors.text, minWidth: 120 },
    input:            { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, color: colors.text, fontSize: 15, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border },
    label:            { fontSize: 13, color: colors.textMuted, marginBottom: spacing.sm, marginTop: spacing.sm },
    catGrid:          { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
    chip:             { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
    chipLabel:        { fontSize: 13, color: colors.textMuted },
    recurringBox:     { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.lg, borderWidth: 1, borderColor: colors.border },
    recurringRow:     { flexDirection: 'row', alignItems: 'center' },
    recurringTitle:   { fontSize: 15, color: colors.text, fontWeight: '600', marginBottom: 2 },
    recurringDesc:    { fontSize: 12, color: colors.textMuted },
    recurringDayRow:  { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md, flexWrap: 'wrap' },
    recurringDayLabel:{ fontSize: 13, color: colors.textMuted },
    recurringDayInput:{ backgroundColor: colors.surfaceHigh, borderRadius: radius.md, padding: spacing.sm, color: colors.text, fontSize: 15, width: 60, textAlign: 'center' },
    recurringNote:    { fontSize: 12, color: colors.warning },
    saveBtn:          { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.md },
    saveBtnDisabled:  { opacity: 0.6 },
    saveBtnText:      { color: '#fff', fontWeight: '600', fontSize: 15 },
  });
}
