import React from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';

export default function OnboardingScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to CareBeacon</Text>
      <Text style={styles.subtitle}>Guiding Care to Your Door</Text>
      <Button title="Get Started" onPress={() => navigation.navigate('Login')} color="#A7C7E7" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F0F0', padding: 10, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: '#A7C7E7', marginBottom: 20 },
  subtitle: { fontSize: 18, color: '#A7C7E7', marginBottom: 30 },
});