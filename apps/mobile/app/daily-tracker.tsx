import { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, TextInput, Modal,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/useTheme';
import { getDailyTracking, initDailyTracking, upsertDailyEntry, getSettings, DailyEntry } from '../src/db/queries';

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function DailyTrackerScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const s = makeStyles(colors, spacing, radius);

  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [editDay, setEditDay] = useState<DailyEntry | null>(null);
  const [editAllowed, setEditAllowed] = useState('');
  const [editSpent, setEditSpent]     = useState('');
  const [editNotes, setEditNotes]     = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [defaultAllowed, setDefaultAllowed] = useState(30);

  const load = useCallback(async () => {
    const s2 = await getSettings();
    const da = s2.daily_limit > 0 ? s2.daily_limit : 30;
    setDefaultAllowed(da);
    await initDailyTracking(year, month, da);
    const data = await getDailyTracking(year, month);
    setEntries(data);
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

  function openEdit(entry: DailyEntry) {
    setEditDay(entry);
    setEditAllowed(String(entry.allowed_amount));
    setEditSpent(entry.spent_amount > 0 ? String(entry.spent_amount) : '');
    setEditNotes(entry.notes ?? '');
    setModalVisible(true);
  }

  async function handleSave() {
    if (!editDay) return;
    await upsertDailyEntry({
      year, month, day: editDay.day,
      allowed_amount: parseFloat(editAllowed) || defaultAllowed,
      spent_amount:   parseFloat(editSpent)   || 0,
      notes:          editNotes || null,
    });
    setModalVisible(false);
    load();
  }

  // Build calendar grid
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const today = now.getFullYear() === year && now.getMonth() + 1 === month ? now.getDate() : -1;

  const entryMap: Record<number, DailyEntry> = {};
  for (const e of entries) entryMap[e.day] = e;

  // Summary
  const totalAllowed = entries.reduce((sum, e) => sum + e.allowed_amount, 0);
  const totalSpent   = entries.reduce((sum, e) => sum + e.spent_amount, 0);
  const surplus      = totalAllowed - totalSpent;

  const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  // Build calendar cells (empty + day cells)
  const cells: (number | null)[] = [...Array(firstDayOfWeek).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

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
        <SummaryCell label="Allowed" value={`€${totalAllowed.toFixed(0)}`} color={colors.text} />
        <SummaryCell label="Spent"   value={`€${totalSpent.toFixed(0)}`}   color={colors.danger} />
        <SummaryCell label={surplus >= 0 ? 'Surplus' : 'Deficit'} value={`€${Math.abs(surplus).toFixed(0)}`} color={surplus >= 0 ? colors.success : colors.danger} />
      </View>

      <ScrollView contentContainerStyle={s.calendar}>
        {/* Day headers */}
        <View style={s.weekRow}>
          {DAY_NAMES.map(d => <Text key={d} style={s.dayHeader}>{d}</Text>)}
        </View>

        {/* Day grid */}
        <View style={s.grid}>
          {cells.map((day, idx) => {
            if (day === null) return <View key={`e${idx}`} style={s.emptyCell} />;
            const entry = entryMap[day];
            const isToday = day === today;
            const isOverdraft = entry && entry.spent_amount > entry.allowed_amount;
            const isSurplus   = entry && entry.spent_amount > 0 && entry.spent_amount <= entry.allowed_amount;
            const isPast      = day < today;

            return (
              <TouchableOpacity
                key={day}
                style={[
                  s.dayCell,
                  isToday      && { borderColor: colors.primary, borderWidth: 2 },
                  isOverdraft  && isPast && { backgroundColor: colors.danger + '22' },
                  isSurplus    && isPast && { backgroundColor: colors.success + '22' },
                ]}
                onPress={() => entry && openEdit(entry)}
              >
                <Text style={[s.dayNum, isToday && { color: colors.primary }]}>{day}</Text>
                {entry && entry.spent_amount > 0 ? (
                  <>
                    <Text style={[s.daySpent, { color: isOverdraft ? colors.danger : colors.text }]}>
                      ${entry.spent_amount.toFixed(0)}
                    </Text>
                    <Text style={[s.dayDiff, { color: isOverdraft ? colors.danger : colors.success }]}>
                      {isOverdraft ? '-' : '+'}€{Math.abs(entry.allowed_amount - entry.spent_amount).toFixed(0)}
                    </Text>
                  </>
                ) : (
                  <Text style={s.dayAllowed}>€{(entry?.allowed_amount ?? defaultAllowed).toFixed(0)}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Edit Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Day {editDay?.day}</Text>
            <Text style={s.label}>Allowed (€)</Text>
            <TextInput style={s.input} value={editAllowed} onChangeText={setEditAllowed} keyboardType="decimal-pad" placeholderTextColor={colors.textSubtle} />
            <Text style={s.label}>Spent (€)</Text>
            <TextInput style={s.input} value={editSpent} onChangeText={setEditSpent} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={colors.textSubtle} />
            <Text style={s.label}>Notes</Text>
            <TextInput style={[s.input, { height: 64 }]} value={editNotes} onChangeText={setEditNotes} multiline placeholder="Optional notes" placeholderTextColor={colors.textSubtle} />
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

function SummaryCell({ label, value, color }: { label: string; value: string; color: string }) {
  const { colors, typography } = useTheme();
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 2 }}>{label}</Text>
      <Text style={{ fontSize: 18, color, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

function makeStyles(colors: any, spacing: any, radius: any) {
  return StyleSheet.create({
    container:    { flex: 1, backgroundColor: colors.bg },
    header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, paddingTop: 56 },
    monthNav:     { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    monthTitle:   { fontSize: 16, color: colors.text, fontWeight: '600', minWidth: 150, textAlign: 'center' },
    summary:      { flexDirection: 'row', backgroundColor: colors.surface, padding: spacing.md, marginHorizontal: spacing.md, borderRadius: radius.lg, marginBottom: spacing.md },
    calendar:     { paddingHorizontal: spacing.md, paddingBottom: 80 },
    weekRow:      { flexDirection: 'row', marginBottom: spacing.xs },
    dayHeader:    { flex: 1, textAlign: 'center', fontSize: 11, color: colors.textMuted, fontWeight: '600' },
    grid:         { flexDirection: 'row', flexWrap: 'wrap' },
    dayCell:      { width: `${100/7}%` as any, aspectRatio: 1, padding: 3, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    emptyCell:    { width: `${100/7}%` as any, aspectRatio: 1 },
    dayNum:       { fontSize: 10, color: colors.textMuted, alignSelf: 'flex-start', fontWeight: '600' },
    daySpent:     { fontSize: 11, fontWeight: '700', marginTop: 1 },
    dayDiff:      { fontSize: 9 },
    dayAllowed:   { fontSize: 10, color: colors.textSubtle },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalCard:    { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 40 },
    modalTitle:   { fontSize: 18, color: colors.text, fontWeight: '700', marginBottom: spacing.md, textAlign: 'center' },
    label:        { fontSize: 12, color: colors.textMuted, fontWeight: '600', marginTop: spacing.md, marginBottom: spacing.xs, textTransform: 'uppercase' },
    input:        { backgroundColor: colors.surfaceHigh, borderRadius: radius.md, padding: spacing.md, color: colors.text, fontSize: 15 },
    modalBtns:    { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
    cancelBtn:    { flex: 1, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    saveBtn:      { flex: 1, padding: spacing.md, borderRadius: radius.md, backgroundColor: colors.primary, alignItems: 'center' },
  });
}
