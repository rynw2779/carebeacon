import React, { useState, useEffect } from 'react';
import { VStack, Heading, Input, Button, Text, Card, FlatList, HStack } from 'native-base';
import { Animated } from 'react-native';
import { auth, db, firestore } from '../firebaseConfig';
import { ref, onValue, push, set } from 'firebase/database';
import { collection, getDocs, getDoc, doc } from 'firebase/firestore';
import { MaterialIcons } from '@expo/vector-icons';
import { getTheme, useThemeStyles } from '../theme';
let AutocompleteDropdown;
try {
  AutocompleteDropdown = require('react-native-autocomplete-dropdown').AutocompleteDropdown;
} catch (e) {
  AutocompleteDropdown = null;
}

const formatUserDisplay = (user) => `${user.lastName || ''}, ${user.firstName || ''}; ${user.role || 'unassigned'}`;

export default function ChatScreen({ navigation }) {
  const theme = getTheme();
  const styles = useThemeStyles('patient'); // Adjust by role
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [recipient, setRecipient] = useState(null);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [currentUserRole, setCurrentUserRole] = useState('');
  const fadeAnim = useState(new Animated.Value(0))[0];

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    const fetchUsers = async () => {
      const user = auth.currentUser;
      if (user) {
        const userDoc = await getDoc(doc(firestore, 'users', user.uid));
        if (userDoc.exists()) {
          const role = userDoc.data().role;
          setCurrentUserRole(role);
          const querySnapshot = await getDocs(collection(firestore, 'users'));
          let userList = querySnapshot.docs.map(doc => ({
            id: doc.id,
            title: formatUserDisplay(doc.data()),
            ...doc.data(),
          }));
          if (role === 'patient') {
            userList = userList.filter(u => u.assignedStaff?.includes(user.uid) || u.id === userDoc.data().poa);
          } else if (role === 'POA') {
            userList = userList.filter(u => u.assignedStaff?.includes(user.uid) || u.assignedPatients?.includes(user.uid));
          }
          userList.sort((a, b) => (a.lastName || '').toLowerCase().localeCompare((b.lastName || '').toLowerCase()));
          setAvailableUsers(userList);
        }
      }
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    if (recipient) {
      const user = auth.currentUser;
      const chatRef = ref(db, `chats/${user.uid}_${recipient.id}`);
      onValue(chatRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          setMessages(Object.values(data));
        }
      });
    }
  }, [recipient]);

  const sendMessage = async () => {
    const user = auth.currentUser;
    if (user && newMessage && recipient) {
      const chatRef = ref(db, `chats/${user.uid}_${recipient.id}`);
      const newMessageRef = push(chatRef);
      await set(newMessageRef, {
        text: newMessage,
        senderId: user.uid,
        timestamp: new Date().toISOString(),
      });
      setNewMessage('');
    }
  };

  const renderUserItem = ({ item }) => (
    <Card {...styles.card}>
      <Text fontSize="lg">{item.title}</Text>
      <Button mt={2} onPress={() => setRecipient(item)} {...styles.button}>
        Select
      </Button>
    </Card>
  );

  const renderMessage = ({ item }) => (
    <Card my={2} p={3} bg={item.senderId === auth.currentUser.uid ? 'primary.100' : 'card'} rounded="lg" shadow={1}>
      <Text>{item.text} (from: {item.senderId})</Text>
    </Card>
  );

  return (
    <Box flex={1} safeArea theme={theme} {...styles.container}>
      <Heading {...styles.title}>Chat</Heading>
      <Animated.View style={{ opacity: fadeAnim }}>
        <FlatList
          data={availableUsers}
          keyExtractor={(item) => item.id}
          renderItem={renderUserItem}
          ListHeaderComponent={
            <Input
              placeholder="Select user to chat..."
              mb={4}
              leftElement={<MaterialIcons name="search" size={24} color="muted.500" mx={3} />}
            />
          }
          flex={0.3}
        />
        <FlatList
          data={messages}
          keyExtractor={(item, index) => index.toString()}
          renderItem={renderMessage}
          flex={0.7}
        />
        <HStack space={3} alignItems="center">
          <Input flex={1} placeholder="Type message..." value={newMessage} onChangeText={setNewMessage} {...styles.input} />
          <Button onPress={sendMessage} square icon={<MaterialIcons name="send" size={24} color="white" />} />
        </HStack>
      </Animated.View>
    </Box>
  );
}