import { useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getGoals, depositToGoal, deleteGoal, Goal } from '../../src/db/queries';
import { useQuery } from '../../src/hooks/useQuery';
import { colors, spacing, radius, typography } from '../../src/theme';
import { GoalCard } from '../../src/components/GoalCard';

export default function GoalsScreen() {
  const { data = [], loading, refetch } = useQuery(getGoals);
  useFocusEffect(useCallback(() => { refetch(); }, []));

  async function handleDeposit(goal: Goal) {
    Alert.prompt(
      `Add to "${goal.name}"`,
      `€${goal.current_amount.toFixed(2)} / €${goal.target_amount.toFixed(2)}`,
      async (val) => {
        const amount = parseFloat(val);
        if (isNaN(amount) || amount <= 0) return;
        await depositToGoal(goal.id, amount);
        refetch();
      },
      'plain-text', '', 'decimal-pad'
    );
  }

  async function handleDelete(id: string) {
    Alert.alert('Delete goal', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await deleteGoal(id); refetch(); } },
    ]);
  }

  const active    = (data as Goal[]).filter(g => !g.is_completed);
  const completed = (data as Goal[]).filter(g => g.is_completed);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Goals</Text>
        <TouchableOpacity style={s.addBtn} onPress={() => router.push('/add-goal')}>
          <Ionicons name="add" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      <FlatList
        data={[
          ...(active.length    ? [{ _type: 'header', label: 'Active' }]       : []),
          ...active.map(g      => ({ _type: 'goal',   ...g })),
          ...(completed.length ? [{ _type: 'header', label: '✅ Completed' }] : []),
          ...completed.map(g   => ({ _type: 'goal',   ...g })),
        ] as any[]}
        keyExtractor={item => item.id ?? item.label}
        refreshing={loading}
        onRefresh={refetch}
        renderItem={({ item }) =>
          item._type === 'header'
            ? <Text style={s.sectionLabel}>{item.label}</Text>
            : <GoalCard goal={item} onDeposit={() => handleDeposit(item)} onDelete={() => handleDelete(item.id)} />
        }
        contentContainerStyle={s.list}
        ListEmptyComponent={
          !loading ? (
            <View style={s.empty}>
              <Text style={s.emptyText}>No goals yet</Text>
              <TouchableOpacity onPress={() => router.push('/add-goal')}>
                <Text style={s.emptyAction}>Create your first goal →</Text>
              </TouchableOpacity>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1, backgroundColor: colors.dark.bg },
  header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, paddingTop: 56 },
  title:        { ...typography['2xl'], color: colors.dark.text, fontWeight: '700' },
  addBtn:       { width: 36, height: 36, borderRadius: radius.full, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
  sectionLabel: { ...typography.sm, color: colors.dark.textMuted, fontWeight: '600', marginBottom: spacing.sm, marginTop: spacing.sm },
  list:         { padding: spacing.md, paddingBottom: 80 },
  empty:        { alignItems: 'center', marginTop: spacing.xl },
  emptyText:    { ...typography.base, color: colors.dark.textMuted, marginBottom: spacing.sm },
  emptyAction:  { ...typography.base, color: colors.primary, fontWeight: '600' },
});
