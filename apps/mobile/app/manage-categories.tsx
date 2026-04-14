import { useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  Modal, TextInput, Alert, Switch, ScrollView,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../src/theme/useTheme';
import {
  Category, getCategories, createCategory, updateCategory,
  deleteCategory, toggleCategoryActive, refreshRecurringAllFutureMonths,
} from '../src/db/queries';

const ICONS = [
  'home','car','cart','pizza','heart','briefcase','fitness','book',
  'airplane','leaf','shield','wallet','musical-notes','game-controller',
  'camera','gift','cafe','build','flash','star','phone-portrait',
  'tv','bus','bicycle','medkit','school','restaurant','pricetag',
] as const;

const COLORS = [
  '#ef4444','#f97316','#f59e0b','#84cc16',
  '#10b981','#06b6d4','#6366f1','#ec4899',
  '#94a3b8','#8b5cf6','#14b8a6','#3b82f6',
];

const TYPES = ['expense','income','both'] as const;

interface FormState {
  name: string; icon: string; color: string;
  type: 'income'|'expense'|'both';
  is_recurring: boolean; default_amount: string; due_day: string;
}

const defaultForm: FormState = {
  name: '', icon: 'star', color: '#6366f1',
  type: 'expense', is_recurring: false, default_amount: '', due_day: '',
};

export default function ManageCategoriesScreen() {
  const { colors, spacing, radius, typography } = useTheme();
  const s = makeStyles(colors, spacing, radius);

  const [categories, setCategories] = useState<Category[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(defaultForm);

  const load = useCallback(async () => {
    const data = await getCategories({ includeInactive: true });
    setCategories(data);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  function openAdd() {
    setForm(defaultForm);
    setEditingId(null);
    setModalVisible(true);
  }

  function openEdit(cat: Category) {
    setForm({
      name: cat.name,
      icon: cat.icon,
      color: cat.color,
      type: cat.type,
      is_recurring: cat.is_recurring === 1,
      default_amount: cat.default_amount > 0 ? String(cat.default_amount) : '',
      due_day: cat.due_day ? String(cat.due_day) : '',
    });
    setEditingId(cat.id);
    setModalVisible(true);
  }

  async function handleSave() {
    if (!form.name.trim()) { Alert.alert('Error', 'Name is required'); return; }
    try {
      const data = {
        name: form.name.trim(),
        icon: form.icon,
        color: form.color,
        type: form.type,
        is_recurring: form.is_recurring ? 1 : 0,
        default_amount: parseFloat(form.default_amount) || 0,
        due_day: form.due_day ? parseInt(form.due_day) : null,
      };
      if (editingId) {
        await updateCategory(editingId, data);
      } else {
        await createCategory({ ...data, is_system: 0, is_active: 1 } as any);
      }
      // If recurring, refresh all future months with updated values
      if (data.is_recurring && data.default_amount > 0) {
        await refreshRecurringAllFutureMonths();
      }
      setModalVisible(false);
      load();
    } catch (e: any) {
      Alert.alert('Error', e.message);
    }
  }

  async function handleDelete(cat: Category) {
    Alert.alert('Delete Category', `Delete "${cat.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await deleteCategory(cat.id);
        load();
      }},
    ]);
  }

  async function handleToggleActive(cat: Category) {
    await toggleCategoryActive(cat.id, cat.is_active ? 0 : 1);
    load();
  }

  const system = categories.filter(c => c.is_system === 1);
  const custom  = categories.filter(c => c.is_system === 0);

  return (
    <View style={s.container}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={s.title}>Categories</Text>
        <TouchableOpacity style={s.addBtn} onPress={openAdd}>
          <Ionicons name="add" size={22} color="#fff" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={s.content}>
        {custom.length > 0 && (
          <>
            <Text style={s.sectionLabel}>Custom</Text>
            {custom.map(cat => (
              <CategoryRow
                key={cat.id}
                cat={cat}
                colors={colors}
                spacing={spacing}
                radius={radius}
                typography={typography}
                onEdit={() => openEdit(cat)}
                onDelete={() => handleDelete(cat)}
                onToggleActive={() => handleToggleActive(cat)}
                showDelete
              />
            ))}
          </>
        )}

        <Text style={s.sectionLabel}>System</Text>
        {system.map(cat => (
          <CategoryRow
            key={cat.id}
            cat={cat}
            colors={colors}
            spacing={spacing}
            radius={radius}
            typography={typography}
            onEdit={() => openEdit(cat)}
            onDelete={() => {}}
            onToggleActive={() => handleToggleActive(cat)}
            showDelete={false}
          />
        ))}
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal visible={modalVisible} animationType="slide" presentationStyle="pageSheet">
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Ionicons name="close" size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={s.modalTitle}>{editingId ? 'Edit Category' : 'New Category'}</Text>
            <TouchableOpacity onPress={handleSave}>
              <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 16 }}>Save</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={s.modalContent}>
            {/* Name */}
            <Text style={s.label}>Name</Text>
            <TextInput
              style={s.input}
              value={form.name}
              onChangeText={v => setForm(f => ({ ...f, name: v }))}
              placeholder="Category name"
              placeholderTextColor={colors.textSubtle}
            />

            {/* Type */}
            <Text style={s.label}>Type</Text>
            <View style={s.row}>
              {TYPES.map(t => (
                <TouchableOpacity
                  key={t}
                  style={[s.typeBtn, form.type === t && { backgroundColor: colors.primary, borderColor: colors.primary }]}
                  onPress={() => setForm(f => ({ ...f, type: t }))}
                >
                  <Text style={[s.typeBtnText, form.type === t && { color: '#fff' }]}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Color */}
            <Text style={s.label}>Color</Text>
            <View style={s.colorGrid}>
              {COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[s.colorSwatch, { backgroundColor: c }, form.color === c && s.colorSelected]}
                  onPress={() => setForm(f => ({ ...f, color: c }))}
                />
              ))}
            </View>

            {/* Icon */}
            <Text style={s.label}>Icon</Text>
            <View style={s.iconGrid}>
              {ICONS.map(ic => (
                <TouchableOpacity
                  key={ic}
                  style={[s.iconBtn, form.icon === ic && { backgroundColor: form.color }]}
                  onPress={() => setForm(f => ({ ...f, icon: ic }))}
                >
                  <Ionicons name={ic as any} size={20} color={form.icon === ic ? '#fff' : colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>

            {/* Recurring */}
            <View style={[s.row, { justifyContent: 'space-between', marginVertical: spacing.sm }]}>
              <View>
                <Text style={s.label}>Recurring</Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Auto-add each month</Text>
              </View>
              <Switch
                value={form.is_recurring}
                onValueChange={v => setForm(f => ({ ...f, is_recurring: v }))}
                trackColor={{ true: colors.primary }}
                thumbColor="#fff"
              />
            </View>

            {form.is_recurring && (
              <>
                <Text style={s.label}>Default Amount (€)</Text>
                <TextInput
                  style={s.input}
                  value={form.default_amount}
                  onChangeText={v => setForm(f => ({ ...f, default_amount: v }))}
                  placeholder="0.00"
                  placeholderTextColor={colors.textSubtle}
                  keyboardType="decimal-pad"
                />
                <Text style={s.label}>Due Day (1-31)</Text>
                <TextInput
                  style={s.input}
                  value={form.due_day}
                  onChangeText={v => setForm(f => ({ ...f, due_day: v }))}
                  placeholder="e.g. 15"
                  placeholderTextColor={colors.textSubtle}
                  keyboardType="number-pad"
                />
              </>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

function CategoryRow({
  cat, colors, spacing, radius, typography,
  onEdit, onDelete, onToggleActive, showDelete,
}: {
  cat: Category; colors: any; spacing: any; radius: any; typography: any;
  onEdit: () => void; onDelete: () => void; onToggleActive: () => void; showDelete: boolean;
}) {
  const inactive = cat.is_active === 0;
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: radius.md, padding: spacing.md,
      marginBottom: spacing.sm, opacity: inactive ? 0.5 : 1,
    }}>
      <View style={{
        width: 40, height: 40, borderRadius: radius.full,
        backgroundColor: cat.color + '33', justifyContent: 'center', alignItems: 'center',
        marginRight: spacing.md,
      }}>
        <Ionicons name={cat.icon as any} size={20} color={cat.color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ ...typography.base, color: colors.text, fontWeight: '600' }}>{cat.name}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.xs, marginTop: 2 }}>
          <View style={{ backgroundColor: colors.surfaceHigh, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ ...typography.xs, color: colors.textMuted }}>{cat.type}</Text>
          </View>
          {cat.is_recurring === 1 && (
            <View style={{ backgroundColor: colors.primary + '22', borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ ...typography.xs, color: colors.primary }}>recurring</Text>
            </View>
          )}
          {cat.is_system === 1 && (
            <View style={{ backgroundColor: colors.surfaceHigh, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 }}>
              <Text style={{ ...typography.xs, color: colors.textSubtle }}>system</Text>
            </View>
          )}
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
        <TouchableOpacity onPress={onToggleActive}>
          <Ionicons name={cat.is_active ? 'eye' : 'eye-off'} size={18} color={colors.textMuted} />
        </TouchableOpacity>
        <TouchableOpacity onPress={onEdit}>
          <Ionicons name="pencil" size={18} color={colors.textMuted} />
        </TouchableOpacity>
        {showDelete && (
          <TouchableOpacity onPress={onDelete}>
            <Ionicons name="trash" size={18} color={colors.danger} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function makeStyles(colors: any, spacing: any, radius: any) {
  return StyleSheet.create({
    container:    { flex: 1, backgroundColor: colors.bg },
    header:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, paddingTop: 56 },
    title:        { fontSize: 20, color: colors.text, fontWeight: '700' },
    addBtn:       { width: 36, height: 36, borderRadius: radius.full, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' },
    content:      { padding: spacing.md, paddingBottom: 80 },
    sectionLabel: { fontSize: 13, color: colors.textMuted, fontWeight: '600', marginTop: spacing.sm, marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
    modal:        { flex: 1, backgroundColor: colors.bg },
    modalHeader:  { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, paddingTop: 56, borderBottomWidth: 1, borderBottomColor: colors.border },
    modalTitle:   { fontSize: 17, color: colors.text, fontWeight: '600' },
    modalContent: { padding: spacing.md, paddingBottom: 80 },
    label:        { fontSize: 13, color: colors.textMuted, fontWeight: '600', marginTop: spacing.md, marginBottom: spacing.xs, textTransform: 'uppercase', letterSpacing: 0.5 },
    input:        { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md, color: colors.text, fontSize: 15 },
    row:          { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
    typeBtn:      { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.full, borderWidth: 1, borderColor: colors.border },
    typeBtnText:  { color: colors.textMuted, fontSize: 14, fontWeight: '500' },
    colorGrid:    { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
    colorSwatch:  { width: 36, height: 36, borderRadius: radius.full },
    colorSelected:{ borderWidth: 3, borderColor: '#fff' },
    iconGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
    iconBtn:      { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  });
}
