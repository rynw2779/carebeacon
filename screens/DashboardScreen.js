import React, { useContext } from 'react';
import { Box, VStack, Icon, Text, NativeBaseProvider, Pressable } from 'native-base';
import { FlatList, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { AppContext } from '../AppContext';
import { getTheme } from '../theme';

export default function DashboardScreen() {
  const navigation = useNavigation();
  const { isAdmin } = useContext(AppContext);
  const theme = getTheme();

  const tiles = [
    { name: 'Map', icon: 'map', screen: 'Map' },
    { name: 'Schedule', icon: 'calendar-today', screen: 'Schedule' },
    { name: 'Chat', icon: 'chat', screen: 'Chat' },
    { name: 'Profile', icon: 'person', screen: 'Profile' },
    ...(isAdmin ? [{ name: 'Admin', icon: 'admin-panel-settings', screen: 'Admin', color: 'accent.500' }] : []),
    { name: 'Assign Users', icon: 'assignment', screen: 'Assignment', color: 'accent.500' },
  ];

  const renderTile = ({ item }) => (
    <Pressable onPress={() => navigation.navigate(item.screen)} _pressed={{ opacity: 0.5 }}>
      <Box bg="white" rounded="md" shadow={3} p={8} alignItems="center" aspectRatio={1} margin={2} minHeight={150} minWidth="45%" flex={1}>
        <Icon as={MaterialIcons} name={item.icon} size="3xl" color={item.color || "primary.500"} />
        <Text mt={2} fontSize="lg" fontWeight="bold" color={item.color || "primary.500"} textAlign="center">{item.name.replace(' ', '\n')}</Text>
      </Box>
    </Pressable>
  );

  return (
    <NativeBaseProvider theme={theme}>
      <LinearGradient colors={['#87CEEB', '#4682B4']} style={{ flex: 1 }}>
        <Box safeArea flex={1} bg="transparent" p={2}>
          <VStack space={0} alignItems="center" flex={1}>
            <Image source={require('../assets/carebeacon-logo-no-pedestal.png')} style={{ width: 140, height: 140, resizeMode: 'contain' }} />
            <Text color="white" fontSize="md" fontWeight="bold">Your Hospice Care Hub</Text>
            <FlatList
              flex={1}
              data={tiles}
              renderItem={renderTile}
              keyExtractor={(item) => item.name}
              numColumns={2}
              contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 10 }}
              columnWrapperStyle={{ justifyContent: 'space-evenly' }}
              showsVerticalScrollIndicator={false}
            />
          </VStack>
        </Box>
      </LinearGradient>
    </NativeBaseProvider>
  );
}