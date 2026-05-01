import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  ScrollView, View, Text, StyleSheet, RefreshControl,
  TouchableOpacity, Modal, TextInput, Alert, FlatList, PanResponder,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import * as LocalAuthentication from 'expo-local-authentication';
import {
  getDashboardData, getSettings,
  getUpcomingBills, getUpcomingIncome, getEndOfMonthProjection,
  autoPopulateRecurring, getSavingsSummary, UpcomingItem,
  getDailySpends, createDailySpend, deleteDailySpend, DailySpend,
  getDailySpendTotalsForDates,
  getTodayTransactions, getMonthTransactionDetails, Transaction,
} from '../../src/db/queries';
import { useQuery } from '../../src/hooks/useQuery';
import { useTheme } from '../../src/theme/useTheme';
import { colors as staticColors, spacing, radius, typography, shadow } from '../../src/theme';
import { usePrivacyStore } from '../../src/store/privacyStore';
import { TransactionItem } from '../../src/components/TransactionItem';
import { SpendingChart } from '../../src/components/SpendingChart';

// ── helpers ──────────────────────────────────────────────────────────────────
const fmt  = (n: number) => `€${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sign = (n: number) => n >= 0 ? '' : '-';
const todayStr = () => format(new Date(), 'yyyy-MM-dd');
const daysThisMonth = () => {
  const today = new Date();
  const day = today.getDate();
  return Array.from({ length: day }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth(), day - i);
    return format(d, 'yyyy-MM-dd');
  });
};

export default function DashboardScreen() {
  const { colors } = useTheme();

  // ── month navigation ──────────────────────────────────────────────────────
  const now = new Date();
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
  const [viewYear,  setViewYear]  = useState(now.getFullYear());
  const isCurrentMonth = viewMonth === (now.getMonth() + 1) && viewYear === now.getFullYear();

  function prevMonth() {
    if (viewMonth === 1) { setViewYear(y => y - 1); setViewMonth(12); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    // Don't go beyond current month
    if (isCurrentMonth) return;
    if (viewMonth === 12) { setViewYear(y => y + 1); setViewMonth(1); }
    else setViewMonth(m => m + 1);
  }


  // ── privacy (global store) ────────────────────────────────────────────────
  const { privacyEnabled, isLocked, biometricEnabled, hideCats, setPrivacy } = usePrivacyStore();
  const privacyInitialized = useRef(false);

  const loadPrivacy = useCallback(async () => {
    const s = await getSettings();
    // Only reset isLocked on first load — preserve unlocked state across tab switches
    const patch: Parameters<typeof setPrivacy>[0] = {
      privacyEnabled:   s.privacy_hide_income,
      biometricEnabled: s.privacy_biometric,
      hideCats:         s.privacy_hide_cats ?? 'all',
    };
    if (!privacyInitialized.current) {
      patch.isLocked = true;
      privacyInitialized.current = true;
    }
    setPrivacy(patch);
  }, []);

  async function handleLockToggle() {
    if (!isLocked) { setPrivacy({ isLocked: true }); return; }
    if (biometricEnabled) {
      const supported = await LocalAuthentication.hasHardwareAsync();
      if (supported) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Unlock income figures',
          fallbackLabel: 'Use passcode',
        });
        if (result.success) setPrivacy({ isLocked: false });
        return;
      }
    }
    setPrivacy({ isLocked: false });
  }

  function incomeHidden(): boolean { return privacyEnabled && isLocked; }

  // ── data ──────────────────────────────────────────────────────────────────
  const { data, loading, refetch } = useQuery(
    () => getDashboardData({ month: viewMonth, year: viewYear }),
    [viewMonth, viewYear]
  );
  const { data: projection, refetch: refetchProj }           = useQuery(getEndOfMonthProjection);
  const { data: bills = [], refetch: refetchBills }          = useQuery(getUpcomingBills);
  const { data: income_items = [], refetch: refetchIncome }  = useQuery(getUpcomingIncome);
  const { data: savingsSummary, refetch: refetchSavings }    = useQuery(getSavingsSummary);

  // ── daily spends ──────────────────────────────────────────────────────────
  const [selectedDate, setSelectedDate]   = useState(todayStr());
  const [daySpends, setDaySpends]         = useState<DailySpend[]>([]);
  const [dayTotals, setDayTotals]         = useState<Record<string, number>>({});
  const [spendAmount, setSpendAmount]     = useState('');
  const [spendNote, setSpendNote]         = useState('');
  const [dayModalVisible, setDayModalVisible] = useState(false);
  const [dayModalDate, setDayModalDate]   = useState('');
  const [dayModalSpends, setDayModalSpends] = useState<DailySpend[]>([]);

  // ── popup modals ──────────────────────────────────────────────────────────
  const [balanceModalVisible, setBalanceModalVisible] = useState(false);
  const [balanceData, setBalanceData]                 = useState<any>(null);
  const [todayModalVisible, setTodayModalVisible]     = useState(false);
  const [todayTxs, setTodayTxs]                       = useState<Transaction[]>([]);

  const loadDaySpends = useCallback(async (date: string) => {
    const data = await getDailySpends(date);
    setDaySpends(data);
  }, []);

  const loadAllDayTotals = useCallback(async () => {
    const dates = daysThisMonth();
    const totals = await getDailySpendTotalsForDates(dates);
    setDayTotals(totals);
  }, []);

  useEffect(() => {
    loadDaySpends(todayStr());
    loadAllDayTotals();
  }, []);

  useFocusEffect(useCallback(() => {
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    autoPopulateRecurring(y, m).then(() => {
      const prev1 = new Date(y, m - 2, 1);
      return autoPopulateRecurring(prev1.getFullYear(), prev1.getMonth() + 1);
    }).then(() => {
      const prev2 = new Date(y, m - 3, 1);
      return autoPopulateRecurring(prev2.getFullYear(), prev2.getMonth() + 1);
    }).then(() => {
      refetch();
      refetchProj();
      refetchBills();
      refetchIncome();
      refetchSavings();
    });
    loadDaySpends(todayStr());
    loadAllDayTotals();
    loadPrivacy();
  }, [refetch, refetchProj, refetchBills, refetchIncome, loadDaySpends, loadAllDayTotals, loadPrivacy]));

  async function handleAddSpend() {
    const num = parseFloat(spendAmount);
    if (!num || num <= 0) return Alert.alert('Enter a valid amount');
    await createDailySpend({ date: selectedDate, amount: num, note: spendNote || null });
    setSpendAmount('');
    setSpendNote('');
    loadDaySpends(selectedDate);
    loadAllDayTotals();
    refetch();
  }

  async function handleDeleteSpend(id: string) {
    Alert.alert('Delete', 'Remove this entry?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await deleteDailySpend(id);
        loadDaySpends(selectedDate);
        loadAllDayTotals();
        refetch();
        if (dayModalVisible) {
          const updated = await getDailySpends(dayModalDate);
          setDayModalSpends(updated);
        }
      }},
    ]);
  }

  async function openDayModal(date: string) {
    setDayModalDate(date);
    const spends = await getDailySpends(date);
    setDayModalSpends(spends);
    setDayModalVisible(true);
  }

  async function openBalanceModal() {
    const d = await getMonthTransactionDetails(viewMonth, viewYear);
    setBalanceData(d);
    setBalanceModalVisible(true);
  }

  async function openTodayModal() {
    const txs = await getTodayTransactions();
    setTodayTxs(txs);
    setTodayModalVisible(true);
  }

  // ── swipe to change month ─────────────────────────────────────────────────
  const panResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gs) =>
      Math.abs(gs.dx) > 20 && Math.abs(gs.dx) > Math.abs(gs.dy) * 2,
    onPanResponderRelease: (_, gs) => {
      if (gs.dx > 60) prevMonth();
      if (gs.dx < -60) nextMonth();
    },
  }), [viewMonth, viewYear]);

  const daily     = data?.daily;
  const savings   = data?.savings;
  const dailyPct  = (daily?.limit ?? 0) > 0 ? Math.min(100, Math.round(((daily?.spent ?? 0) / daily!.limit) * 100)) : 0;
  const dailyOver = (daily?.limit ?? 0) > 0 && (daily?.spent ?? 0) > (daily?.limit ?? 0);

  const days7 = daysThisMonth();
  const daySpendTotal = daySpends.reduce((s, e) => s + e.amount, 0);

  const selectedDateLabel = selectedDate === todayStr()
    ? 'Today'
    : new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const viewMonthLabel = new Date(viewYear, viewMonth - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]} {...panResponder.panHandlers}>
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refetch} tintColor={staticColors.primary} />}
      keyboardShouldPersistTaps="handled"
    >
      {/* Header */}
      <View style={s.header}>
        <View style={s.monthNav}>
          <TouchableOpacity onPress={prevMonth} style={s.navArrow}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <View>
            <Text style={[s.title, { color: colors.text }]}>Budget</Text>
            <Text style={[s.subtitle, { color: colors.textMuted }]}>{viewMonthLabel}</Text>
          </View>
          <TouchableOpacity onPress={nextMonth} style={[s.navArrow, isCurrentMonth && { opacity: 0.3 }]}>
            <Ionicons name="chevron-forward" size={20} color={colors.text} />
          </TouchableOpacity>
        </View>
        <View style={s.headerRight}>
          {privacyEnabled && (
            <TouchableOpacity style={[s.iconBtn, { backgroundColor: colors.surface }]} onPress={handleLockToggle}>
              <Ionicons name={isLocked ? 'eye-off' : 'eye'} size={20} color={isLocked ? staticColors.warning : colors.textMuted} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[s.iconBtn, { backgroundColor: colors.surface }]} onPress={() => router.push('/month-history')}>
            <Ionicons name="calendar-outline" size={20} color={colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={[s.iconBtn, { backgroundColor: colors.surface }]} onPress={() => router.push('/settings')}>
            <Ionicons name="settings-outline" size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Balance Card */}
      <TouchableOpacity onPress={openBalanceModal} activeOpacity={0.92} style={{ marginBottom: spacing.md }}>
        <LinearGradient
          colors={['#5b5ef4', '#8b5cf6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={s.balanceCard}
        >
          <View style={s.cardOrb1} />
          <View style={s.cardOrb2} />
          {(data?.opening_balance ?? 0) !== 0 && (
            <View style={s.rolloverChip}>
              <Text style={s.rolloverLabel}>
                {(data!.opening_balance) >= 0 ? '↩' : '⚠'} {sign(data!.opening_balance)}{fmt(data!.opening_balance)} {(data!.opening_balance) >= 0 ? 'leftover' : 'deficit'} from {data?.rollover_from_month ?? ''}
              </Text>
            </View>
          )}
          <Text style={s.balanceLabel}>Available Balance</Text>
          <Text style={[s.balanceAmount, (data?.available ?? 0) < 0 && { color: '#fca5a5' }]}>
            {incomeHidden() ? '€ ••••' : `${sign(data?.available ?? 0)}${fmt(data?.available ?? 0)}`}
          </Text>
          <View style={s.statDividerH} />
          <View style={s.balanceRow}>
            <StatChip icon="arrow-down-circle" label="Income"
              value={incomeHidden() ? '€ ••••' : fmt((data?.income?.this_month ?? 0) + Math.max(0, data?.opening_balance ?? 0))}
              color="#34d399" />
            <View style={s.statDivider} />
            <StatChip icon="arrow-up-circle" label="Expenses" value={fmt(data?.expense?.this_month ?? 0)} color="#f87171" />
            <View style={s.statDivider} />
            <StatChip icon="trending-up" label="Net"
              value={incomeHidden() ? '€ ••••' : `${sign(data?.available ?? 0)}${fmt(data?.available ?? 0)}`}
              color={(data?.available ?? 0) >= 0 ? '#34d399' : '#f87171'} />
          </View>
          <Text style={s.tapHint}>tap for details</Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* Month Projection + Savings */}
      <View style={s.twoColRow}>
        {isCurrentMonth && projection && (
          <View style={[s.halfCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[s.halfCardAccent, { backgroundColor: (projection.projected_balance ?? 0) >= 0 ? staticColors.success : staticColors.danger }]} />
            <Text style={[s.projLabel, { color: colors.textMuted }]}>Projected</Text>
            <Text style={[s.projAmount, { color: (projection.projected_balance ?? 0) >= 0 ? staticColors.success : staticColors.danger }]}>
              {incomeHidden() ? '€ ••••' : `${sign(projection.projected_balance ?? 0)}${fmt(projection.projected_balance ?? 0)}`}
            </Text>
            <Text style={[s.projDays, { color: colors.textSubtle }]}>{projection.days_left} days left</Text>
          </View>
        )}
        <View style={[s.halfCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={[s.halfCardAccent, { backgroundColor: staticColors.warning }]} />
          <Text style={[s.projLabel, { color: colors.textMuted }]}>Savings</Text>
          <Text style={[s.projAmount, { color: staticColors.warning }]}>
            {incomeHidden() ? '€ ••••' : fmt(savingsSummary?.this_month ?? 0)}
          </Text>
          <Text style={[s.projDays, { color: colors.textSubtle }]}>
            Total: {incomeHidden() ? '••••' : fmt(savingsSummary?.total ?? 0)}
          </Text>
        </View>
      </View>

      {/* Daily Log — only show for current month */}
      {isCurrentMonth && (
        <View style={[s.dailyLogCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={s.dailyLogHeader}>
            <TouchableOpacity onPress={() => router.push('/daily-tracker')} activeOpacity={0.7}>
              <Text style={[s.sectionTitle, { color: colors.text }]}>
                Daily Log  <Text style={{ fontSize: 12, color: staticColors.primary }}>view all →</Text>
              </Text>
            </TouchableOpacity>
            {daily && daily.limit > 0 && selectedDate === todayStr() && (
              <TouchableOpacity
                onPress={openTodayModal}
                style={[s.todayBadge, { backgroundColor: dailyOver ? `${staticColors.danger}22` : colors.surfaceHigh, borderColor: dailyOver ? staticColors.danger : colors.border }]}
              >
                <Text style={[s.todayBadgeText, { color: dailyOver ? staticColors.danger : colors.text }]}>
                  {fmt(daily.spent)} / {fmt(daily.limit)}
                </Text>
                {dailyOver
                  ? <Text style={[s.todayOverText, { color: staticColors.danger }]}>over</Text>
                  : <Text style={[s.todayOverText, { color: staticColors.success }]}>{fmt(daily.remaining)} left</Text>
                }
              </TouchableOpacity>
            )}
          </View>
          {daily && daily.limit > 0 && selectedDate === todayStr() && (
            <View style={[s.track, { backgroundColor: colors.surfaceHigh, marginBottom: spacing.sm }]}>
              <View style={[s.trackBar, {
                width: `${dailyPct}%` as any,
                backgroundColor: dailyOver ? staticColors.danger : dailyPct > 80 ? staticColors.warning : staticColors.success,
              }]} />
            </View>
          )}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
            {days7.map(d => {
              const isSelected = d === selectedDate;
              const dayTotal   = dayTotals[d] ?? 0;
              const label = d === todayStr() ? 'Today' : new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' });
              return (
                <TouchableOpacity
                  key={d}
                  style={[s.datePill, { borderColor: isSelected ? staticColors.primary : colors.border, backgroundColor: isSelected ? staticColors.primary : colors.surfaceHigh }]}
                  onPress={() => { setSelectedDate(d); loadDaySpends(d); if (dayTotal > 0) openDayModal(d); }}
                >
                  <Text style={[s.datePillText, { color: isSelected ? '#fff' : colors.textMuted }]}>{label}</Text>
                  {dayTotal > 0 && (
                    <Text style={[s.datePillBadge, { color: isSelected ? 'rgba(255,255,255,0.85)' : staticColors.danger }]}>
                      {fmt(dayTotal)}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {daySpendTotal > 0 && (
            <TouchableOpacity onPress={() => openDayModal(selectedDate)}>
              <Text style={[s.dayTotal, { color: colors.textMuted }]}>{selectedDateLabel}: <Text style={{ color: staticColors.danger, fontWeight: '700' }}>{fmt(daySpendTotal)}</Text>  <Text style={{ color: staticColors.primary, fontSize: 11 }}>view →</Text></Text>
            </TouchableOpacity>
          )}

          <View style={s.addSpendRow}>
            <TextInput
              style={[s.spendInput, { backgroundColor: colors.surfaceHigh, color: colors.text, borderColor: colors.border }]}
              placeholder="€ Amount"
              placeholderTextColor={colors.textSubtle}
              keyboardType="decimal-pad"
              value={spendAmount}
              onChangeText={setSpendAmount}
            />
            <TextInput
              style={[s.spendNoteInput, { backgroundColor: colors.surfaceHigh, color: colors.text, borderColor: colors.border }]}
              placeholder="What for?"
              placeholderTextColor={colors.textSubtle}
              value={spendNote}
              onChangeText={setSpendNote}
            />
            <TouchableOpacity style={[s.spendAddBtn, { backgroundColor: staticColors.primary }]} onPress={handleAddSpend}>
              <Ionicons name="add" size={20} color="#fff" />
            </TouchableOpacity>
          </View>

          {daySpends.map(entry => (
            <View key={entry.id} style={[s.spendEntry, { borderBottomColor: colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.spendEntryAmount, { color: staticColors.danger }]}>{fmt(entry.amount)}</Text>
                {entry.note && <Text style={[s.spendEntryNote, { color: colors.textMuted }]}>{entry.note}</Text>}
              </View>
              <Text style={[s.spendEntryTime, { color: colors.textSubtle }]}>
                {new Date(entry.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </Text>
              <TouchableOpacity onPress={() => handleDeleteSpend(entry.id)} style={{ paddingLeft: spacing.sm }}>
                <Ionicons name="trash-outline" size={16} color={colors.textSubtle} />
              </TouchableOpacity>
            </View>
          ))}
          {daySpends.length === 0 && (
            <Text style={[s.emptySmall, { color: colors.textSubtle }]}>No entries for {selectedDateLabel.toLowerCase()}</Text>
          )}
        </View>
      )}

      {/* Quick Links */}
      <View style={s.quickRow}>
        <TouchableOpacity style={[s.quickBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => router.push('/fuel-tracker')}>
          <View style={[s.quickIconWrap, { backgroundColor: staticColors.primary + '18' }]}>
            <Ionicons name="car-outline" size={20} color={staticColors.primary} />
          </View>
          <Text style={[s.quickLabel, { color: colors.text }]}>Fuel Tracker</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.quickBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => router.push('/year-overview')}>
          <View style={[s.quickIconWrap, { backgroundColor: staticColors.primary + '18' }]}>
            <Ionicons name="bar-chart-outline" size={20} color={staticColors.primary} />
          </View>
          <Text style={[s.quickLabel, { color: colors.text }]}>Year Overview</Text>
        </TouchableOpacity>
      </View>

      {/* Upcoming Bills */}
      {isCurrentMonth && (bills as UpcomingItem[]).length > 0 && (
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>Upcoming Bills</Text>
          {(bills as UpcomingItem[]).slice(0, 5).map((item, i) => {
            const isOverdue = item.is_overdue;
            return (
              <View key={i} style={[s.upcomingRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                <View style={[s.upcomingDot, { backgroundColor: isOverdue ? staticColors.danger : staticColors.warning }]} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.upcomingName, { color: colors.text }]}>{item.name}</Text>
                  <Text style={[s.upcomingDate, { color: colors.textMuted }]}>{item.due_date}</Text>
                </View>
                <Text style={[s.upcomingAmount, { color: isOverdue ? staticColors.danger : colors.text }]}>{fmt(item.default_amount)}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Upcoming Income */}
      {isCurrentMonth && (income_items as UpcomingItem[]).length > 0 && (
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>Upcoming Income</Text>
          {(income_items as UpcomingItem[]).slice(0, 3).map((item, i) => (
            <View key={i} style={[s.upcomingRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[s.upcomingDot, { backgroundColor: staticColors.success }]} />
              <View style={{ flex: 1 }}>
                <Text style={[s.upcomingName, { color: colors.text }]}>{item.name}</Text>
                <Text style={[s.upcomingDate, { color: colors.textMuted }]}>{item.due_date}</Text>
              </View>
              <Text style={[s.upcomingAmount, { color: staticColors.success }]}>
                {incomeHidden() ? '€ ••••' : fmt(item.default_amount)}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Category chart */}
      {(data?.category_breakdown?.length ?? 0) > 0 && (
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>By Category</Text>
          <SpendingChart data={data!.category_breakdown} />
        </View>
      )}

      {/* Recent transactions */}
      <View style={s.section}>
        <View style={s.sectionRow}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>Recent</Text>
          <TouchableOpacity onPress={() => router.push('/(tabs)/transactions')}>
            <Text style={s.seeAll}>See all</Text>
          </TouchableOpacity>
        </View>
        {/* Rollover shown as special income item */}
        {(data?.opening_balance ?? 0) > 0 && (
          <View style={[s.rolloverRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={[s.rolloverDot, { backgroundColor: '#34d399' }]} />
            <View style={{ flex: 1 }}>
              <Text style={[s.rolloverName, { color: colors.text }]}>Leftover from {data!.rollover_from_month}</Text>
              <Text style={[s.rolloverSub, { color: colors.textMuted }]}>Carried over balance</Text>
            </View>
            <Text style={[s.rolloverAmt, { color: '#34d399' }]}>
              {incomeHidden() ? '€ ••••' : `+${fmt(data!.opening_balance)}`}
            </Text>
          </View>
        )}
        {data?.recent_transactions?.map((tx: any) => (
          <TransactionItem key={tx.id} transaction={tx} hideAmount={incomeHidden() && tx.type === 'income'} />
        ))}
        {(data?.recent_transactions?.length ?? 0) === 0 && (data?.opening_balance ?? 0) <= 0 && !loading && (
          <Text style={[s.empty, { color: colors.textMuted }]}>No transactions yet</Text>
        )}
      </View>

      {/* FAB */}
      <TouchableOpacity style={s.fab} onPress={() => router.push('/add-transaction')}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* ── Modal: Balance Detail ─────────────────────────────────────── */}
      <Modal visible={balanceModalVisible} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={s.modalHeaderRow}>
              <Text style={[s.modalTitle, { color: colors.text }]}>This Month</Text>
              <TouchableOpacity onPress={() => setBalanceModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {balanceData && (
              <>
                <View style={s.modalTotals}>
                  <View style={s.modalTotalItem}>
                    <Text style={[s.modalTotalLabel, { color: colors.textMuted }]}>Income</Text>
                    <Text style={[s.modalTotalValue, { color: staticColors.success }]}>
                      {incomeHidden() ? '€ ••••' : fmt(balanceData.totalIncome)}
                    </Text>
                  </View>
                  <View style={s.modalTotalItem}>
                    <Text style={[s.modalTotalLabel, { color: colors.textMuted }]}>Expenses</Text>
                    <Text style={[s.modalTotalValue, { color: staticColors.danger }]}>{fmt(balanceData.totalExpense)}</Text>
                  </View>
                </View>
                <FlatList
                  data={[
                    ...(balanceData.income as Transaction[]).map(t => ({ ...t, _section: 'income' })),
                    ...(balanceData.expense as Transaction[]).map(t => ({ ...t, _section: 'expense' })),
                  ]}
                  keyExtractor={t => t.id}
                  style={{ maxHeight: 400 }}
                  ListHeaderComponent={
                    <>{balanceData.income.length > 0 && <Text style={[s.modalSectionLabel, { color: staticColors.success }]}>INCOME</Text>}</>
                  }
                  renderItem={({ item }: { item: any }) => (
                    <>
                      {item._section === 'expense' && item.id === (balanceData.expense[0]?.id) && (
                        <Text style={[s.modalSectionLabel, { color: staticColors.danger }]}>EXPENSES</Text>
                      )}
                      <View style={[s.modalTxRow, { borderBottomColor: colors.border }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.modalTxName, { color: colors.text }]}>{item.category_name ?? 'Uncategorized'}</Text>
                          {(item.note || item.merchant) && (
                            <Text style={[s.modalTxNote, { color: colors.textMuted }]}>{item.merchant ?? item.note}</Text>
                          )}
                          <Text style={[s.modalTxDate, { color: colors.textSubtle }]}>{item.date}</Text>
                        </View>
                        <Text style={[s.modalTxAmount, { color: item._section === 'income' ? staticColors.success : staticColors.danger }]}>
                          {item._section === 'income' && incomeHidden()
                            ? '€ ••••'
                            : `${item._section === 'income' ? '+' : '-'}${fmt(item.amount)}`}
                        </Text>
                      </View>
                    </>
                  )}
                />
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── Modal: Today's Transactions ───────────────────────────────── */}
      <Modal visible={todayModalVisible} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={s.modalHeaderRow}>
              <Text style={[s.modalTitle, { color: colors.text }]}>Today's Transactions</Text>
              <TouchableOpacity onPress={() => setTodayModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {todayTxs.length === 0 ? (
              <Text style={[s.empty, { color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xl }]}>No transactions today</Text>
            ) : (
              <FlatList
                data={todayTxs}
                keyExtractor={t => t.id}
                style={{ maxHeight: 420 }}
                renderItem={({ item }) => (
                  <View style={[s.modalTxRow, { borderBottomColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.modalTxName, { color: colors.text }]}>{item.category_name ?? 'Uncategorized'}</Text>
                      {(item.note || item.merchant) && (
                        <Text style={[s.modalTxNote, { color: colors.textMuted }]}>{item.merchant ?? item.note}</Text>
                      )}
                    </View>
                    <Text style={[s.modalTxAmount, { color: item.type === 'income' ? staticColors.success : staticColors.danger }]}>
                      {item.type === 'income' && incomeHidden() ? '€ ••••' : `${item.type === 'income' ? '+' : '-'}${fmt(item.amount)}`}
                    </Text>
                  </View>
                )}
                ListFooterComponent={
                  <View style={[s.modalTotals, { borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.sm }]}>
                    <Text style={[s.modalTotalLabel, { color: colors.text }]}>Total spent today</Text>
                    <Text style={[s.modalTotalValue, { color: staticColors.danger }]}>
                      {fmt(todayTxs.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0))}
                    </Text>
                  </View>
                }
              />
            )}
          </View>
        </View>
      </Modal>

      {/* ── Modal: Day Spend Detail ───────────────────────────────────── */}
      <Modal visible={dayModalVisible} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { backgroundColor: colors.surface }]}>
            <View style={s.modalHeaderRow}>
              <Text style={[s.modalTitle, { color: colors.text }]}>
                {dayModalDate === todayStr() ? 'Today' : new Date(dayModalDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
              </Text>
              <TouchableOpacity onPress={() => setDayModalVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
            {dayModalSpends.length === 0 ? (
              <Text style={[s.empty, { color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.xl }]}>No entries</Text>
            ) : (
              <FlatList
                data={dayModalSpends}
                keyExtractor={e => e.id}
                style={{ maxHeight: 400 }}
                renderItem={({ item }) => (
                  <View style={[s.modalTxRow, { borderBottomColor: colors.border }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.modalTxAmount, { color: staticColors.danger }]}>{fmt(item.amount)}</Text>
                      {item.note && <Text style={[s.modalTxNote, { color: colors.textMuted }]}>{item.note}</Text>}
                    </View>
                    <Text style={[s.modalTxDate, { color: colors.textSubtle }]}>
                      {new Date(item.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <TouchableOpacity onPress={() => handleDeleteSpend(item.id)} style={{ paddingLeft: spacing.md }}>
                      <Ionicons name="trash-outline" size={18} color={staticColors.danger} />
                    </TouchableOpacity>
                  </View>
                )}
                ListFooterComponent={
                  <Text style={[s.dayTotal, { color: colors.textMuted, padding: spacing.md }]}>
                    Total: <Text style={{ color: staticColors.danger, fontWeight: '700' }}>{fmt(dayModalSpends.reduce((s, e) => s + e.amount, 0))}</Text>
                  </Text>
                }
              />
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
    </View>
  );
}

function StatChip({ icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 3, flex: 1 }}>
      <View style={{ backgroundColor: color + '25', borderRadius: radius.full, padding: 5 }}>
        <Ionicons name={icon} size={14} color={color} />
      </View>
      <Text style={{ ...typography.xs, color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>{label}</Text>
      <Text style={{ ...typography.sm, color: '#fff', fontWeight: '700', textAlign: 'center' }}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container:         { flex: 1 },
  content:           { padding: spacing.md, paddingBottom: 100 },
  header:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg, paddingTop: spacing.xl },
  monthNav:          { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  navArrow:          { padding: 6 },
  title:             { ...typography['2xl'], fontWeight: '800', letterSpacing: -0.5 },
  subtitle:          { ...typography.sm, marginTop: 2 },
  headerRight:       { flexDirection: 'row', gap: spacing.xs },
  iconBtn:           { width: 38, height: 38, borderRadius: radius.full, justifyContent: 'center', alignItems: 'center' },

  // Balance card
  balanceCard:       { borderRadius: radius.xl, padding: spacing.lg, paddingBottom: spacing.md, overflow: 'hidden', ...shadow.primary },
  cardOrb1:          { position: 'absolute', width: 180, height: 180, borderRadius: 90, backgroundColor: 'rgba(255,255,255,0.06)', top: -60, right: -40 },
  cardOrb2:          { position: 'absolute', width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(255,255,255,0.05)', bottom: -30, left: 20 },
  rolloverChip:      { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: radius.full, paddingHorizontal: spacing.sm, paddingVertical: 3, marginBottom: spacing.sm },
  rolloverLabel:     { ...typography.xs, color: 'rgba(255,255,255,0.85)' },
  balanceLabel:      { ...typography.sm, color: 'rgba(255,255,255,0.65)', marginBottom: spacing.xs, fontWeight: '500' },
  balanceAmount:     { ...typography['3xl'], color: '#fff', fontWeight: '800', marginBottom: spacing.md, letterSpacing: -1 },
  statDividerH:      { height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginBottom: spacing.md },
  balanceRow:        { flexDirection: 'row', justifyContent: 'space-around', gap: spacing.xs },
  statDivider:       { width: 1, backgroundColor: 'rgba(255,255,255,0.15)', alignSelf: 'stretch' },
  tapHint:           { ...typography.xs, color: 'rgba(255,255,255,0.4)', textAlign: 'center', marginTop: spacing.sm },

  // Two-col cards
  twoColRow:         { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  halfCard:          { flex: 1, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, overflow: 'hidden' },
  halfCardAccent:    { position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, borderTopLeftRadius: radius.lg, borderBottomLeftRadius: radius.lg },
  projLabel:         { ...typography.xs, fontWeight: '600', letterSpacing: 0.3, textTransform: 'uppercase', marginBottom: spacing.xs },
  projAmount:        { ...typography.xl, fontWeight: '800', letterSpacing: -0.5 },
  projDays:          { ...typography.xs, marginTop: 4 },

  // Progress tracks
  track:             { height: 8, borderRadius: radius.full, overflow: 'hidden' },
  trackBar:          { height: '100%', borderRadius: radius.full },

  // Daily log
  dailyLogCard:      { borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.md, borderWidth: 1 },
  dailyLogHeader:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  todayBadge:        { borderRadius: radius.full, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 3, alignItems: 'flex-end' },
  todayBadgeText:    { ...typography.xs, fontWeight: '700' },
  todayOverText:     { ...typography.xs, fontWeight: '600' },
  datePill:          { paddingHorizontal: spacing.md, paddingVertical: spacing.xs, borderRadius: radius.full, borderWidth: 1, marginRight: spacing.xs, alignItems: 'center' },
  datePillText:      { ...typography.xs, fontWeight: '600' },
  datePillBadge:     { fontSize: 9, fontWeight: '700', marginTop: 1 },
  dayTotal:          { ...typography.sm, marginBottom: spacing.sm },
  addSpendRow:       { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm },
  spendInput:        { width: 90, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderWidth: 1, fontSize: 14 },
  spendNoteInput:    { flex: 1, borderRadius: radius.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderWidth: 1, fontSize: 14 },
  spendAddBtn:       { width: 40, height: 40, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  spendEntry:        { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.xs, borderBottomWidth: 1 },
  spendEntryAmount:  { ...typography.base, fontWeight: '700' },
  spendEntryNote:    { ...typography.xs, marginTop: 1 },
  spendEntryTime:    { ...typography.xs, marginRight: spacing.xs },
  emptySmall:        { ...typography.xs, textAlign: 'center', paddingVertical: spacing.sm },

  // Quick links
  quickRow:          { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  quickBtn:          { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.md, justifyContent: 'flex-start' },
  quickIconWrap:     { width: 36, height: 36, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center' },
  quickLabel:        { ...typography.sm, fontWeight: '600' },

  // Upcoming
  upcomingRow:       { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.lg, padding: spacing.sm, marginBottom: spacing.xs },
  upcomingDot:       { width: 8, height: 8, borderRadius: 4 },
  upcomingName:      { ...typography.sm, fontWeight: '600' },
  upcomingDate:      { ...typography.xs },
  upcomingAmount:    { ...typography.sm, fontWeight: '700' },

  // Sections
  section:           { marginBottom: spacing.lg },
  sectionRow:        { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  sectionTitle:      { ...typography.lg, fontWeight: '700' },
  seeAll:            { ...typography.sm, color: staticColors.primary, fontWeight: '600' },
  empty:             { ...typography.sm, textAlign: 'center', marginTop: spacing.md },
  rolloverRow:       { flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderRadius: radius.md, borderWidth: 1, marginBottom: spacing.xs, gap: spacing.sm },
  rolloverDot:       { width: 8, height: 8, borderRadius: 4 },
  rolloverName:      { ...typography.sm, fontWeight: '600' },
  rolloverSub:       { ...typography.xs, marginTop: 1 },
  rolloverAmt:       { ...typography.base, fontWeight: '700' },

  // FAB
  fab:               { position: 'absolute', bottom: spacing.xl, right: spacing.md, width: 58, height: 58, borderRadius: radius.full, backgroundColor: staticColors.primary, justifyContent: 'center', alignItems: 'center', ...shadow.primary },

  // Modals
  modalOverlay:      { flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'flex-end' },
  modalSheet:        { borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, padding: spacing.lg, paddingBottom: 40, maxHeight: '85%' },
  modalHeaderRow:    { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md },
  modalTitle:        { ...typography.lg, fontWeight: '700' },
  modalTotals:       { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: spacing.md },
  modalTotalItem:    { alignItems: 'center' },
  modalTotalLabel:   { ...typography.xs, marginBottom: 4 },
  modalTotalValue:   { ...typography.xl, fontWeight: '700' },
  modalSectionLabel: { ...typography.xs, fontWeight: '700', letterSpacing: 1, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  modalTxRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1 },
  modalTxName:       { ...typography.sm, fontWeight: '600' },
  modalTxNote:       { ...typography.xs, marginTop: 1 },
  modalTxDate:       { ...typography.xs },
  modalTxAmount:     { ...typography.base, fontWeight: '700', marginLeft: spacing.sm },
});
