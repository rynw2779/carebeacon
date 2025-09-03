import React, { useContext, useEffect, useState } from 'react';
import { VStack, Heading, Button, HStack, Box } from 'native-base';
import { useNavigation } from '@react-navigation/native';
import { AppContext } from '../AppContext';
import { MaterialIcons } from '@expo/vector-icons';
import { Animated } from 'react-native';
import { getTheme, useThemeStyles } from '../theme';

export default function DashboardScreen() {
  const navigation = useNavigation();
  const { isAdmin } = useContext(AppContext);
  const theme = getTheme();
  const styles = useThemeStyles('staff'); // Assume staff for demo; use actual role
  const fadeAnim = useState(new Animated.Value(0))[0];

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Box flex={1} safeArea theme={theme} {...styles.container}>
      <Heading {...styles.title}>Dashboard</Heading>
      <Animated.View style={{ opacity: fadeAnim }}>
        <VStack space={4}>
          <HStack space={4} justifyContent="center">
            <Button
              flex={1}
              onPress={() => navigation.navigate('Map')}
              leftIcon={<MaterialIcons name="map" size={24} color="white" />}
              {...styles.button}
            >
              Map
            </Button>
            <Button
              flex={1}
              onPress={() => navigation.navigate('Schedule')}
              leftIcon={<MaterialIcons name="calendar-today" size={24} color="white" />}
              {...styles.button}
            >
              Schedule
            </Button>
          </HStack>
          <HStack space={4} justifyContent="center">
            <Button
              flex={1}
              onPress={() => navigation.navigate('Chat')}
              leftIcon={<MaterialIcons name="chat" size={24} color="white" />}
              {...styles.button}
            >
              Chat
            </Button>
            <Button
              flex={1}
              onPress={() => navigation.navigate('Profile')}
              leftIcon={<MaterialIcons name="person" size={24} color="white" />}
              {...styles.button}
            >
              Profile
            </Button>
          </HStack>
          {isAdmin && (
            <Button
              onPress={() => navigation.navigate('Admin')}
              leftIcon={<MaterialIcons name="admin-panel-settings" size={24} color="white" />}
              colorScheme="accent"
              {...styles.button}
            >
              Admin
            </Button>
          )}
          <Button
            onPress={() => navigation.navigate('Assignment')}
            leftIcon={<MaterialIcons name="assignment" size={24} color="white" />}
            colorScheme="accent"
            {...styles.button}
          >
            Assign to Patients
          </Button>
        </VStack>
      </Animated.View>
    </Box>
  );
}