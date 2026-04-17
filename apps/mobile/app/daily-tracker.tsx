import { useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, TextInput, Modal, ActivityIndicator,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useTheme } from '../src/theme/useTheme';
import {
  getDailyTracking, initDailyTracking, upsertDailyEntry, getSettings, DailyEntry,
  getMonthExpenseTotalsByDay, createTransaction, getTransactions,
  getCategories, Category, Transaction,
} from '../src/db/queries';

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

export default function DailyTrackerScreen() {
  const { colors, spacing, radius } = useTheme();
  const s = makeStyles(colors, spacing, radius);

  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [entries, setEntries]         = useState<DailyEntry[]>([]);
  const [txTotals, setTxTotals]       = useState<Record<number, number>>({});
  const [defaultAllowed, setDefaultAllowed] = useState(30);

  // Day modal
  const [modalVisible, setModalVisible] = useState(false);
  const [modalDay, setModalDay]         = useState<DailyEntry | null>(null);
  const [editAllowed, setEditAllowed]   = useState('');
  // Inline add expense
  const [addAmount, setAddAmount]       = useState('');
  const [addNote, setAddNote]           = useState('');
  const [categories, setCategories]     = useState<Category[]>([]);
  const [addCatId, setAddCatId]         = useState<string | null>(null);
  const [saving, setSaving]             = useState(false);
  const [dayTxs, setDayTxs]             = useState<Transaction[]>([]);

  const load = useCallback(async () => {
    const s2 = await getSettings();
    const da = s2.daily_limit > 0 ? s2.daily_limit : 30;
    setDefaultAllowed(da);
    await initDailyTracking(year, month, da);
    const [data, totals, cats] = await Promise.all([
      getDailyTracking(year, month),
      getMonthExpenseTotalsByDay(year, month),
      getCategories({ type: 'expense' }),
    ]);
    setEntries(data);
    setTxTotals(totals);
    setCategories(cats as Category[]);
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

  async function openDay(entry: DailyEntry) {
    setModalDay(entry);
    setEditAllowed(String(entry.allowed_amount));
    setAddAmount('');
    setAddNote('');
    setAddCatId(null);
    setDayTxs([]);
    setModalVisible(true);
    const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(entry.day).padStart(2,'0')}`;
    const txs = await getTransactions({ from: dateStr, to: dateStr, type: 'expense', limit: 100 });
    setDayTxs(txs);
  }

  async function handleSaveBudget() {
    if (!modalDay) return;
    await upsertDailyEntry({
      year, month, day: modalDay.day,
      allowed_amount: parseFloat(editAllowed) || defaultAllowed,
      spent_amount: modalDay.spent_amount,
      notes: null,
    });
    load();
  }

  async function handleAddExpense() {
    if (!modalDay) return;
    const num = parseFloat(addAmount);
    if (!num || num <= 0) { Alert.alert('Enter a valid amount'); return; }
    setSaving(true);
    try {
      const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(modalDay.day).padStart(2,'0')}`;
      await createTransaction({
        amount: num,
        type: 'expense',
        date: dateStr,
        category_id: addCatId,
        note: addNote || null,
      });
      const newSpent = modalDay.spent_amount + num;
      await upsertDailyEntry({
        year, month, day: modalDay.day,
        allowed_amount: parseFloat(editAllowed) || defaultAllowed,
        spent_amount: newSpent,
        notes: null,
      });
      setModalDay(prev => prev ? { ...prev, spent_amount: newSpent } : prev);
      setAddAmount('');
      setAddNote('');
      setAddCatId(null);
      const [totals, data, txs] = await Promise.all([
        getMonthExpenseTotalsByDay(year, month),
        getDailyTracking(year, month),
        getTransactions({ from: dateStr, to: dateStr, type: 'expense', limit: 100 }),
      ]);
      setTxTotals(totals);
      setEntries(data);
      setDayTxs(txs);
    } finally {
      setSaving(false);
    }
  }

  // Build calendar grid
  const daysInMonth    = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  const today          = now.getFullYear() === year && now.getMonth() + 1 === month ? now.getDate() : -1;

  const entryMap: Record<number, DailyEntry> = {};
  for (const e of entries) entryMap[e.day] = e;

  // Summary uses real transaction totals
  const totalAllowed = entries.reduce((sum, e) => sum + e.allowed_amount, 0);
  const totalSpent   = Object.values(txTotals).reduce((s, v) => s + v, 0);
  const surplus      = totalAllowed - totalSpent;

  const monthName = new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  const cells: (number | null)[] = [...Array(firstDayOfWeek).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const modalDateStr = modalDay
    ? `${year}-${String(month).padStart(2,'0')}-${String(modalDay.day).padStart(2,'0')}`
    : '';
  const modalSpentTotal = modalDay ? modalDay.spent_amount : 0;
  const modalAllowed    = parseFloat(editAllowed) || defaultAllowed;

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
        <SummaryCell label="Budget"  value={`€${totalAllowed.toFixed(0)}`}          color={colors.text} />
        <SummaryCell label="Spent"   value={`€${totalSpent.toFixed(0)}`}            color={colors.danger} />
        <SummaryCell label={surplus >= 0 ? 'Surplus' : 'Deficit'} value={`€${Math.abs(surplus).toFixed(0)}`} color={surplus >= 0 ? colors.success : colors.danger} />
      </View>

      <ScrollView contentContainerStyle={s.calendar}>
        <View style={s.weekRow}>
          {DAY_NAMES.map(d => <Text key={d} style={s.dayHeader}>{d}</Text>)}
        </View>
        <View style={s.grid}>
          {cells.map((day, idx) => {
            if (day === null) return <View key={`e${idx}`} style={s.emptyCell} />;
            const entry     = entryMap[day];
            const spent     = entry?.spent_amount ?? 0;
            const allowed   = entry?.allowed_amount ?? defaultAllowed;
            const isToday   = day === today;
            const isOver    = spent > 0 && spent > allowed;
            const isGood    = spent > 0 && spent <= allowed;
            const isPast    = day < today;

            return (
              <TouchableOpacity
                key={day}
                style={[
                  s.dayCell,
                  isToday && { borderColor: colors.primary, borderWidth: 2 },
                  isOver  && isPast && { backgroundColor: colors.danger  + '22' },
                  isGood  && isPast && { backgroundColor: colors.success + '22' },
                ]}
                onPress={() => entry && openDay(entry)}
              >
                <Text style={[s.dayNum, isToday && { color: colors.primary }]}>{day}</Text>
                {spent > 0 ? (
                  <>
                    <Text style={[s.daySpent, { color: isOver ? colors.danger : colors.text }]}>
                      €{spent.toFixed(0)}
                    </Text>
                    <Text style={[s.dayDiff, { color: isOver ? colors.danger : colors.success }]}>
                      {isOver ? '-' : '+'}€{Math.abs(allowed - spent).toFixed(0)}
                    </Text>
                  </>
                ) : (
                  <Text style={s.dayAllowed}>€{allowed.toFixed(0)}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Day Modal */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>
                {modalDay ? format(new Date(modalDateStr + 'T12:00:00'), 'EEEE, MMM d') : ''}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <Ionicons name="close" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

            {/* Budget row */}
            <View style={s.budgetRow}>
              <Text style={s.budgetLabel}>Daily budget €</Text>
              <TextInput
                style={s.budgetInput}
                value={editAllowed}
                onChangeText={setEditAllowed}
                keyboardType="decimal-pad"
                onEndEditing={handleSaveBudget}
                placeholderTextColor={colors.textSubtle}
              />
              <Text style={[s.budgetStatus, { color: modalSpentTotal > modalAllowed ? colors.danger : colors.success }]}>
                Spent €{modalSpentTotal.toFixed(2)}
              </Text>
            </View>

            {/* Expenses list */}
            {dayTxs.length > 0 && (
              <>
                <Text style={s.sectionLabel}>Expenses</Text>
                {dayTxs.map(tx => (
                  <View key={tx.id} style={s.txRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.txLabel} numberOfLines={1}>
                        {tx.merchant || tx.note || tx.category_name || 'Expense'}
                      </Text>
                      {tx.category_name && (
                        <Text style={s.txMeta}>{tx.category_name}</Text>
                      )}
                    </View>
                    <Text style={s.txAmount}>-€{tx.amount.toFixed(2)}</Text>
                  </View>
                ))}
              </>
            )}

            {/* Add expense inline */}
            <Text style={s.sectionLabel}>Add Expense</Text>
            <View style={s.addRow}>
              <TextInput
                style={s.addAmountInput}
                placeholder="€ Amount"
                placeholderTextColor={colors.textSubtle}
                keyboardType="decimal-pad"
                value={addAmount}
                onChangeText={setAddAmount}
              />
              <TextInput
                style={[s.addAmountInput, { flex: 2 }]}
                placeholder="Note (optional)"
                placeholderTextColor={colors.textSubtle}
                value={addNote}
                onChangeText={setAddNote}
              />
            </View>
            {/* Category chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.catScroll}>
              {categories.slice(0, 10).map(c => (
                <TouchableOpacity
                  key={c.id}
                  style={[s.catChip, addCatId === c.id && { backgroundColor: c.color + '33', borderColor: c.color }]}
                  onPress={() => setAddCatId(addCatId === c.id ? null : c.id)}
                >
                  <Ionicons name={c.icon as any} size={13} color={addCatId === c.id ? c.color : colors.textMuted} />
                  <Text style={[s.catChipLabel, addCatId === c.id && { color: c.color }]}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={[s.addBtn, (!addAmount || saving) && { opacity: 0.5 }]}
              onPress={handleAddExpense}
              disabled={!addAmount || saving}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={s.addBtnText}>Add Expense</Text>
              }
            </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

function SummaryCell({ label, value, color }: { label: string; value: string; color: string }) {
  const { colors } = useTheme();
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Text style={{ fontSize: 12, color: colors.textMuted, marginBottom: 2 }}>{label}</Text>
      <Text style={{ fontSize: 18, color, fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

function makeStyles(colors: any, spacing: any, radius: any) {
  return StyleSheet.create({
    container:     { flex: 1, backgroundColor: colors.bg },
    header:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, paddingTop: 56 },
    monthNav:      { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    monthTitle:    { fontSize: 16, color: colors.text, fontWeight: '600', minWidth: 150, textAlign: 'center' },
    summary:       { flexDirection: 'row', backgroundColor: colors.surface, padding: spacing.md, marginHorizontal: spacing.md, borderRadius: radius.lg, marginBottom: spacing.md },
    calendar:      { paddingHorizontal: spacing.md, paddingBottom: 80 },
    weekRow:       { flexDirection: 'row', marginBottom: spacing.xs },
    dayHeader:     { flex: 1, textAlign: 'center', fontSize: 11, color: colors.textMuted, fontWeight: '600' },
    grid:          { flexDirection: 'row', flexWrap: 'wrap' },
    dayCell:       { width: `${100/7}%` as any, aspectRatio: 1, padding: 3, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    emptyCell:     { width: `${100/7}%` as any, aspectRatio: 1 },
    dayNum:        { fontSize: 10, color: colors.textMuted, alignSelf: 'flex-start', fontWeight: '600' },
    daySpent:      { fontSize: 11, fontWeight: '700', marginTop: 1 },
    dayDiff:       { fontSize: 9 },
    dayAllowed:    { fontSize: 10, color: colors.textSubtle },
    // Modal
    modalOverlay:  { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalCard:     { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 40, maxHeight: '90%' },
    modalHeader:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
    modalTitle:    { fontSize: 17, color: colors.text, fontWeight: '700' },
    budgetRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surfaceHigh, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.md },
    budgetLabel:   { fontSize: 13, color: colors.textMuted },
    budgetInput:   { width: 64, fontSize: 15, color: colors.text, fontWeight: '700', textAlign: 'center', borderBottomWidth: 1, borderColor: colors.border },
    budgetStatus:  { fontSize: 13, fontWeight: '600', marginLeft: 'auto' as any },
    sectionLabel:  { fontSize: 11, color: colors.textMuted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: spacing.xs, marginTop: spacing.sm },
    addRow:        { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
    addAmountInput:{ flex: 1, backgroundColor: colors.surfaceHigh, borderRadius: radius.md, padding: spacing.sm, color: colors.text, fontSize: 15 },
    catScroll:     { marginBottom: spacing.sm },
    catChip:       { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 6, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border, marginRight: spacing.xs, backgroundColor: colors.surfaceHigh },
    catChipLabel:  { fontSize: 12, color: colors.textMuted },
    addBtn:        { backgroundColor: colors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.xs },
    addBtnText:    { color: '#fff', fontWeight: '600', fontSize: 15 },
    txRow:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    txLabel:       { fontSize: 14, color: colors.text, fontWeight: '500' },
    txMeta:        { fontSize: 11, color: colors.textMuted, marginTop: 1 },
    txAmount:      { fontSize: 14, color: colors.danger, fontWeight: '700' },
  });
}
