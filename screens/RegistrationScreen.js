import React, { useState } from 'react';
import { View, Text, TextInput, Button, Alert, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { auth, firestore } from '../firebaseConfig';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import { ref, set } from 'firebase/database';
import { db } from '../firebaseConfig'; // Ensure db is imported for RTDB

export default function RegistrationScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const validatePassword = (pwd) => {
    // HIPAA-aligned: At least 12 characters, uppercase, lowercase, number, special char
    const minLength = 12;
    const hasUpper = /[A-Z]/.test(pwd);
    const hasLower = /[a-z]/.test(pwd);
    const hasNumber = /\d/.test(pwd);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(pwd);

    if (pwd.length < minLength) {
      return `Password must be at least ${minLength} characters long.`;
    }
    if (!hasUpper) return 'Password must include at least one uppercase letter.';
    if (!hasLower) return 'Password must include at least one lowercase letter.';
    if (!hasNumber) return 'Password must include at least one number.';
    if (!hasSpecial) return 'Password must include at least one special character.';
    return null;
  };

  const handleRegistration = async () => {
    if (password !== confirmPassword) {
      Alert.alert('Error', 'Passwords do not match.');
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      Alert.alert('Invalid Password', passwordError);
      return;
    }

    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        alert('Permission to send notifications was denied');
        return;
      }
      const tokenResponse = await Notifications.getExpoPushTokenAsync({
        experienceId: '@yourusername/carebeacon', // Replace with your Expo username and slug
      });
      const token = tokenResponse.data;
      console.log('Registration push token:', token);
      if (!token) {
        Alert.alert('Error', 'Failed to get push token');
        return;
      }
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      await setDoc(doc(firestore, 'users', user.uid), {
        email: email,
        role: 'unassigned',
        pushToken: token,
      });
      // Sync role to RTDB for security rules
      await set(ref(db, `users/${user.uid}/role`), 'unassigned');
      Alert.alert('Success', 'Account created! Please complete your profile.');
      navigation.navigate('ProfileSetup');
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  return (
    <LinearGradient colors={['#87CEEB', '#4682B4']} style={{ flex: 1 }}>
      <View style={styles.container}>
        <Text style={styles.title}>Register</Text>
        <TextInput
          placeholder="Email"
          placeholderTextColor="lightgray"
          value={email}
          onChangeText={setEmail}
          style={styles.input}
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <TextInput
          placeholder="Password"
          placeholderTextColor="lightgray"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={styles.input}
        />
        <TextInput
          placeholder="Confirm Password"
          placeholderTextColor="lightgray"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
          style={styles.input}
        />
        <Text style={styles.passwordRequirements}>
          Password must be at least 12 characters, include uppercase, lowercase, number, and special character.
        </Text>
        <Button title="Register" onPress={handleRegistration} color="#4682B4" />
        <Button title="Already have an account? Login" onPress={() => navigation.navigate('Login')} color="#4682B4" />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent', padding: 10, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: 'bold', color: 'white', textAlign: 'center', marginVertical: 15 },
  input: { borderWidth: 1, borderColor: 'white', padding: 10, marginVertical: 10, borderRadius: 5, color: 'white', backgroundColor: 'transparent' },
  passwordRequirements: { color: 'lightgray', fontSize: 12, textAlign: 'center', marginBottom: 10 },
});