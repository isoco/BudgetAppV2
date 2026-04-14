import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { colors, spacing, radius, typography } from '../theme';

interface Props {
  transaction: {
    id: string;
    amount: number;
    type: string;
    date: string;
    note: string | null;
    merchant: string | null;
    is_recurring?: number;
    category_name?: string;
    category_icon?: string;
    category_color?: string;
  };
  onDelete?: () => void;
  onPress?: () => void;
  onLongPress?: () => void;
}

export function TransactionItem({ transaction: tx, onDelete, onPress, onLongPress }: Props) {
  const isIncome = tx.type === 'income';
  const label    = tx.merchant || tx.note || tx.category_name || 'Transaction';
  const color    = tx.category_color || colors.dark.textSubtle;

  return (
    <TouchableOpacity
      style={s.container}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      <View style={[s.icon, { backgroundColor: color + '22' }]}>
        <Text style={s.emoji}>{iconToEmoji(tx.category_icon ?? '')}</Text>
      </View>
      <View style={s.body}>
        <Text style={s.label} numberOfLines={1}>{label}</Text>
        <Text style={s.meta}>
          {tx.category_name && `${tx.category_name} · `}
          {format(new Date(tx.date), 'MMM d')}
          {tx.is_recurring === 1 && ' · 🔁'}
        </Text>
      </View>
      <View style={s.right}>
        <Text style={[s.amount, { color: isIncome ? colors.success : colors.dark.text }]}>
          {isIncome ? '+' : '-'}€{tx.amount.toFixed(2)}
        </Text>
        {onDelete && (
          <TouchableOpacity onPress={onDelete} style={s.del}>
            <Ionicons name="trash-outline" size={14} color={colors.dark.textSubtle} />
          </TouchableOpacity>
        )}
      </View>
    </TouchableOpacity>
  );
}

function iconToEmoji(icon: string): string {
  const map: Record<string, string> = {
    utensils: '🍽️', car: '🚗', 'shopping-bag': '🛍️', zap: '⚡',
    heart: '❤️', tv: '📺', plane: '✈️', book: '📚',
    briefcase: '💼', laptop: '💻', 'trending-up': '📈', 'more-horizontal': '•••',
  };
  return map[icon] ?? '💰';
}

const s = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.dark.border },
  icon:      { width: 44, height: 44, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center', marginRight: spacing.sm },
  emoji:     { fontSize: 20 },
  body:      { flex: 1 },
  label:     { ...typography.base, color: colors.dark.text, fontWeight: '500' },
  meta:      { ...typography.xs, color: colors.dark.textMuted, marginTop: 2 },
  right:     { alignItems: 'flex-end', gap: 4 },
  amount:    { ...typography.base, fontWeight: '600' },
  del:       { padding: 4 },
});
