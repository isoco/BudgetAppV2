import { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getSavingsHistory, getMonthBalance, SavingsMonth, updateMonthlySavings, cascadeOpeningBalances } from '../../src/db/queries';
import { useQuery } from '../../src/hooks/useQuery';
import { useTheme } from '../../src/theme/useTheme';
import { colors as staticColors, spacing, radius, typography } from '../../src/theme';
import { useIncomeHidden } from '../../src/store/privacyStore';

const fmt = (n: number) => `€${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Generate list of months: 12 past + current + 3 future
function getMonthOptions(): { month: number; year: number; label: string }[] {
  const now = new Date();
  const result = [];
  for (let i = -12; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    result.push({
      month: d.getMonth() + 1,
      year:  d.getFullYear(),
      label: d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    });
  }
  return result.reverse(); // newest first
}

export default function SavingsScreen() {
  const { colors } = useTheme();
  const hide = useIncomeHidden();
  const { data, loading, refetch } = useQuery(getSavingsHistory);
  const months: SavingsMonth[] = data?.months ?? [];
  const total = data?.total ?? 0;

  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear  = now.getFullYear();

  const [editingKey, setEditingKey]       = useState<string | null>(null);
  const [editValue, setEditValue]         = useState('');
  const [showPicker, setShowPicker]       = useState(false);
  const [curSavings, setCurSavings]       = useState(0);
  const [editingCurrent, setEditingCurrent] = useState(false);
  const [currentInput, setCurrentInput]   = useState('');

  const loadCurrentMonth = useCallback(async () => {
    const mb = await getMonthBalance(curMonth, curYear);
    setCurSavings(mb.savings_contribution);
  }, []);

  useFocusEffect(useCallback(() => {
    refetch();
    loadCurrentMonth();
  }, []));

  const monthOptions = getMonthOptions();

  // Build a map of existing savings by "year-month" key
  const savingsMap: Record<string, number> = {};
  for (const m of months) savingsMap[`${m.year}-${m.month}`] = m.savings;

  // Past = months up to and including current month
  const pastTotal = months
    .filter(m => m.year < curYear || (m.year === curYear && m.month <= curMonth))
    .reduce((s, m) => s + m.savings, 0);

  // Planned = future months this year that already have savings set
  const plannedFuture = months
    .filter(m => m.year === curYear && m.month > curMonth)
    .reduce((s, m) => s + m.savings, 0);
  const yearEndPlan = pastTotal + plannedFuture;

  async function handleSave(month: number, year: number) {
    const num = parseFloat(editValue);
    if (isNaN(num) || num < 0) return Alert.alert('Enter a valid amount');
    await updateMonthlySavings(month, year, num);
    await cascadeOpeningBalances(month, year);
    setEditingKey(null);
    refetch();
    loadCurrentMonth();
  }

  async function saveCurrentMonth() {
    const num = parseFloat(currentInput);
    if (isNaN(num) || num < 0) return Alert.alert('Enter a valid amount');
    await updateMonthlySavings(curMonth, curYear, num);
    await cascadeOpeningBalances(curMonth, curYear);
    setCurSavings(num);
    setEditingCurrent(false);
    refetch();
  }

  function startEdit(month: number, year: number) {
    const key = `${year}-${month}`;
    setEditingKey(key);
    setEditValue(String(savingsMap[key] ?? 0));
    setShowPicker(false);
  }

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      <View style={s.header}>
        <Text style={[s.title, { color: colors.text }]}>Savings</Text>
        <TouchableOpacity
          style={[s.addBtn, { backgroundColor: staticColors.primary }]}
          onPress={() => { setShowPicker(v => !v); setEditingKey(null); }}
        >
          <Ionicons name={showPicker ? 'close' : 'add'} size={20} color="#fff" />
          <Text style={s.addBtnText}>{showPicker ? 'Cancel' : 'Set Month'}</Text>
        </TouchableOpacity>
      </View>

      {/* Total saved (past months only) */}
      <View style={[s.totalCard, { backgroundColor: staticColors.primary + '18', borderColor: staticColors.primary + '44' }]}>
        <Text style={[s.totalLabel, { color: colors.textMuted }]}>Total Saved</Text>
        <Text style={[s.totalAmount, { color: staticColors.primary }]}>{hide ? '€ ••••' : fmt(pastTotal)}</Text>
      </View>

      {/* Year-end plan */}
      {yearEndPlan > 0 && (
        <View style={[s.planCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={s.planRow}>
            <View style={{ flex: 1 }}>
              <Text style={[s.planLabel, { color: colors.textMuted }]}>Planned by end of {curYear}</Text>
              <Text style={[s.planSub, { color: colors.textSubtle }]}>
                {hide ? '' : `${fmt(pastTotal)} saved · ${fmt(plannedFuture)} planned ahead`}
              </Text>
            </View>
            <Text style={[s.planAmount, { color: staticColors.savings }]}>
              {hide ? '€ ••••' : fmt(yearEndPlan)}
            </Text>
          </View>
          {!hide && yearEndPlan > 0 && (
            <View style={[s.planTrack, { backgroundColor: colors.surfaceHigh }]}>
              <View style={[s.planBar, { width: `${Math.min(100, (pastTotal / yearEndPlan) * 100).toFixed(1)}%` as any, backgroundColor: staticColors.savings }]} />
            </View>
          )}
        </View>
      )}

      {/* Current month savings */}
      <View style={[s.curCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <View style={s.curCardHeader}>
          <Ionicons name="calendar-outline" size={16} color={staticColors.warning} />
          <Text style={[s.curCardTitle, { color: colors.textMuted }]}>
            {now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </Text>
        </View>
        {editingCurrent ? (
          <View style={s.curEditRow}>
            <TextInput
              style={[s.curInput, { color: colors.text, borderColor: colors.border }]}
              value={currentInput}
              onChangeText={setCurrentInput}
              keyboardType="decimal-pad"
              autoFocus
              placeholder="0.00"
              placeholderTextColor={colors.textMuted}
            />
            <TouchableOpacity onPress={saveCurrentMonth} style={s.curBtn}>
              <Ionicons name="checkmark" size={20} color={staticColors.success} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditingCurrent(false)} style={s.curBtn}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity onPress={() => { setCurrentInput(String(curSavings)); setEditingCurrent(true); }} style={s.curAmtRow}>
            <Text style={[s.curAmt, { color: staticColors.warning }]}>{hide ? '€ ••••' : fmt(curSavings)}</Text>
            <Text style={[s.curHint, { color: colors.textSubtle }]}>tap to edit</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Month picker */}
      {showPicker && (
        <View style={[s.pickerCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[s.pickerTitle, { color: colors.textMuted }]}>Select month to set savings:</Text>
          <FlatList
            data={monthOptions}
            keyExtractor={item => `${item.year}-${item.month}`}
            style={{ maxHeight: 200 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={[s.pickerRow, { borderBottomColor: colors.border }]}
                onPress={() => startEdit(item.month, item.year)}
              >
                <Text style={[s.pickerRowLabel, { color: colors.text }]}>{item.label}</Text>
                {savingsMap[`${item.year}-${item.month}`] > 0 && (
                  <Text style={[s.pickerRowAmt, { color: staticColors.primary }]}>
                    {fmt(savingsMap[`${item.year}-${item.month}`])}
                  </Text>
                )}
                <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          />
        </View>
      )}

      {/* Edit panel */}
      {editingKey && (() => {
        const [y, m] = editingKey.split('-').map(Number);
        const label  = new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        return (
          <View style={[s.editCard, { backgroundColor: colors.surface, borderColor: staticColors.primary + '66' }]}>
            <Text style={[s.editTitle, { color: colors.text }]}>Savings for {label}</Text>
            <View style={s.editRow}>
              <TextInput
                style={[s.editInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.bg }]}
                value={editValue}
                onChangeText={setEditValue}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor={colors.textMuted}
                autoFocus
              />
              <TouchableOpacity style={[s.saveBtn, { backgroundColor: staticColors.primary }]} onPress={() => handleSave(m, y)}>
                <Text style={s.saveBtnText}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.cancelBtn, { borderColor: colors.border }]} onPress={() => setEditingKey(null)}>
                <Text style={[s.cancelBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })()}

      {/* History list */}
      <FlatList
        data={months}
        keyExtractor={item => `${item.year}-${item.month}`}
        refreshing={loading}
        onRefresh={refetch}
        contentContainerStyle={s.list}
        ListEmptyComponent={
          !loading
            ? <Text style={[s.empty, { color: colors.textMuted }]}>No savings recorded yet{'\n'}Tap "Set Month" to add savings</Text>
            : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[s.row, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => startEdit(item.month, item.year)}
          >
            <View style={s.rowLeft}>
              <Text style={[s.monthLabel, { color: colors.text }]}>{item.label}</Text>
              <Text style={[s.sub, { color: colors.textMuted }]}>Cumulative: {fmt(item.cumulative)}</Text>
            </View>
            <View style={s.rowRight}>
              <Text style={[s.amount, { color: staticColors.primary }]}>{hide ? '€ ••••' : `+${fmt(item.savings)}`}</Text>
              <Ionicons name="pencil-outline" size={12} color={colors.textMuted} style={{ marginTop: 2 }} />
            </View>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1 },
  header:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, paddingTop: 56 },
  title:          { ...typography['2xl'], fontWeight: '700' },
  addBtn:         { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full },
  addBtnText:     { color: '#fff', ...typography.sm, fontWeight: '600' },
  totalCard:      { marginHorizontal: spacing.md, marginBottom: spacing.md, padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, alignItems: 'center' },
  totalLabel:     { ...typography.sm, marginBottom: 4 },
  totalAmount:    { ...typography['3xl'], fontWeight: '800' },
  planCard:       { marginHorizontal: spacing.md, marginBottom: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  planRow:        { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  planLabel:      { ...typography.sm, fontWeight: '600' },
  planSub:        { ...typography.xs, marginTop: 2 },
  planAmount:     { ...typography.xl, fontWeight: '800' },
  planTrack:      { height: 6, borderRadius: radius.full, overflow: 'hidden', marginTop: spacing.xs },
  planBar:        { height: '100%', borderRadius: radius.full },
  curCard:        { marginHorizontal: spacing.md, marginBottom: spacing.md, borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  curCardHeader:  { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs },
  curCardTitle:   { ...typography.xs, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
  curAmtRow:      { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm },
  curAmt:         { ...typography['2xl'], fontWeight: '800' },
  curHint:        { ...typography.xs },
  curEditRow:     { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  curInput:       { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 8, ...typography.lg },
  curBtn:         { padding: 4 },
  pickerCard:     { marginHorizontal: spacing.md, marginBottom: spacing.sm, borderRadius: radius.lg, borderWidth: 1, overflow: 'hidden' },
  pickerTitle:    { ...typography.xs, padding: spacing.sm, paddingBottom: 4 },
  pickerRow:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: 10, borderBottomWidth: 1 },
  pickerRowLabel: { flex: 1, ...typography.base },
  pickerRowAmt:   { ...typography.sm, fontWeight: '600', marginRight: spacing.xs },
  editCard:       { marginHorizontal: spacing.md, marginBottom: spacing.sm, padding: spacing.md, borderRadius: radius.lg, borderWidth: 1 },
  editTitle:      { ...typography.sm, fontWeight: '600', marginBottom: spacing.sm },
  editRow:        { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  editInput:      { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: 8, ...typography.base },
  saveBtn:        { paddingHorizontal: spacing.md, paddingVertical: 8, borderRadius: radius.md },
  saveBtnText:    { color: '#fff', fontWeight: '600', ...typography.sm },
  cancelBtn:      { paddingHorizontal: spacing.sm, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1 },
  cancelBtnText:  { ...typography.sm },
  list:           { padding: spacing.md, paddingBottom: 80 },
  row:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.sm },
  rowLeft:        { flex: 1 },
  rowRight:       { alignItems: 'flex-end', gap: 2 },
  monthLabel:     { ...typography.base, fontWeight: '600' },
  sub:            { ...typography.xs, marginTop: 2 },
  amount:         { ...typography.base, fontWeight: '700' },
  empty:          { ...typography.base, textAlign: 'center', marginTop: spacing.xl, lineHeight: 24 },
});
