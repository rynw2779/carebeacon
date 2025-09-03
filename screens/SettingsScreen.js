import React, { useState, useEffect } from 'react';
import { View, Text, Switch, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { auth, firestore } from '../firebaseConfig';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';

export default function SettingsScreen() {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [chatNotificationsEnabled, setChatNotificationsEnabled] = useState(true);
  const [selectedSound, setSelectedSound] = useState('default');
  const [isLoading, setIsLoading] = useState(true);

  // Sample sounds - placeholders for now; no playback since we're using defaults
  const sounds = [
    { id: 'default', name: 'Default' },
    { id: 'chime', name: 'Chime' },
    { id: 'bell', name: 'Bell' },
    { id: 'alert', name: 'Alert' },
  ];

  useEffect(() => {
    const loadSettings = async () => {
      const user = auth.currentUser;
      if (user) {
        const userDoc = await getDoc(doc(firestore, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setNotificationsEnabled(data.notificationsEnabled ?? true);
          setChatNotificationsEnabled(data.chatNotificationsEnabled ?? true);
          setSelectedSound(data.notificationSound ?? 'default');
        }
      }
      setIsLoading(false);
    };
    loadSettings();
  }, []);

  const saveSettings = async (updates) => {
    const user = auth.currentUser;
    if (user) {
      await updateDoc(doc(firestore, 'users', user.uid), updates);
    }
  };

  const toggleNotifications = async (value) => {
    setNotificationsEnabled(value);
    await saveSettings({ notificationsEnabled: value });
    if (!value) {
      // Optionally, cancel all scheduled notifications
      await Notifications.cancelAllScheduledNotificationsAsync();
    }
  };

  const toggleChatNotifications = async (value) => {
    setChatNotificationsEnabled(value);
    await saveSettings({ chatNotificationsEnabled: value });
  };

  const selectSound = async (soundId) => {
    setSelectedSound(soundId);
    await saveSettings({ notificationSound: soundId });
    // No preview playback for now (defaults only)
  };

  const renderSoundItem = ({ item }) => (
    <TouchableOpacity
      style={styles.soundItem}
      onPress={() => selectSound(item.id)}
    >
      <Text>{item.name}</Text>
      {selectedSound === item.id && <Text> (Selected)</Text>}
    </TouchableOpacity>
  );

  if (isLoading) {
    return <Text style={{ color: 'white' }}>Loading...</Text>;
  }

  return (
    <LinearGradient colors={['#87CEEB', '#4682B4']} style={{ flex: 1 }}>
      <View style={styles.container}>
        <Text style={styles.title}>Settings</Text>
        <View style={styles.section}>
          <Text style={{ color: 'white' }}>Enable Notifications</Text>
          <Switch value={notificationsEnabled} onValueChange={toggleNotifications} />
        </View>
        <View style={styles.section}>
          <Text style={{ color: 'white' }}>Enable Chat Notifications</Text>
          <Switch value={chatNotificationsEnabled} onValueChange={toggleChatNotifications} />
        </View>
        <View style={styles.section}>
          <Text style={{ color: 'white' }}>Notification Sound</Text>
          <FlatList
            data={sounds}
            keyExtractor={(item) => item.id}
            renderItem={renderSoundItem}
          />
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: 'transparent' },
  title: { fontSize: 28, fontWeight: 'bold', color: 'white', textAlign: 'center', marginVertical: 15 },
  section: { marginVertical: 20 },
  soundItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#A7C7E7' },
});