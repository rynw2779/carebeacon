import React, { useState, useEffect } from 'react';
import { View, Text, Button, Alert, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { auth, firestore } from '../firebaseConfig';
import { collection, getDocs, doc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
let AutocompleteDropdown;
try {
  AutocompleteDropdown = require('react-native-autocomplete-dropdown').AutocompleteDropdown;
} catch (e) {
  console.error('AutocompleteDropdown import failed:', e.message, e.stack);
  AutocompleteDropdown = null; // Fallback to list if import fails
}

const formatUserDisplay = (user) => {
  const lastName = user.lastName || '';
  const firstName = user.firstName || '';
  const role = user.role || 'unassigned';
  return `${lastName}, ${firstName}; ${role}`;
};

export default function AssignmentScreen({ navigation }) {
  const [patients, setPatients] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [selectedPatient, setSelectedPatient] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      const user = auth.currentUser;
      if (user) {
        console.log('Fetching user data for UID:', user.uid);
        const userDoc = await getDoc(doc(firestore, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          console.log('Current user data:', userData);
          setCurrentUser(userData);
          if (userData.role !== 'patient' && userData.role !== 'POA') {
            console.log('Fetching all users from Firestore');
            const querySnapshot = await getDocs(collection(firestore, 'users'));
            const allUsers = querySnapshot.docs.map(doc => ({
              id: doc.id,
              title: formatUserDisplay(doc.data()), // For dropdown
              ...doc.data(),
            }));
            console.log('All users fetched:', allUsers);
            let patientList = allUsers.filter(user => user.role === 'patient' || user.role === 'POA');
            // Sort alphabetically by lastName (case-insensitive)
            patientList.sort((a, b) => 
              (a.lastName || '').toLowerCase().localeCompare((b.lastName || '').toLowerCase())
            );
            console.log('Filtered patients:', patientList);
            setPatients(patientList);
          } else {
            Alert.alert('Error', 'Only staff can assign.');
          }
        } else {
          console.log('User profile not found for UID:', user.uid);
          Alert.alert('Error', 'User profile not found.');
        }
      } else {
        console.log('No user logged in');
        Alert.alert('Error', 'No user logged in.');
      }
    };
    fetchData();
  }, []);

  const handleAssign = async (patientId) => {
    try {
      const user = auth.currentUser;
      const patientRef = doc(firestore, 'users', patientId);
      const patientDoc = await getDoc(patientRef);
      console.log('Patient data before assignment:', patientDoc.data()); // Log old patient data for debugging
      if (patientDoc.data().assignedStaff && patientDoc.data().assignedStaff.includes(user.uid)) {
        Alert.alert('Info', 'You are already assigned to this patient.');
        return;
      }
      // Update patient assignedStaff
      console.log('Attempting to update patient assignedStaff with arrayUnion:', user.uid);
      try {
        await updateDoc(patientRef, {
          assignedStaff: arrayUnion(user.uid)
        });
        console.log('Patient assignedStaff updated successfully');
      } catch (patientError) {
        console.error('Error updating patient assignedStaff:', patientError.message);
        throw patientError; // Rethrow to catch in outer try
      }
      // Update staff assignedPatients
      const staffRef = doc(firestore, 'users', user.uid);
      console.log('Attempting to update staff assignedPatients with arrayUnion:', patientId);
      try {
        await updateDoc(staffRef, {
          assignedPatients: arrayUnion(patientId)
        });
        console.log('Staff assignedPatients updated successfully');
      } catch (staffError) {
        console.error('Error updating staff assignedPatients:', staffError.message);
        throw staffError;
      }
      // Update POA if exists
      const poaId = patientDoc.data().poa;
      if (poaId) {
        const poaRef = doc(firestore, 'users', poaId);
        console.log('POA exists, attempting to update POA assignedStaff with arrayUnion:', user.uid);
        try {
          await updateDoc(poaRef, {
            assignedStaff: arrayUnion(user.uid)
          });
          console.log('POA assignedStaff updated successfully');
        } catch (poaError) {
          console.error('Error updating POA assignedStaff:', poaError.message);
          throw poaError;
        }
      } else {
        console.log('No POA linked to this patient, skipping POA update');
      }
      Alert.alert('Success', 'Assigned to patient!');
    } catch (error) {
      Alert.alert('Error', error.message);
      console.log('Assignment error:', error.message);
    }
  };

  return (
    <LinearGradient colors={['#87CEEB', '#4682B4']} style={{ flex: 1 }}>
      <View style={styles.container}>
        <Text style={styles.title}>Assign to Patients</Text>
        {patients.length === 0 ? (
          <Text style={{ color: 'white' }}>No patients or POA users found.</Text>
        ) : (
          <>
            {AutocompleteDropdown ? (
              <AutocompleteDropdown
                clearOnFocus={false}
                closeOnBlur={true}
                closeOnSubmit={false}
                direction="down" // Added for Android fix
                suggestionsListContainerStyle={{ maxHeight: 200 }} // Added for scrollable list on Android
                dataSet={patients}
                onSelectItem={(item) => { if (item) handleAssign(item.id); }} // Fixed: Check if item is not null
                useFilter={true}
                textInputProps={{ placeholder: 'Select a patient/POA to assign...', placeholderTextColor: 'lightgray' }}
                containerStyle={styles.dropdownContainer}
              />
            ) : (
              patients.map((patient) => (
                <View key={patient.id} style={styles.patientItem}>
                  <Text style={{ color: 'white' }}>{formatUserDisplay(patient)}</Text>
                  <Button title="Assign Self" onPress={() => handleAssign(patient.id)} color="#4682B4" />
                </View>
              ))
            )}
          </>
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent', padding: 10 },
  title: { fontSize: 28, fontWeight: 'bold', color: 'white', textAlign: 'center', marginVertical: 15 },
  patientItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: 'white' },
  dropdownContainer: { marginBottom: 20 },
});