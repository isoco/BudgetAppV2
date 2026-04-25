import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useTheme } from '../theme/useTheme';
import { colors as staticColors, spacing, radius, typography } from '../theme';

interface Goal {
  id: string;
  name: string;
  icon: string;
  color: string;
  target_amount: string;
  current_amount: string;
  pct: number;
  deadline: string | null;
  is_completed: boolean;
}

export function GoalCard({ goal: g, onDeposit, onDelete }: { goal: Goal; onDeposit?: () => void; onDelete?: () => void }) {
  const { colors } = useTheme();
  const daysLeft = g.deadline
    ? Math.max(0, Math.ceil((new Date(g.deadline).getTime() - Date.now()) / 86_400_000))
    : null;
  const isUrgent = daysLeft !== null && daysLeft < 7;

  return (
    <View style={[s.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[s.topAccent, { backgroundColor: g.color + '18' }]}>
        <View style={[s.icon, { backgroundColor: g.color + '28' }]}>
          <Text style={s.iconText}>{g.icon}</Text>
        </View>
        <View style={s.body}>
          <Text style={[s.name, { color: colors.text }]}>{g.name}</Text>
          <Text style={[s.amounts, { color: colors.textMuted }]}>
            €{parseFloat(g.current_amount).toFixed(2)}
            <Text style={{ color: colors.textSubtle }}> / €{parseFloat(g.target_amount).toFixed(2)}</Text>
          </Text>
          {daysLeft !== null && (
            <View style={s.deadlineRow}>
              <Ionicons name="time-outline" size={11} color={isUrgent ? staticColors.warning : colors.textSubtle} />
              <Text style={[s.deadline, { color: isUrgent ? staticColors.warning : colors.textSubtle }]}>
                {' '}{daysLeft}d left · {g.deadline ? format(new Date(g.deadline), 'MMM d') : ''}
              </Text>
            </View>
          )}
        </View>
        <View style={s.right}>
          <View style={[s.pctBadge, { backgroundColor: g.color + '20' }]}>
            <Text style={[s.pct, { color: g.color }]}>{g.pct}%</Text>
          </View>
          <View style={s.actions}>
            {!g.is_completed && onDeposit && (
              <TouchableOpacity style={[s.depositBtn, { backgroundColor: g.color }]} onPress={onDeposit}>
                <Ionicons name="add" size={16} color="#fff" />
              </TouchableOpacity>
            )}
            {onDelete && (
              <TouchableOpacity onPress={onDelete} style={s.deleteBtn}>
                <Ionicons name="trash-outline" size={14} color={colors.textSubtle} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      <View style={s.trackWrap}>
        <View style={[s.track, { backgroundColor: colors.surfaceHigh }]}>
          <View style={[s.bar, { width: `${Math.min(100, g.pct)}%` as any, backgroundColor: g.color }]} />
        </View>
        {g.is_completed && (
          <View style={[s.completedBadge, { backgroundColor: staticColors.success + '18' }]}>
            <Ionicons name="checkmark-circle" size={13} color={staticColors.success} />
            <Text style={[s.completedText, { color: staticColors.success }]}>Goal reached!</Text>
          </View>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card:          { borderRadius: radius.lg, marginBottom: spacing.sm, borderWidth: 1, overflow: 'hidden' },
  topAccent:     { flexDirection: 'row', alignItems: 'center', padding: spacing.md },
  icon:          { width: 46, height: 46, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center', marginRight: spacing.sm },
  iconText:      { fontSize: 22 },
  body:          { flex: 1 },
  name:          { ...typography.base, fontWeight: '700' },
  amounts:       { ...typography.sm, marginTop: 2 },
  deadlineRow:   { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  deadline:      { ...typography.xs },
  right:         { alignItems: 'center', gap: spacing.sm, marginLeft: spacing.sm },
  pctBadge:      { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.full },
  pct:           { ...typography.sm, fontWeight: '800' },
  actions:       { flexDirection: 'row', gap: 6 },
  depositBtn:    { width: 28, height: 28, borderRadius: radius.full, justifyContent: 'center', alignItems: 'center' },
  deleteBtn:     { padding: 4 },
  trackWrap:     { paddingHorizontal: spacing.md, paddingBottom: spacing.md },
  track:         { height: 8, borderRadius: radius.full, overflow: 'hidden', marginBottom: spacing.xs },
  bar:           { height: '100%', borderRadius: radius.full },
  completedBadge:{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.full, alignSelf: 'flex-start' },
  completedText: { ...typography.xs, fontWeight: '600' },
});
