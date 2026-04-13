import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Modal, TextInput, Alert,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useTheme } from '../src/theme/useTheme';
import { getFuelEntries, createFuelEntry, deleteFuelEntry, getFuelMonthSummary, FuelEntry } from '../src/db/queries';

const VEHICLES = ['Car', 'Moto', 'Truck', 'Other'] as const;

export default function FuelTrackerScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const s = makeStyles(colors, spacing, radius);

  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [entries, setEntries] = useState<FuelEntry[]>([]);
  const [summary, setSummary] = useState({ total: 0, count: 0 });
  const [modalVisible, setModalVisible] = useState(false);
  const [formDate, setFormDate]         = useState(format(now, 'yyyy-MM-dd'));
  const [formVehicle, setFormVehicle]   = useState<string>('Car');
  const [formAmount, setFormAmount]     = useState('');
  const [formLiters, setFormLiters]     = useState('');
  const [formNotes, setFormNotes]       = useState('');

  const load = useCallback(async () => {
    const [data, sum] = await Promise.all([
      getFuelEntries(year, month),
      getFuelMonthSummary(year, month),
    ]);
    setEntries(data);
    setSummary(sum);
  }, [year, month]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  }

  function openAdd() {
    setFormDate(format(new Date(year, month - 1, now.getDate()), 'yyyy-MM-dd'));
    setFormVehicle('Car');
    setFormAmount(''); setFormLiters(''); setFormNotes('');
    setModalVisible(true);
  }

  async function handleSave() {
    const amount = parseFloat(formAmount);
    if (!amount || amount <= 0) { Alert.alert('Error', 'Amount is required'); return; }
    await createFuelEntry({
      year, month,
      date: formDate,
      vehicle: formVehicle,
      amount,
      liters: formLiters ? parseFloat(formLiters) : null,
      notes: formNotes || null,
    });
    setModalVisible(false);
    load();
  }

  async function handleDelete(id: string) {
    Alert.alert('Delete', 'Remove this fuel entry?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await deleteFuelEntry(id);
        load();
      }},
    ]);
  }

  const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <View style={s.container}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={s.monthNav}>
          <TouchableOpacity onPress={prevMonth}><Ionicons name="chevron-back" size={20} color={colors.text} /></TouchableOpacity>
          <Text style={s.monthTitle}>{monthName}</Text>
          <TouchableOpacity onPress={nextMonth}><Ionicons name="chevron-forward" size={20} color={colors.text} /></TouchableOpacity>
        </View>
        <View style={{ width: 24 }} />
      </View>

      {/* Summary */}
      <View style={s.summary}>
        <View style={s.summaryItem}>
          <Text style={s.summaryLabel}>Total Spent</Text>
          <Text style={[s.summaryValue, { color: colors.danger }]}>€{summary.total.toFixed(2)}</Text>
        </View>
        <View style={s.summaryItem}>
          <Text style={s.summaryLabel}>Entries</Text>
          <Text style={s.summaryValue}>{summary.count}</Text>
        </View>
      </View>

      <FlatList
        data={entries}
        keyExtractor={e => e.id}
        contentContainerStyle={s.list}
        ListEmptyComponent={<Text style={s.empty}>No fuel entries this month</Text>}
        renderItem={({ item }) => (
          <View style={s.entryCard}>
            <View style={s.entryIcon}>
              <Ionicons name="car" size={20} color={colors.warning} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={s.entryRow}>
                <Text style={s.entryVehicle}>{item.vehicle}</Text>
                <Text style={s.entryAmount}>€{item.amount.toFixed(2)}</Text>
              </View>
              <View style={s.entryRow}>
                <Text style={s.entryDate}>{item.date}</Text>
                {item.liters && (
                  <Text style={s.entryMeta}>
                    {item.liters.toFixed(1)}L{item.price_per_liter ? ` · €${item.price_per_liter.toFixed(2)}/L` : ''}
                  </Text>
                )}
              </View>
              {item.notes && <Text style={s.entryNotes}>{item.notes}</Text>}
            </View>
            <TouchableOpacity onPress={() => handleDelete(item.id)} style={{ padding: spacing.xs }}>
              <Ionicons name="trash-outline" size={18} color={colors.danger} />
            </TouchableOpacity>
          </View>
        )}
      />

      {/* FAB */}
      <TouchableOpacity style={s.fab} onPress={openAdd}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Add Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Add Fuel Entry</Text>

            <Text style={s.label}>Date (YYYY-MM-DD)</Text>
            <TextInput style={s.input} value={formDate} onChangeText={setFormDate} placeholderTextColor={colors.textSubtle} />

            <Text style={s.label}>Vehicle</Text>
            <View style={s.vehicleRow}>
              {VEHICLES.map(v => (
                <TouchableOpacity
                  key={v}
                  style={[s.vehicleBtn, formVehicle === v && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => setFormVehicle(v)}
                >
                  <Text style={[s.vehicleBtnText, formVehicle === v && { color: '#fff' }]}>{v}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.label}>Amount (€) *</Text>
            <TextInput style={s.input} value={formAmount} onChangeText={setFormAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textSubtle} />

            <Text style={s.label}>Liters (optional)</Text>
            <TextInput style={s.input} value={formLiters} onChangeText={setFormLiters} keyboardType="decimal-pad" placeholder="e.g. 40.5" placeholderTextColor={colors.textSubtle} />

            <Text style={s.label}>Notes (optional)</Text>
            <TextInput style={s.input} value={formNotes} onChangeText={setFormNotes} placeholder="Optional" placeholderTextColor={colors.textSubtle} />

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={{ color: colors.textMuted }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function makeStyles(colors: any, spacing: any, radius: any) {
  return StyleSheet.create({
    container:     { flex: 1, backgroundColor: colors.bg },
    header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, paddingTop: 56 },
    monthNav:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    monthTitle:    { fontSize: 16, color: colors.text, fontWeight: '600', minWidth: 160, textAlign: 'center' },
    summary:       { flexDirection: 'row', backgroundColor: colors.surface, marginHorizontal: spacing.md, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md },
    summaryItem:   { flex: 1, alignItems: 'center' },
    summaryLabel:  { fontSize: 12, color: colors.textMuted, marginBottom: 4 },
    summaryValue:  { fontSize: 20, color: colors.text, fontWeight: '700' },
    list:          { padding: spacing.md, paddingBottom: 100 },
    empty:         { textAlign: 'center', color: 'rgba(255,255,255,0.3)', marginTop: 40, fontSize: 15 },
    entryCard:     { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm, gap: spacing.md },
    entryIcon:     { width: 40, height: 40, borderRadius: radius.full, backgroundColor: colors.warning + '22', justifyContent: 'center', alignItems: 'center' },
    entryRow:      { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
    entryVehicle:  { fontSize: 15, color: colors.text, fontWeight: '600' },
    entryAmount:   { fontSize: 15, color: colors.warning, fontWeight: '700' },
    entryDate:     { fontSize: 12, color: colors.textMuted },
    entryMeta:     { fontSize: 12, color: colors.textMuted },
    entryNotes:    { fontSize: 12, color: colors.textSubtle, marginTop: 2 },
    fab:           { position: 'absolute', bottom: 32, right: spacing.md, width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: colors.primary, shadowOpacity: 0.5, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } },
    modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalCard:     { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 40 },
    modalTitle:    { fontSize: 18, color: colors.text, fontWeight: '700', marginBottom: spacing.md, textAlign: 'center' },
    label:         { fontSize: 12, color: colors.textMuted, fontWeight: '600', marginTop: spacing.md, marginBottom: spacing.xs, textTransform: 'uppercase' },
    input:         { backgroundColor: colors.surfaceHigh, borderRadius: radius.md, padding: spacing.md, color: colors.text, fontSize: 15 },
    vehicleRow:    { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
    vehicleBtn:    { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
    vehicleBtnText:{ color: colors.textMuted, fontSize: 14 },
    modalBtns:     { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
    cancelBtn:     { flex: 1, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    saveBtn:       { flex: 1, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
  });
}
