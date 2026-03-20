import { VersionInfo } from '@/services/versionService';
import React from 'react';
import {
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    useColorScheme,
    View,
} from 'react-native';

interface UpdateModalProps {
  visible: boolean;
  versionInfo: VersionInfo;
  onUpdate: () => void;
  onLater?: () => void;
}

export default function UpdateModal({
  visible,
  versionInfo,
  onUpdate,
  onLater
}: UpdateModalProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  
  const { version, force_update, release_notes } = versionInfo;
  const isForceUpdate = force_update ?? false;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={isForceUpdate ? undefined : onLater}
    >
      <View style={styles.overlay}>
        <View style={[
          styles.modalContainer,
          isDark ? styles.modalDark : styles.modalLight
        ]}>
          <Text style={[styles.title, isDark && styles.textDark]}>
            Update Available
          </Text>
          
          <Text style={[styles.version, isDark && styles.textDark]}>
            Version {version}
          </Text>

          <ScrollView style={styles.notesContainer}>
            <Text style={[styles.notes, isDark && styles.textDark]}>
              {release_notes}
            </Text>
            
            {isForceUpdate && (
              <Text style={[styles.forceUpdateNote, isDark && styles.textDark]}>
                {'\n'}⚠️ This update is required. You will need to login again after updating.
              </Text>
            )}
          </ScrollView>

          <View style={styles.buttonContainer}>
            {!isForceUpdate && onLater && (
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.laterButton,
                  isDark && styles.laterButtonDark
                ]}
                onPress={onLater}
              >
                <Text style={[styles.buttonText, styles.laterButtonText]}>
                  Later
                </Text>
              </TouchableOpacity>
            )}
            
            <TouchableOpacity
              style={[
                styles.button,
                styles.updateButton,
                !isForceUpdate && styles.updateButtonHalf
              ]}
              onPress={onUpdate}
            >
              <Text style={[styles.buttonText, styles.updateButtonText]}>
                Update Now
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 5,
  },
  modalLight: {
    backgroundColor: '#FFFFFF',
  },
  modalDark: {
    backgroundColor: '#1F2937',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center',
  },
  version: {
    fontSize: 16,
    marginBottom: 16,
    textAlign: 'center',
    opacity: 0.7,
  },
  notesContainer: {
    maxHeight: 200,
    marginBottom: 20,
  },
  notes: {
    fontSize: 14,
    lineHeight: 22,
  },
  forceUpdateNote: {
    fontSize: 14,
    lineHeight: 22,
    fontWeight: '600',
    color: '#EF4444',
  },
  textDark: {
    color: '#FFFFFF',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterButton: {
    flex: 1,
    backgroundColor: '#E5E7EB',
  },
  laterButtonDark: {
    backgroundColor: '#374151',
  },
  laterButtonText: {
    color: '#374151',
  },
  updateButton: {
    flex: 1,
    backgroundColor: '#3B82F6',
  },
  updateButtonHalf: {
    flex: 1,
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  updateButtonText: {
    color: '#FFFFFF',
  },
});
