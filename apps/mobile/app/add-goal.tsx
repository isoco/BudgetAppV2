import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { createGoal } from '../src/db/queries';
import { colors, spacing, radius, typography } from '../src/theme';

const ICONS  = ['🎯','🏠','✈️','💻','🚗','📚','💍','🏋️','🌴','💰','🛡️','🎓'];
const COLORS = ['#10b981','#6366f1','#f59e0b','#ef4444','#3b82f6','#ec4899','#f97316','#06b6d4'];

export default function AddGoalScreen() {
  const [name, setName]     = useState('');
  const [amount, setAmount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [icon, setIcon]     = useState('🎯');
  const [color, setColor]   = useState('#10b981');
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) return Alert.alert('Enter a goal name');
    const num = parseFloat(amount);
    if (!num || num <= 0) return Alert.alert('Enter a valid target amount');
    setSaving(true);
    try {
      await createGoal({ name: name.trim(), icon, color, target_amount: num, deadline: deadline || null });
      router.back();
    } catch {
      Alert.alert('Error', 'Could not save goal');
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
        <Text style={s.title}>New Goal</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <TextInput style={s.input} placeholder="Goal name" placeholderTextColor={colors.dark.textSubtle} value={name} onChangeText={setName} />
        <TextInput style={s.input} placeholder="Target amount (€)" placeholderTextColor={colors.dark.textSubtle} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} />
        <TextInput style={s.input} placeholder="Deadline (YYYY-MM-DD, optional)" placeholderTextColor={colors.dark.textSubtle} value={deadline} onChangeText={setDeadline} />

        <Text style={s.label}>Icon</Text>
        <View style={s.iconGrid}>
          {ICONS.map(ic => (
            <TouchableOpacity key={ic} style={[s.iconBtn, icon === ic && { backgroundColor: color + '33', borderColor: color }]} onPress={() => setIcon(ic)}>
              <Text style={{ fontSize: 22 }}>{ic}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.label}>Color</Text>
        <View style={s.colorRow}>
          {COLORS.map(c => (
            <TouchableOpacity key={c} style={[s.colorDot, { backgroundColor: c }, color === c && s.colorDotActive]} onPress={() => setColor(c)} />
          ))}
        </View>

        <TouchableOpacity style={[s.btn, { backgroundColor: color }, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          <Text style={s.btnText}>{saving ? 'Saving…' : 'Create Goal'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: colors.dark.bg },
  header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, paddingTop: 56 },
  title:         { ...typography.lg, color: colors.dark.text, fontWeight: '600' },
  content:       { padding: spacing.md, paddingBottom: 40 },
  input:         { backgroundColor: colors.dark.surface, borderRadius: radius.md, padding: spacing.md, color: colors.dark.text, ...typography.base, marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.dark.border },
  label:         { ...typography.sm, color: colors.dark.textMuted, marginBottom: spacing.sm, marginTop: spacing.md },
  iconGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  iconBtn:       { width: 48, height: 48, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.dark.border, backgroundColor: colors.dark.surface },
  colorRow:      { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  colorDot:      { width: 32, height: 32, borderRadius: radius.full },
  colorDotActive:{ borderWidth: 3, borderColor: '#fff' },
  btn:           { borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.lg },
  btnText:       { color: '#fff', fontWeight: '600', ...typography.base },
});
