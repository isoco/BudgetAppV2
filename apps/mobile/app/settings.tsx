import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, Switch, Alert, Modal } from 'react-native';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as LocalAuthentication from 'expo-local-authentication';
import { getSettings, saveSettings, rolloverFromPreviousMonth, exportAllData, importAllData, AppSettings, getCategories, Category } from '../src/db/queries';
import { useTheme } from '../src/theme/useTheme';
import { useThemeStore } from '../src/store/themeStore';
import { colors as staticColors, spacing, radius, typography } from '../src/theme';

const BUILD_VERSION = process.env.EXPO_PUBLIC_BUILD_VERSION ?? 'dev';
const BUILD_DATE    = process.env.EXPO_PUBLIC_BUILD_DATE    ?? 'dev';

const PRIVACY_DEFAULTS: Pick<AppSettings, 'privacy_hide_income' | 'privacy_biometric' | 'privacy_hide_cats'> = {
  privacy_hide_income: false,
  privacy_biometric:   false,
  privacy_hide_cats:   'all',
};

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { mode, setMode } = useThemeStore();
  const [settings, setSettings]     = useState<AppSettings>({ daily_limit: 0, monthly_savings: 0, auto_rollover: true, theme: 'dark', ...PRIVACY_DEFAULTS });
  const [dailyLimit, setDailyLimit] = useState('');
  const [savings, setSavings]       = useState('');
  const [saving, setSaving]         = useState(false);
  const [importing, setImporting]   = useState(false);
  const [importVisible, setImportVisible] = useState(false);
  const [importJson, setImportJson] = useState('');

  // Privacy
  const [incomeCategories, setIncomeCategories] = useState<Category[]>([]);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [catPickerVisible, setCatPickerVisible] = useState(false);

  useEffect(() => {
    getSettings().then(s => {
      setSettings(s);
      setDailyLimit(s.daily_limit > 0 ? String(s.daily_limit) : '');
      setSavings(s.monthly_savings > 0 ? String(s.monthly_savings) : '');
    });
    getCategories({ type: 'income' }).then(cats => setIncomeCategories(cats as Category[]));
    LocalAuthentication.hasHardwareAsync().then(setBiometricAvailable);
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const updated: Partial<AppSettings> = {
        daily_limit:          parseFloat(dailyLimit) || 0,
        monthly_savings:      parseFloat(savings)    || 0,
        auto_rollover:        settings.auto_rollover,
        privacy_hide_income:  settings.privacy_hide_income,
        privacy_biometric:    settings.privacy_biometric,
        privacy_hide_cats:    settings.privacy_hide_cats,
      };
      await saveSettings(updated);
      Alert.alert('Saved', 'Settings updated.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRollover() {
    Alert.alert(
      'Run Rollover',
      'This will carry last month\'s remaining balance to this month. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: async () => {
          const result = await rolloverFromPreviousMonth();
          Alert.alert('Done', `€${result.amount.toFixed(2)} leftover from ${result.fromMonth} rolled over.`);
        }},
      ]
    );
  }

  async function handleExport() {
    try {
      const json = await exportAllData();
      const date = new Date().toISOString().slice(0, 10);
      const path = `${FileSystem.cacheDirectory}budget-export-${date}.json`;
      await FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(path, { mimeType: 'application/json', dialogTitle: 'Save Budget Export' });
    } catch (e: any) {
      Alert.alert('Export Failed', e.message);
    }
  }

  async function handleImportConfirm() {
    if (!importJson.trim()) return Alert.alert('Paste your exported JSON first.');
    setImporting(true);
    try {
      await importAllData(importJson.trim());
      setImportVisible(false);
      setImportJson('');
      Alert.alert('Success', 'Data imported successfully.');
    } catch (e: any) {
      Alert.alert('Import Failed', e.message);
    } finally {
      setImporting(false);
    }
  }

  const themeOptions: Array<{ label: string; value: 'dark' | 'light' | 'system' }> = [
    { label: 'Dark',   value: 'dark'   },
    { label: 'Light',  value: 'light'  },
    { label: 'System', value: 'system' },
  ];

  return (
    <View style={[s.container, { backgroundColor: colors.bg }]}>
      <View style={[s.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="close" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[s.title, { color: colors.text }]}>Settings</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={s.content}>

        {/* Appearance */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>Appearance</Text>
          <Text style={[s.sectionDesc, { color: colors.textMuted }]}>Choose your preferred color theme.</Text>
          <View style={s.themeRow}>
            {themeOptions.map(opt => (
              <TouchableOpacity
                key={opt.value}
                style={[s.themeBtn, { borderColor: colors.border, backgroundColor: colors.surface }, mode === opt.value && { borderColor: staticColors.primary, backgroundColor: `${staticColors.primary}22` }]}
                onPress={() => { setMode(opt.value); saveSettings({ theme: opt.value }); }}
              >
                <Text style={[s.themeBtnText, { color: colors.textMuted }, mode === opt.value && { color: staticColors.primary, fontWeight: '700' }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={[s.divider, { backgroundColor: colors.border }]} />

        {/* Daily Limit */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>Daily Spending Limit</Text>
          <Text style={[s.sectionDesc, { color: colors.textMuted }]}>Get a warning when you exceed this amount in a single day.</Text>
          <View style={[s.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.currency, { color: colors.textMuted }]}>€</Text>
            <TextInput
              style={[s.input, { color: colors.text }]}
              placeholder="0.00  (disabled)"
              placeholderTextColor={colors.textSubtle}
              keyboardType="decimal-pad"
              value={dailyLimit}
              onChangeText={setDailyLimit}
            />
          </View>
        </View>

        <View style={[s.divider, { backgroundColor: colors.border }]} />

        {/* Monthly Savings */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>Monthly Savings Target</Text>
          <Text style={[s.sectionDesc, { color: colors.textMuted }]}>Amount reserved from income each month before calculating your spendable balance.</Text>
          <View style={[s.inputRow, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <Text style={[s.currency, { color: colors.textMuted }]}>€</Text>
            <TextInput
              style={[s.input, { color: colors.text }]}
              placeholder="0.00  (no target)"
              placeholderTextColor={colors.textSubtle}
              keyboardType="decimal-pad"
              value={savings}
              onChangeText={setSavings}
            />
          </View>
        </View>

        <View style={[s.divider, { backgroundColor: colors.border }]} />

        {/* Auto Rollover */}
        <View style={s.section}>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={[s.sectionTitle, { color: colors.text }]}>Auto Rollover</Text>
              <Text style={[s.sectionDesc, { color: colors.textMuted }]}>Carry remaining balance from last month into this month automatically on app open.</Text>
            </View>
            <Switch
              value={settings.auto_rollover}
              onValueChange={v => setSettings(prev => ({ ...prev, auto_rollover: v }))}
              trackColor={{ true: staticColors.primary }}
              thumbColor="#fff"
            />
          </View>
        </View>

        <View style={[s.divider, { backgroundColor: colors.border }]} />

        {/* Manual Rollover */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>Manual Rollover</Text>
          <Text style={[s.sectionDesc, { color: colors.textMuted }]}>Manually carry last month's remaining balance to this month.</Text>
          <TouchableOpacity style={[s.secondaryBtn, { borderColor: staticColors.primary }]} onPress={handleRollover}>
            <Ionicons name="refresh" size={16} color={staticColors.primary} />
            <Text style={[s.secondaryBtnText, { color: staticColors.primary }]}>Run Rollover Now</Text>
          </TouchableOpacity>
        </View>

        <View style={[s.divider, { backgroundColor: colors.border }]} />

        {/* Privacy */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>Privacy</Text>
          <Text style={[s.sectionDesc, { color: colors.textMuted }]}>Hide income figures on the dashboard. Use the eye icon to reveal them temporarily.</Text>

          <View style={[s.row, { marginBottom: spacing.md }]}>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowLabel, { color: colors.text }]}>Hide Income Numbers</Text>
            </View>
            <Switch
              value={settings.privacy_hide_income}
              onValueChange={v => setSettings(prev => ({ ...prev, privacy_hide_income: v }))}
              trackColor={{ true: staticColors.primary }}
              thumbColor="#fff"
            />
          </View>

          {settings.privacy_hide_income && (
            <>
              {biometricAvailable && (
                <View style={[s.row, { marginBottom: spacing.md }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.rowLabel, { color: colors.text }]}>Require Biometric to Unlock</Text>
                    <Text style={[s.rowDesc, { color: colors.textMuted }]}>Fingerprint / Face ID</Text>
                  </View>
                  <Switch
                    value={settings.privacy_biometric}
                    onValueChange={v => setSettings(prev => ({ ...prev, privacy_biometric: v }))}
                    trackColor={{ true: staticColors.primary }}
                    thumbColor="#fff"
                  />
                </View>
              )}

              <Text style={[s.rowLabel, { color: colors.text, marginBottom: spacing.xs }]}>Which income to hide:</Text>
              <View style={[s.row, { gap: spacing.sm, marginBottom: spacing.sm }]}>
                <TouchableOpacity
                  style={[s.optionBtn, { borderColor: settings.privacy_hide_cats === 'all' ? staticColors.primary : colors.border, backgroundColor: settings.privacy_hide_cats === 'all' ? staticColors.primary + '22' : colors.surface }]}
                  onPress={() => setSettings(prev => ({ ...prev, privacy_hide_cats: 'all' }))}
                >
                  <Text style={[s.optionBtnText, { color: settings.privacy_hide_cats === 'all' ? staticColors.primary : colors.textMuted }]}>All Income</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.optionBtn, { borderColor: settings.privacy_hide_cats !== 'all' ? staticColors.primary : colors.border, backgroundColor: settings.privacy_hide_cats !== 'all' ? staticColors.primary + '22' : colors.surface }]}
                  onPress={() => setCatPickerVisible(true)}
                >
                  <Text style={[s.optionBtnText, { color: settings.privacy_hide_cats !== 'all' ? staticColors.primary : colors.textMuted }]}>
                    {settings.privacy_hide_cats === 'all' || !settings.privacy_hide_cats
                      ? 'Choose Categories'
                      : `${settings.privacy_hide_cats.split(',').filter(Boolean).length} selected`}
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>

        <View style={[s.divider, { backgroundColor: colors.border }]} />

        {/* Manage Categories */}
        <TouchableOpacity style={[s.linkRow, { borderBottomColor: colors.border }]} onPress={() => router.push('/manage-categories')}>
          <Text style={[s.linkText, { color: colors.text }]}>Manage Categories</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </TouchableOpacity>

        <View style={[s.divider, { backgroundColor: colors.border }]} />

        {/* Data */}
        <View style={s.section}>
          <Text style={[s.sectionTitle, { color: colors.text }]}>Data</Text>

          <TouchableOpacity style={[s.secondaryBtn, { borderColor: staticColors.primary, marginBottom: spacing.sm }]} onPress={handleExport}>
            <Ionicons name="share-outline" size={16} color={staticColors.primary} />
            <Text style={[s.secondaryBtnText, { color: staticColors.primary }]}>Export Data (.json)</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[s.secondaryBtn, { borderColor: staticColors.warning }]} onPress={() => setImportVisible(true)}>
            <Ionicons name="download-outline" size={16} color={staticColors.warning} />
            <Text style={[s.secondaryBtnText, { color: staticColors.warning }]}>Import Data</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[s.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
          <Text style={s.saveBtnText}>{saving ? 'Saving…' : 'Save Settings'}</Text>
        </TouchableOpacity>

        <View style={s.buildInfo}>
          <Text style={[s.buildInfoText, { color: colors.textSubtle }]}>
            v{BUILD_VERSION} · built {BUILD_DATE}
          </Text>
        </View>
      </ScrollView>

      {/* Category Picker Modal */}
      <Modal visible={catPickerVisible} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: colors.surface }]}>
            <Text style={[s.modalTitle, { color: colors.text }]}>Select Income Categories to Hide</Text>
            <ScrollView style={{ maxHeight: 300, marginBottom: spacing.md }}>
              {incomeCategories.map(c => {
                const selected = settings.privacy_hide_cats !== 'all' &&
                  settings.privacy_hide_cats.split(',').includes(c.id);
                return (
                  <TouchableOpacity
                    key={c.id}
                    style={[s.catPickerRow, { borderBottomColor: colors.border }]}
                    onPress={() => {
                      const current = settings.privacy_hide_cats === 'all' ? [] : settings.privacy_hide_cats.split(',').filter(Boolean);
                      const next = selected ? current.filter(id => id !== c.id) : [...current, c.id];
                      setSettings(prev => ({ ...prev, privacy_hide_cats: next.join(',') || '' }));
                    }}
                  >
                    <Ionicons name={selected ? 'checkbox' : 'square-outline'} size={22} color={selected ? staticColors.primary : colors.textMuted} />
                    <Text style={[s.catPickerLabel, { color: colors.text }]}>{c.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <View style={s.modalActions}>
              <TouchableOpacity style={[s.modalBtn, { borderColor: staticColors.primary, backgroundColor: staticColors.primary }]} onPress={() => setCatPickerVisible(false)}>
                <Text style={[s.modalBtnText, { color: '#fff' }]}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Import Modal — paste exported JSON */}
      <Modal visible={importVisible} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalBox, { backgroundColor: colors.surface }]}>
            <Text style={[s.modalTitle, { color: colors.text }]}>Import Data</Text>
            <Text style={[s.sectionDesc, { color: colors.textMuted }]}>
              Paste the contents of your exported budget JSON file below.
            </Text>
            <TextInput
              style={[s.importInput, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
              multiline
              placeholder="Paste JSON here…"
              placeholderTextColor={colors.textSubtle}
              value={importJson}
              onChangeText={setImportJson}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <View style={s.modalActions}>
              <TouchableOpacity style={[s.modalBtn, { borderColor: colors.border, backgroundColor: colors.surfaceHigh }]} onPress={() => { setImportVisible(false); setImportJson(''); }}>
                <Text style={[s.modalBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.modalBtn, { borderColor: staticColors.warning, backgroundColor: staticColors.warning, opacity: importing ? 0.6 : 1 }]} onPress={handleImportConfirm} disabled={importing}>
                <Text style={[s.modalBtnText, { color: '#fff' }]}>{importing ? 'Importing…' : 'Import'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

    </View>
  );
}

const s = StyleSheet.create({
  container:       { flex: 1 },
  header:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: spacing.md, paddingTop: 56 },
  title:           { ...typography.lg, fontWeight: '600' },
  content:         { padding: spacing.md, paddingBottom: 60 },
  section:         { paddingVertical: spacing.md },
  sectionTitle:    { ...typography.base, fontWeight: '600', marginBottom: 4 },
  sectionDesc:     { ...typography.sm, marginBottom: spacing.md, lineHeight: 20 },
  inputRow:        { flexDirection: 'row', alignItems: 'center', borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md },
  currency:        { ...typography.lg, marginRight: 4 },
  input:           { flex: 1, ...typography.lg, paddingVertical: spacing.md },
  divider:         { height: 1 },
  row:             { flexDirection: 'row', alignItems: 'center' },
  secondaryBtn:    { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, alignSelf: 'flex-start' },
  secondaryBtnText:{ ...typography.sm, fontWeight: '600' },
  saveBtn:         { backgroundColor: staticColors.primary, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginTop: spacing.lg },
  saveBtnText:     { color: '#fff', fontWeight: '600', ...typography.base },
  buildInfo:       { alignItems: 'center', paddingVertical: spacing.lg },
  buildInfoText:   { ...typography.xs },
  themeRow:        { flexDirection: 'row', gap: spacing.sm },
  themeBtn:        { flex: 1, paddingVertical: spacing.sm, borderWidth: 1, borderRadius: radius.md, alignItems: 'center' },
  themeBtnText:    { ...typography.sm, fontWeight: '500' },
  linkRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: spacing.md },
  linkText:        { ...typography.base, fontWeight: '500' },
  rowLabel:        { ...typography.base, fontWeight: '500' },
  rowDesc:         { ...typography.xs, marginTop: 2 },
  optionBtn:       { flex: 1, borderWidth: 1, borderRadius: radius.md, paddingVertical: spacing.sm, alignItems: 'center' },
  optionBtnText:   { ...typography.sm, fontWeight: '600' },
  catPickerRow:    { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm, borderBottomWidth: 1 },
  catPickerLabel:  { ...typography.base },
  modalOverlay:    { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalBox:        { borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg, paddingBottom: 40 },
  modalTitle:      { ...typography.lg, fontWeight: '700', marginBottom: spacing.md },
  modalActions:    { flexDirection: 'row', gap: spacing.sm },
  modalBtn:        { flex: 1, borderWidth: 1, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  modalBtnText:    { ...typography.base, fontWeight: '600' },
  importInput:     { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, height: 160, textAlignVertical: 'top', ...typography.sm, marginBottom: spacing.md },
});
