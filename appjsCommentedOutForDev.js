import React, { useEffect, useState, createContext } from 'react';
import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import * as Notifications from 'expo-notifications';
// import * as TaskManager from 'expo-task-manager'; // Temporarily commented out to allow testing in Expo Go (uncomment for dev client builds)
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { auth, firestore, db } from './firebaseConfig';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { ref, set, onDisconnect, onValue } from 'firebase/database';
import { AppContext } from './AppContext';
import OnboardingScreen from './screens/OnboardingScreen';
import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';
import MapScreen from './screens/MapScreen';
import ScheduleScreen from './screens/ScheduleScreen';
import ChatScreen from './screens/ChatScreen';
import ProfileScreen from './screens/ProfileScreen';
import RegistrationScreen from './screens/RegistrationScreen';
import ProfileSetupScreen from './screens/ProfileSetupScreen';
import { Button, Platform, View, Text, Image, StyleSheet, TouchableOpacity } from 'react-native';
import AdminScreen from './screens/AdminScreen';
import AssignmentScreen from './screens/AssignmentScreen';
import SettingsScreen from './screens/SettingsScreen';
import { MaterialIcons } from '@expo/vector-icons';
import { AutocompleteDropdownContextProvider } from 'react-native-autocomplete-dropdown';

const Stack = createStackNavigator();

// const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND-NOTIFICATION-TASK'; // Temporarily commented out

// TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, ({ data, error, executionInfo }) => { // Temporarily commented out
//   console.log('Received a notification in the background!');
//   // Process the notification data here if needed (e.g., update local state or trigger custom logic)
//   // For chat, this ensures the sound plays immediately without needing the app open
// });

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const navigationRef = createNavigationContainerRef();

const UserAvatar = ({ onPress }) => {
  const [userData, setUserData] = useState({ profilePhoto: null, firstName: '', lastName: '' });

  useEffect(() => {
    const fetchUserData = async () => {
      const user = auth.currentUser;
      if (user) {
        const userDoc = await getDoc(doc(firestore, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserData({
            profilePhoto: data.profilePhoto,
            firstName: data.firstName || '',
            lastName: data.lastName || '',
          });
        }
      }
    };
    fetchUserData();
  }, []);

  const getInitials = () => {
    const first = userData.firstName ? userData.firstName[0] : '';
    const last = userData.lastName ? userData.lastName[0] : '';
    return `${first}${last}`.toUpperCase() || '?';
  };

  return (
    <TouchableOpacity onPress={onPress} style={avatarStyles.container}>
      {userData.profilePhoto ? (
        <Image source={{ uri: userData.profilePhoto }} style={avatarStyles.photo} />
      ) : (
        <View style={avatarStyles.initialsCircle}>
          <Text style={avatarStyles.initialsText}>{getInitials()}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const avatarStyles = StyleSheet.create({
  container: { marginRight: 10 },
  photo: { width: 40, height: 40, borderRadius: 20 },
  initialsCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#A7C7E7', justifyContent: 'center', alignItems: 'center' },
  initialsText: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
});

export default function App() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  async function registerForPushNotificationsAsync() {
    let token;
    if (Platform.OS === 'android') {
      Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      alert('Failed to get push token for push notification!');
      return;
    }
    token = (await Notifications.getExpoPushTokenAsync()).data;
    return token;
  }

  useEffect(() => {
    (async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        alert('Permission to send notifications was denied');
      }
      // Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK); // Temporarily commented out to allow testing in Expo Go (uncomment for dev client builds)
    })();

    const unsubscribe = auth.onAuthStateChanged(async (u) => {
      setUser(u);
      if (u) {
        const userDoc = await getDoc(doc(firestore, 'users', u.uid));
        if (userDoc.exists()) {
          const role = userDoc.data().role;
          setIsAdmin(role === 'administrator');
          // Sync role to RTDB for rules
          await set(ref(db, `users/${u.uid}/role`), role);
          // Register push token if missing or changed
          const currentToken = userDoc.data().pushToken;
          const newToken = await registerForPushNotificationsAsync();
          if (newToken && newToken !== currentToken) {
            await updateDoc(doc(firestore, 'users', u.uid), { pushToken: newToken });
          }
          await updateDoc(doc(firestore, 'users', u.uid), { status: 'active' });
          const presenceRef = ref(db, `presence/${u.uid}`);
          await set(presenceRef, 'active');
          onDisconnect(presenceRef).set('offline');
          onValue(presenceRef, (snap) => {
            updateDoc(doc(firestore, 'users', u.uid), { status: snap.val() });
          });
        }
      } else {
        setIsAdmin(false);
      }
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      const data = response.notification.request.content.data;
      if (navigationRef.isReady()) {
        if (data.screen === 'Map') {
          navigationRef.navigate('Map');
        } else if (data.chatId) {
          navigationRef.navigate('Chat', { selectedChatId: data.chatId });
        } else if (data.screen === 'Chat') {
          navigationRef.navigate('Chat');
        }
      }
    });
    return () => subscription.remove();
  }, []);

  const userAvatar = ({ navigation }) => (
    <UserAvatar onPress={() => navigation.navigate('Profile')} />
  );

  return (
    <SafeAreaProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <AppContext.Provider value={{ isAdmin }}>
          <AutocompleteDropdownContextProvider>
            <NavigationContainer ref={navigationRef}>
              <Stack.Navigator initialRouteName="Onboarding">
                <Stack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false }} />
                <Stack.Screen name="Registration" component={RegistrationScreen} />
                <Stack.Screen name="Login" component={LoginScreen} />
                <Stack.Screen name="Dashboard" component={DashboardScreen} options={({ navigation }) => ({ headerRight: () => userAvatar({ navigation }) })} />
                <Stack.Screen name="Map" component={MapScreen} options={({ navigation }) => ({ headerRight: () => userAvatar({ navigation }) })} />
                <Stack.Screen name="Schedule" component={ScheduleScreen} options={({ navigation }) => ({ headerRight: () => userAvatar({ navigation }) })} />
                <Stack.Screen name="Chat" component={ChatScreen} options={({ navigation }) => ({ headerRight: () => userAvatar({ navigation }), presentation: 'modal' })} />
                <Stack.Screen name="Profile" component={ProfileScreen} options={({ navigation }) => ({ headerRight: () => <TouchableOpacity style={{ marginRight: 5 }} onPress={() => navigation.navigate('Settings')}><MaterialIcons name="settings" size={30} color="#333333" /></TouchableOpacity> })} />
                <Stack.Screen name="ProfileSetup" component={ProfileSetupScreen} />
                <Stack.Screen name="Admin" component={AdminScreen} options={({ navigation }) => ({ headerRight: () => userAvatar({ navigation }) })} />
                <Stack.Screen name="Assignment" component={AssignmentScreen} options={({ navigation }) => ({ headerRight: () => userAvatar({ navigation }) })} />
                <Stack.Screen name="Settings" component={SettingsScreen} />
              </Stack.Navigator>
            </NavigationContainer>
          </AutocompleteDropdownContextProvider>
        </AppContext.Provider>
      </GestureHandlerRootView>
    </SafeAreaProvider>
  );
}