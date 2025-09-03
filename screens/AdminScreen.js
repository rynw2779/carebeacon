import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TextInput, Button, Alert, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { auth, firestore } from '../firebaseConfig';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
let AutocompleteDropdown;
try {
  AutocompleteDropdown = require('react-native-autocomplete-dropdown').AutocompleteDropdown;
} catch (e) {
  console.error('AutocompleteDropdown import failed:', e.message, e.stack);
  AutocompleteDropdown = null; // Fallback to TextInput if import fails
}

const formatUserDisplay = (user) => {
  const lastName = user.lastName || '';
  const firstName = user.firstName || '';
  const role = user.role || 'unassigned';
  return `${lastName}, ${firstName}; ${role}`;
};

export default function AdminScreen({ navigation }) {
  const [users, setUsers] = useState([]);
  const [filteredUsers, setFilteredUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [poaSearchQuery, setPoaSearchQuery] = useState('');
  const [filteredPoaUsers, setFilteredPoaUsers] = useState([]);
  const [selectedPoa, setSelectedPoa] = useState(null);
  const [currentPoa, setCurrentPoa] = useState(null);
  const roleOptions = [
    'unassigned', 'administrator', 'nurse', 'aide', 'MSW', 'chaplain', 'patient', 'POA',
  ];

  useEffect(() => {
    const fetchUsers = async () => {
      const user = auth.currentUser;
      if (!user) {
        Alert.alert('Error', 'No user logged in');
        return;
      }
      try {
        const querySnapshot = await getDocs(collection(firestore, 'users'));
        let userList = querySnapshot.docs.map(doc => ({
          id: doc.id,
          title: formatUserDisplay(doc.data()), // For dropdown
          ...doc.data(),
        }));
        // Sort alphabetically by lastName (case-insensitive)
        userList.sort((a, b) => 
          (a.lastName || '').toLowerCase().localeCompare((b.lastName || '').toLowerCase())
        );
        setUsers(userList);
        setFilteredUsers(userList);
      } catch (error) {
        Alert.alert('Error', 'Failed to fetch users: ' + error.message);
      }
    };
    fetchUsers();
  }, []);

  useEffect(() => {
    if (selectedUser && selectedUser.role === 'patient') {
      const poaUser = users.find(u => u.id === selectedUser.poa);
      setCurrentPoa(poaUser || null);
    } else {
      setCurrentPoa(null);
    }
    setSelectedPoa(null);
  }, [selectedUser, users]);

  const handleSearch = (text) => {
    setSearchQuery(text);
    const filtered = users.filter(user =>
      user.email.toLowerCase().includes(text.toLowerCase())
    );
    setFilteredUsers(filtered);
  };

  const handlePoaSearch = (text) => {
    setPoaSearchQuery(text);
    const poaUsers = users.filter(u => u.role === 'POA' && u.id !== (selectedUser ? selectedUser.id : ''));
    const filtered = poaUsers.filter(user =>
      user.email.toLowerCase().includes(text.toLowerCase())
    );
    setFilteredPoaUsers(filtered);
  };

  const handleAssignRole = async (newRole) => {
    if (!selectedUser) return;
    try {
      const userRef = doc(firestore, 'users', selectedUser.id);
      await updateDoc(userRef, { role: newRole });
      Alert.alert('Success', `Role updated to ${newRole} for ${selectedUser.email}`);
      // Refresh users
      const querySnapshot = await getDocs(collection(firestore, 'users'));
      let userList = querySnapshot.docs.map(doc => ({
        id: doc.id,
        title: formatUserDisplay(doc.data()),
        ...doc.data(),
      }));
      // Sort again after refresh
      userList.sort((a, b) => 
        (a.lastName || '').toLowerCase().localeCompare((b.lastName || '').toLowerCase())
      );
      setUsers(userList);
      setFilteredUsers(userList);
      // Update selectedUser with new data
      const updatedSelectedUser = userList.find(u => u.id === selectedUser.id);
      setSelectedUser(updatedSelectedUser);
      // Do not clear selection to allow POA linking if patient
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const handleLinkPoa = async (poaId) => {
    if (!selectedUser || selectedUser.role !== 'patient') return;
    try {
      const patientRef = doc(firestore, 'users', selectedUser.id);
      await updateDoc(patientRef, { poa: poaId });
      const poaRef = doc(firestore, 'users', poaId);
      await updateDoc(poaRef, { patient: selectedUser.id });
      Alert.alert('Success', 'POA linked successfully!');
      // Refresh currentPoa
      const poaDoc = await getDoc(poaRef);
      if (poaDoc.exists()) {
        setCurrentPoa(poaDoc.data());
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const handleUnlinkPoa = async () => {
    if (!selectedUser || !currentPoa) return;
    try {
      const patientRef = doc(firestore, 'users', selectedUser.id);
      await updateDoc(patientRef, { poa: null });
      const poaRef = doc(firestore, 'users', currentPoa.id);
      await updateDoc(poaRef, { patient: null });
      Alert.alert('Success', 'POA unlinked successfully!');
      setCurrentPoa(null);
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const handleSelectUser = (item) => {
    if (item) {
      setSelectedUser(item);
      setSearchQuery('');
      setFilteredUsers(users); // Reset filtered list
    }
  };

  return (
    <LinearGradient colors={['#87CEEB', '#4682B4']} style={{ flex: 1 }}>
      <View style={styles.container}>
        <Text style={styles.title}>Admin Panel</Text>
        {AutocompleteDropdown ? (
          <View>
            <AutocompleteDropdown
              clearOnFocus={false}
              closeOnBlur={true}
              closeOnSubmit={false}
              direction="down" // Added for Android fix
              suggestionsListContainerStyle={{ maxHeight: 200 }} // Added for scrollable list on Android
              dataSet={filteredUsers}
              onChangeText={handleSearch}
              onSelectItem={handleSelectUser}
              useFilter={false} // Disable built-in filter since we handle it manually
              textInputProps={{ placeholder: 'Search user by email...', placeholderTextColor: 'lightgray' }}
              containerStyle={styles.dropdownContainer}
            />
            {selectedUser && (
              <View style={styles.poaSection}>
                <Text style={{ color: 'white' }}>Selected: {formatUserDisplay(selectedUser)}</Text>
                <Text style={styles.sectionTitle}>Assign Role</Text>
                <ScrollView horizontal contentContainerStyle={styles.roleButtons}>
                  {roleOptions.map((role) => (
                    <Button
                      key={role}
                      title={role}
                      onPress={() => handleAssignRole(role)}
                      color={selectedUser.role === role ? '#4682B4' : '#4682B4'} // Highlight current role
                      style={styles.roleButton}
                    />
                  ))}
                </ScrollView>
                {selectedUser.role === 'patient' && (
                  <View style={styles.poaSection}>
                    <Text style={styles.sectionTitle}>Link POA</Text>
                    {currentPoa ? (
                      <Text style={{ color: 'white' }}>Current POA: {formatUserDisplay(currentPoa)}</Text>
                    ) : (
                      <Text style={{ color: 'white' }}>No POA linked yet.</Text>
                    )}
                    <AutocompleteDropdown
                      clearOnFocus={false}
                      closeOnBlur={true}
                      closeOnSubmit={false}
                      direction="down"
                      suggestionsListContainerStyle={{ maxHeight: 200 }}
                      dataSet={filteredPoaUsers}
                      onChangeText={handlePoaSearch}
                      onSelectItem={(item) => setSelectedPoa(item)}
                      useFilter={false}
                      textInputProps={{ placeholder: 'Select a POA user...', placeholderTextColor: 'lightgray' }}
                      containerStyle={styles.dropdownContainer}
                    />
                    {selectedPoa && (
                      <Button
                        title="Link Selected POA"
                        onPress={() => handleLinkPoa(selectedPoa.id)}
                        color="#4682B4"
                      />
                    )}
                    {currentPoa && (
                      <Button
                        title="Unlink Current POA"
                        onPress={handleUnlinkPoa}
                        color="#4682B4"
                      />
                    )}
                  </View>
                )}
                <Button
                  title="Clear Selection"
                  onPress={() => setSelectedUser(null)}
                  color="#4682B4"
                />
              </View>
            )}
            {!selectedUser && (
              <Text style={{ color: 'white' }}>Select a user above to assign a role.</Text>
            )}
          </View>
        ) : (
          <FlatList
            data={filteredUsers}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View style={styles.userItem}>
                <Text style={{ color: 'white' }}>{formatUserDisplay(item)}</Text>
                <ScrollView horizontal contentContainerStyle={styles.roleButtons}>
                  {roleOptions.map((role) => (
                    <Button
                      key={role}
                      title={role}
                      onPress={() => {
                        setSelectedUser(item);
                        handleAssignRole(role);
                      }}
                      color={item.role === role ? '#4682B4' : '#4682B4'} // Highlight current role
                      style={styles.roleButton}
                    />
                  ))}
                </ScrollView>
                {item.role === 'patient' && (
                  <View style={styles.poaSection}>
                    <Text style={styles.sectionTitle}>Link POA for {formatUserDisplay(item)}</Text>
                    {currentPoa && item.id === selectedUser?.id ? (
                      <Text style={{ color: 'white' }}>Current POA: {formatUserDisplay(currentPoa)}</Text>
                    ) : (
                      <Text style={{ color: 'white' }}>No POA linked yet.</Text>
                    )}
                    <TextInput
                      style={styles.searchInput}
                      placeholder="Search POA by email..."
                      placeholderTextColor="lightgray"
                      value={poaSearchQuery}
                      onChangeText={handlePoaSearch}
                    />
                    <FlatList
                      data={filteredPoaUsers}
                      keyExtractor={(poaItem) => poaItem.id}
                      renderItem={({ item: poaItem }) => (
                        <View style={styles.poaItem}>
                          <Text style={{ color: 'white' }}>{formatUserDisplay(poaItem)}</Text>
                          <Button
                            title="Link"
                            onPress={() => handleLinkPoa(poaItem.id)}
                            color="#4682B4"
                          />
                        </View>
                      )}
                    />
                    {currentPoa && item.id === selectedUser?.id && (
                      <Button
                        title="Unlink Current POA"
                        onPress={handleUnlinkPoa}
                        color="#4682B4"
                      />
                    )}
                  </View>
                )}
              </View>
            )}
          />
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent', padding: 10 },
  title: { fontSize: 28, fontWeight: 'bold', color: 'white', textAlign: 'center', marginVertical: 15 },
  searchInput: { borderWidth: 1, borderColor: 'white', padding: 10, marginBottom: 10, borderRadius: 5, color: 'white', backgroundColor: 'transparent' },
  userItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: 'white', marginBottom: 10, backgroundColor: 'transparent' },
  roleButtons: { flexDirection: 'row', justifyContent: 'center' },
  roleButton: { marginHorizontal: 5 },
  dropdownContainer: { marginBottom: 20 },
  poaSection: { marginTop: 20, padding: 10, borderWidth: 1, borderColor: 'white', borderRadius: 5, backgroundColor: 'transparent' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: 'white' },
  poaItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 5 },
});