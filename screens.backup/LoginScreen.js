import React, { useState, useEffect } from 'react';
import { VStack, Heading, Input, Button, Box } from 'native-base';
import { Alert, Animated } from 'react-native';
import { auth } from '../firebaseConfig';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { MaterialIcons } from '@expo/vector-icons';
import { getTheme, useThemeStyles } from '../theme';

export default function LoginScreen({ navigation }) {
  const theme = getTheme();
  const styles = useThemeStyles();
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

  const handleLogin = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      navigation.navigate('Dashboard');
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  return (
    <Box flex={1} safeArea theme={theme} {...styles.container}>
      <Animated.View style={{ opacity: fadeAnim }}>
        <VStack space={5} alignItems="center">
          <Heading {...styles.title}>Login</Heading>
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
            onPress={handleLogin}
            leftIcon={<MaterialIcons name="login" size={24} color="white" />}
            {...styles.button}
          >
            Login
          </Button>
          <Button
            variant="link"
            onPress={() => navigation.navigate('Registration')}
            _text={{ color: 'primary.500', fontSize: 'md' }}
          >
            Register
          </Button>
        </VStack>
      </Animated.View>
    </Box>
  );
}