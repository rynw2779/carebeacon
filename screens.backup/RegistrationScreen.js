import React, { useState, useEffect } from 'react';
import { VStack, Heading, Input, Button, Box } from 'native-base';
import { Alert, Animated } from 'react-native';
import { auth, firestore } from '../firebaseConfig';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import * as Notifications from 'expo-notifications';
import { MaterialIcons } from '@expo/vector-icons';
import { getTheme, useThemeStyles } from '../theme';

export default function RegistrationScreen({ navigation }) {
  const theme = getTheme();
  const styles = useThemeStyles('unassigned');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const fadeAnim = useState(new Animated.Value(0))[0];

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  const handleRegistration = async () => {
    try {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Notifications permission is required.');
        return;
      }
      const tokenResponse = await Notifications.getExpoPushTokenAsync({
        experienceId: '@yourusername/carebeacon',
      });
      const token = tokenResponse.data;
      if (!token) {
        Alert.alert('Error', 'Failed to get push token');
        return;
      }
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      await setDoc(doc(firestore, 'users', user.uid), {
        email,
        role: 'unassigned',
        pushToken: token,
      });
      Alert.alert('Success', 'Account created! Complete your profile.');
      navigation.navigate('ProfileSetup');
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  return (
    <Box flex={1} safeArea theme={theme} {...styles.container}>
      <Animated.View style={{ opacity: fadeAnim }}>
        <VStack space={5} alignItems="center">
          <Heading {...styles.title}>Register</Heading>
          <Input
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            leftElement={<MaterialIcons name="email" size={24} color="muted.500" mx={3} />}
            {...styles.input}
          />
          <Input
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            leftElement={<MaterialIcons name="lock" size={24} color="muted.500" mx={3} />}
            {...styles.input}
          />
          <Button
            onPress={handleRegistration}
            leftIcon={<MaterialIcons name="person-add" size={24} color="white" />}
            {...styles.button}
          >
            Register
          </Button>
          <Button
            variant="ghost"
            onPress={() => navigation.navigate('Login')}
            _text={{ color: 'primary.500', fontSize: 'md' }}
          >
            Already have an account? Login
          </Button>
        </VStack>
      </Animated.View>
    </Box>
  );
}