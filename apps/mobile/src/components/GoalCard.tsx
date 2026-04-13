import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { colors, spacing, radius, typography } from '../theme';

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
  const daysLeft = g.deadline
    ? Math.max(0, Math.ceil((new Date(g.deadline).getTime() - Date.now()) / 86_400_000))
    : null;

  return (
    <View style={[s.card, { borderLeftColor: g.color, borderLeftWidth: 3 }]}>
      <View style={s.row}>
        <View style={[s.icon, { backgroundColor: g.color + '22' }]}>
          <Text style={s.iconText}>{g.icon}</Text>
        </View>
        <View style={s.body}>
          <Text style={s.name}>{g.name}</Text>
          <Text style={s.amounts}>
            ${parseFloat(g.current_amount).toFixed(2)} / ${parseFloat(g.target_amount).toFixed(2)}
          </Text>
          {daysLeft !== null && (
            <Text style={[s.deadline, daysLeft < 7 && { color: colors.warning }]}>
              {daysLeft} days left · {g.deadline ? format(new Date(g.deadline), 'MMM d') : ''}
            </Text>
          )}
        </View>
        <View style={s.right}>
          <Text style={[s.pct, { color: g.color }]}>{g.pct}%</Text>
          {!g.is_completed && onDeposit && (
            <TouchableOpacity style={[s.depositBtn, { backgroundColor: g.color }]} onPress={onDeposit}>
              <Ionicons name="add" size={16} color="#fff" />
            </TouchableOpacity>
          )}
          {onDelete && (
            <TouchableOpacity onPress={onDelete} style={{ padding: 4 }}>
              <Ionicons name="trash-outline" size={14} color={colors.dark.textSubtle} />
            </TouchableOpacity>
          )}
        </View>
      </View>
      <View style={s.track}>
        <View style={[s.bar, { width: `${g.pct}%` as any, backgroundColor: g.color }]} />
      </View>
      {g.is_completed && (
        <View style={s.completedBadge}>
          <Text style={s.completedText}>✅ Goal reached!</Text>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card:          { backgroundColor: colors.dark.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  row:           { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  icon:          { width: 44, height: 44, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center', marginRight: spacing.sm },
  iconText:      { fontSize: 22 },
  body:          { flex: 1 },
  name:          { ...typography.base, color: colors.dark.text, fontWeight: '600' },
  amounts:       { ...typography.sm, color: colors.dark.textMuted, marginTop: 2 },
  deadline:      { ...typography.xs, color: colors.dark.textSubtle, marginTop: 2 },
  right:         { alignItems: 'center', gap: 6 },
  pct:           { ...typography.base, fontWeight: '700' },
  depositBtn:    { width: 28, height: 28, borderRadius: radius.full, justifyContent: 'center', alignItems: 'center' },
  track:         { height: 6, backgroundColor: colors.dark.surfaceHigh, borderRadius: radius.full, overflow: 'hidden' },
  bar:           { height: '100%', borderRadius: radius.full },
  completedBadge:{ marginTop: spacing.sm },
  completedText: { ...typography.xs, color: colors.success },
});
