import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { useTheme } from '../theme/useTheme';
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
  checked?: boolean;
  onToggle?: () => void;
  hideAmount?: boolean;
}

export function TransactionItem({ transaction: tx, onDelete, onPress, onLongPress, checked, onToggle, hideAmount }: Props) {
  const { colors: c } = useTheme();
  const isIncome = tx.type === 'income';
  const label    = tx.merchant || tx.note || tx.category_name || 'Transaction';
  const iconColor = tx.category_color || c.textSubtle;

  return (
    <TouchableOpacity
      style={[s.container, { borderBottomColor: c.border }]}
      onPress={onPress}
      onLongPress={onLongPress}
      activeOpacity={onPress ? 0.7 : 1}
    >
      {onToggle !== undefined && (
        <TouchableOpacity onPress={onToggle} style={s.checkbox} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons
            name={checked ? 'checkbox' : 'square-outline'}
            size={22}
            color={checked ? colors.success : c.textSubtle}
          />
        </TouchableOpacity>
      )}
      <View style={[s.icon, { backgroundColor: iconColor + '22' }]}>
        <Text style={s.emoji}>{iconToEmoji(tx.category_icon ?? '')}</Text>
      </View>
      <View style={s.body}>
        <Text style={[s.label, { color: c.text }, checked === false && s.labelDim]} numberOfLines={1}>{label}</Text>
        <Text style={[s.meta, { color: c.textMuted }]}>
          {tx.category_name && `${tx.category_name} · `}
          {format(new Date(tx.date), 'MMM d')}
          {tx.is_recurring === 1 && ' · 🔁'}
        </Text>
      </View>
      <View style={s.right}>
        <Text style={[s.amount, { color: isIncome ? colors.success : c.text }, checked === false && s.amountDim]}>
          {hideAmount ? '€ ••••' : `${isIncome ? '+' : '-'}€${tx.amount.toFixed(2)}`}
        </Text>
        {onDelete && (
          <TouchableOpacity onPress={onDelete} style={s.del}>
            <Ionicons name="trash-outline" size={14} color={c.textSubtle} />
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
    restaurant: '🍽️', 'bag-handle': '🛍️', flash: '⚡', airplane: '✈️',
    shield: '🛡️', 'ellipsis-horizontal': '•',
  };
  return map[icon] ?? '💰';
}

const s = StyleSheet.create({
  container:  { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.sm, borderBottomWidth: 1 },
  checkbox:   { marginRight: spacing.sm },
  icon:       { width: 44, height: 44, borderRadius: radius.md, justifyContent: 'center', alignItems: 'center', marginRight: spacing.sm },
  emoji:      { fontSize: 20 },
  body:       { flex: 1 },
  label:      { ...typography.base, fontWeight: '500' },
  labelDim:   { opacity: 0.4 },
  meta:       { ...typography.xs, marginTop: 2 },
  right:      { alignItems: 'flex-end', gap: 4 },
  amount:     { ...typography.base, fontWeight: '600' },
  amountDim:  { opacity: 0.4 },
  del:        { padding: 4 },
});
