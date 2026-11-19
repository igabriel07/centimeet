/** ✎ Τίτλος & περιγραφή εξόδου: κουμπί καρφιτσωμένο πάνω δεξιά + pop-up */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';
import { Sheet } from './Sheet';
import { Body, Button, Input, useTheme } from './ui';

export const TITLE_MAX = 80;
export const DESCRIPTION_MAX = 500;

export type OutingDetails = { title: string; description: string };

/** Εικονίδιο στο header· τελίτσα όταν έχει συμπληρωθεί κάτι */
export function OutingDetailsButton({ filled, onPress }: { filled: boolean; onPress: () => void }) {
  const c = useTheme();
  const { t } = useTranslation();
  return (
    <Pressable onPress={onPress} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('details.open')} style={{ paddingHorizontal: 8 }}>
      <Ionicons name={filled ? 'create' : 'create-outline'} size={24} color={c.primary} />
      {filled ? (
        <View
          style={{ position: 'absolute', top: -1, right: 4, width: 9, height: 9, borderRadius: 5, backgroundColor: c.primary, borderWidth: 1.5, borderColor: c.bg }}
        />
      ) : null}
    </Pressable>
  );
}

export function OutingDetailsSheet({
  visible,
  value,
  onClose,
  onSave,
}: {
  visible: boolean;
  value: OutingDetails;
  onClose: () => void;
  onSave: (v: OutingDetails) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(value.title);
  const [description, setDescription] = useState(value.description);
  // Κάθε άνοιγμα ξεκινά από τα αποθηκευμένα (το «κλείσιμο» = ακύρωση)
  useEffect(() => {
    if (visible) {
      setTitle(value.title);
      setDescription(value.description);
    }
  }, [visible, value.title, value.description]);

  return (
    <Sheet
      visible={visible}
      title={`✎ ${t('details.heading')}`}
      onClose={onClose}
      footer={
        <Button
          title={t('details.save')}
          onPress={() => {
            onSave({ title: title.trim(), description: description.trim() });
            onClose();
          }}
        />
      }
    >
      <Body style={{ fontWeight: '600', marginBottom: 6 }}>{t('details.title')}</Body>
      <Input value={title} onChangeText={setTitle} placeholder={t('details.titlePlaceholder')} maxLength={TITLE_MAX} autoFocus returnKeyType="next" />
      <Body muted style={{ textAlign: 'right', fontSize: 12, marginTop: 2 }}>{`${title.length}/${TITLE_MAX}`}</Body>
      <Body style={{ fontWeight: '600', marginTop: 10, marginBottom: 6 }}>{t('details.description')}</Body>
      <Input
        value={description}
        onChangeText={setDescription}
        placeholder={t('details.descriptionPlaceholder')}
        maxLength={DESCRIPTION_MAX}
        multiline
        textAlignVertical="top"
        style={{ minHeight: 110 }}
      />
      <Body muted style={{ textAlign: 'right', fontSize: 12, marginTop: 2 }}>{`${description.length}/${DESCRIPTION_MAX}`}</Body>
      <Body muted style={{ fontSize: 13, marginTop: 6 }}>{t('details.hint')}</Body>
    </Sheet>
  );
}
