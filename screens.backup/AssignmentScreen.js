import React, { useState, useEffect } from 'react';
import { VStack, Heading, Input, Button, Text, Card, FlatList } from 'native-base';
import { Alert, Animated } from 'react-native';
import { auth, firestore } from '../firebaseConfig';
import { collection, getDocs, doc, updateDoc, arrayUnion, getDoc } from 'firebase/firestore';
import { MaterialIcons } from '@expo/vector-icons';
import { getTheme, useThemeStyles } from '../theme';
let AutocompleteDropdown;
try {
  AutocompleteDropdown = require('react-native-autocomplete-dropdown').AutocompleteDropdown;
} catch (e) {
  AutocompleteDropdown = null;
}

const formatUserDisplay = (user) => `${user.lastName || ''}, ${user.firstName || ''}; ${user.role || 'unassigned'}`;

export default function AssignmentScreen({ navigation }) {
  const theme = getTheme();
  const styles = useThemeStyles('staff');
  const [patients, setPatients] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const fadeAnim = useState(new Animated.Value(0))[0];

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      const user = auth.currentUser;
      if (user) {
        const userDoc = await getDoc(doc(firestore, 'users', user.uid));
        if (userDoc.exists()) {
          const userData = userDoc.data();
          setCurrentUser(userData);
          if (userData.role !== 'patient' && userData.role !== 'POA') {
            const querySnapshot = await getDocs(collection(firestore, 'users'));
            let patientList = querySnapshot.docs.map(doc => ({
              id: doc.id,
              title: formatUserDisplay(doc.data()),
              ...doc.data(),
            })).filter(user => user.role === 'patient' || user.role === 'POA');
            patientList.sort((a, b) => (a.lastName || '').toLowerCase().localeCompare((b.lastName || '').toLowerCase()));
            setPatients(patientList);
          } else {
            Alert.alert('Error', 'Only staff can assign.');
          }
        } else {
          Alert.alert('Error', 'User profile not found.');
        }
      } else {
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
      if (patientDoc.data().assignedStaff && patientDoc.data().assignedStaff.includes(user.uid)) {
        Alert.alert('Info', 'Already assigned.');
        return;
      }
      await updateDoc(patientRef, { assignedStaff: arrayUnion(user.uid) });
      const staffRef = doc(firestore, 'users', user.uid);
      await updateDoc(staffRef, { assignedPatients: arrayUnion(patientId) });
      const poaId = patientDoc.data().poa;
      if (poaId) {
        const poaRef = doc(firestore, 'users', poaId);
        await updateDoc(poaRef, { assignedStaff: arrayUnion(user.uid) });
      }
      Alert.alert('Success', 'Assigned!');
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const renderPatientItem = ({ item }) => (
    <Card {...styles.card}>
      <Text fontSize="lg">{item.title}</Text>
      <Button mt={2} onPress={() => handleAssign(item.id)} {...styles.button}>
        Assign Self
      </Button>
    </Card>
  );

  return (
    <Box flex={1} safeArea theme={theme} {...styles.container}>
      <Heading {...styles.title}>Assign to Patients</Heading>
      <Animated.View style={{ opacity: fadeAnim }}>
        {patients.length === 0 ? (
          <Text fontSize="lg">No patients or POA found.</Text>
        ) : (
          <VStack space={4}>
            {AutocompleteDropdown ? (
              <AutocompleteDropdown
                dataSet={patients}
                onSelectItem={(item) => item && handleAssign(item.id)}
                textInputProps={{ placeholder: 'Search patient/POA...', style: styles.input }}
              />
            ) : (
              <FlatList
                data={patients}
                keyExtractor={(item) => item.id}
                renderItem={renderPatientItem}
              />
            )}
          </VStack>
        )}
      </Animated.View>
    </Box>
  );
}