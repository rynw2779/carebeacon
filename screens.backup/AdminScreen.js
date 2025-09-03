import React, { useState, useEffect } from 'react';
import { VStack, Heading, Input, Button, Text, Card, FlatList, ScrollView } from 'native-base';
import { Alert, Animated } from 'react-native';
import { auth, firestore } from '../firebaseConfig';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { MaterialIcons } from '@expo/vector-icons';
import { getTheme, useThemeStyles } from '../theme';
let AutocompleteDropdown;
try {
  AutocompleteDropdown = require('react-native-autocomplete-dropdown').AutocompleteDropdown;
} catch (e) {
  AutocompleteDropdown = null;
}

const formatUserDisplay = (user) => `${user.lastName || ''}, ${user.firstName || ''}; ${user.role || 'unassigned'}`;

export default function AdminScreen({ navigation }) {
  const theme = getTheme();
  const styles = useThemeStyles('administrator');
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const roleOptions = ['unassigned', 'administrator', 'nurse', 'aide', 'MSW', 'chaplain', 'patient', 'POA'];
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
      if (!user) {
        Alert.alert('Error', 'No user logged in');
        return;
      }
      const querySnapshot = await getDocs(collection(firestore, 'users'));
      let userList = querySnapshot.docs.map(doc => ({
        id: doc.id,
        title: formatUserDisplay(doc.data()),
        ...doc.data(),
      }));
      userList.sort((a, b) => (a.lastName || '').toLowerCase().localeCompare((b.lastName || '').toLowerCase()));
      setUsers(userList);
      setFilteredUsers(userList);
    };
    fetchUsers();
  }, []);

  const handleSearch = (text) => {
    setSearchQuery(text);
    const filtered = users.filter(user => user.email.toLowerCase().includes(text.toLowerCase()));
    setFilteredUsers(filtered);
  };

  const handleAssignRole = async (userItem, newRole) => {
    try {
      const userRef = doc(firestore, 'users', userItem.id);
      await updateDoc(userRef, { role: newRole });
      Alert.alert('Success', `Role updated to ${newRole}`);
      // Refresh list
      const querySnapshot = await getDocs(collection(firestore, 'users'));
      let userList = querySnapshot.docs.map(doc => ({
        id: doc.id,
        title: formatUserDisplay(doc.data()),
        ...doc.data(),
      }));
      userList.sort((a, b) => (a.lastName || '').toLowerCase().localeCompare((b.lastName || '').toLowerCase()));
      setUsers(userList);
      setFilteredUsers(userList);
      setSelectedUser(null);
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const renderUserItem = ({ item }) => (
    <Card {...styles.card}>
      <Text fontSize="lg">{item.title}</Text>
      <ScrollView horizontal mt={2}>
        {roleOptions.map((role) => (
          <Button
            key={role}
            m={1}
            colorScheme={item.role === role ? 'accent' : 'primary'}
            onPress={() => handleAssignRole(item, role)}
            size="sm"
          >
            {role}
          </Button>
        ))}
      </ScrollView>
    </Card>
  );

  return (
    <Box flex={1} safeArea theme={theme} {...styles.container}>
      <Heading {...styles.title}>Admin Panel</Heading>
      <Animated.View style={{ opacity: fadeAnim }}>
        <Input
          placeholder="Search users by email..."
          value={searchQuery}
          onChangeText={handleSearch}
          leftElement={<MaterialIcons name="search" size={24} color="muted.500" mx={3} />}
          mb={4}
        />
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
        />
      </Animated.View>
    </Box>
  );
}