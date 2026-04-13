import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, radius, typography } from '../theme';

interface Budget {
  id: string;
  amount: string;
  spent: number;
  remaining: number;
  pct: number;
  category_name: string;
  category_icon: string;
  category_color: string;
}

export function BudgetCard({ budget: b }: { budget: Budget }) {
  const isOver  = b.pct >= 100;
  const isWarn  = b.pct >= 80;
  const barColor = isOver ? colors.danger : isWarn ? colors.warning : colors.success;

  return (
    <View style={s.card}>
      <View style={s.row}>
        <View style={[s.icon, { backgroundColor: b.category_color + '22' }]}>
          <Text style={s.iconText}>{iconToEmoji(b.category_icon)}</Text>
        </View>
        <View style={s.body}>
          <Text style={s.name}>{b.category_name}</Text>
          <Text style={s.sub}>
            ${b.spent.toFixed(2)} of ${parseFloat(b.amount).toFixed(2)}
          </Text>
        </View>
        <View style={s.right}>
          <Text style={[s.pct, { color: barColor }]}>{b.pct}%</Text>
          <Text style={[s.remaining, { color: isOver ? colors.danger : colors.dark.textMuted }]}>
            {isOver ? `-€${Math.abs(b.remaining).toFixed(2)}` : `€${b.remaining.toFixed(2)} left`}
          </Text>
        </View>
      </View>
      <View style={s.track}>
        <View style={[s.bar, { width: `${Math.min(100, b.pct)}%` as any, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

function iconToEmoji(icon: string): string {
  const map: Record<string, string> = {
    utensils: '🍽️', car: '🚗', 'shopping-bag': '🛍️', zap: '⚡',
    heart: '❤️', tv: '📺', plane: '✈️', book: '📚',
    briefcase: '💼', laptop: '💻', 'trending-up': '📈', 'more-horizontal': '•',
  };
  return map[icon] ?? '📂';
}

const s = StyleSheet.create({
  card:     { backgroundColor: colors.dark.surface, borderRadius: radius.lg, padding: spacing.md, marginBottom: spacing.sm },
  row:      { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  icon:     { width: 40, height: 40, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center', marginRight: spacing.sm },
  iconText: { fontSize: 18 },
  body:     { flex: 1 },
  name:     { ...typography.base, color: colors.dark.text, fontWeight: '500' },
  sub:      { ...typography.xs, color: colors.dark.textMuted, marginTop: 2 },
  right:    { alignItems: 'flex-end' },
  pct:      { ...typography.sm, fontWeight: '700' },
  remaining:{ ...typography.xs },
  track:    { height: 6, backgroundColor: colors.dark.surfaceHigh, borderRadius: radius.full, overflow: 'hidden' },
  bar:      { height: '100%', borderRadius: radius.full },
});
