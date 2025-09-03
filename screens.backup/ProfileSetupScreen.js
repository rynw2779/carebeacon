import React, { useState, useEffect } from 'react';
import { VStack, Heading, FormControl, Input, Button, Text, Card, Switch } from 'native-base';
import { Alert, Animated } from 'react-native';
import { auth, firestore } from '../firebaseConfig';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { MaterialIcons } from '@expo/vector-icons';
import { getTheme, useThemeStyles } from '../theme';

export default function ProfileSetupScreen({ navigation }) {
  const theme = getTheme();
  const styles = useThemeStyles(profile ? profile.role : 'unassigned');
  const [profile, setProfile] = useState(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [editing, setEditing] = useState(true); // Start in edit for setup
  const scaleAnim = useState(new Animated.Value(0.95))[0];

  useEffect(() => {
    const fetchProfile = async () => {
      const user = auth.currentUser;
      if (user) {
        const userDoc = await getDoc(doc(firestore, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setProfile(data);
          setFirstName(data.firstName || '');
          setLastName(data.lastName || '');
          setPhone(data.phone || '');
          setAddress(data.address || '');
        } else {
          Alert.alert('Error', 'No profile found');
        }
      } else {
        Alert.alert('Error', 'No user logged in');
      }
    };
    fetchProfile();
  }, []);

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: editing ? 1 : 0.95,
      friction: 6,
      useNativeDriver: true,
    }).start();
  }, [editing]);

  const handleUpdate = async () => {
    try {
      const user = auth.currentUser;
      if (user) {
        await updateDoc(doc(firestore, 'users', user.uid), {
          firstName,
          lastName,
          phone,
          address
        });
        Alert.alert('Success', 'Profile setup complete!');
        setEditing(false);
        navigation.navigate('Dashboard');
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  return (
    <Box flex={1} safeArea theme={theme} {...styles.container}>
      <Heading {...styles.title}>Profile Setup</Heading>
      {profile ? (
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <Card {...styles.card}>
            <VStack space={4}>
              <FormControl>
                <FormControl.Label>Email</FormControl.Label>
                <Text fontSize="lg">{profile.email}</Text>
              </FormControl>
              <FormControl>
                <FormControl.Label>Role</FormControl.Label>
                <Text fontSize="lg">{profile.role}</Text>
              </FormControl>
              <FormControl>
                <FormControl.Label>First Name</FormControl.Label>
                <Input value={firstName} onChangeText={setFirstName} isDisabled={!editing} {...styles.input} />
              </FormControl>
              <FormControl>
                <FormControl.Label>Last Name</FormControl.Label>
                <Input value={lastName} onChangeText={setLastName} isDisabled={!editing} {...styles.input} />
              </FormControl>
              <FormControl>
                <FormControl.Label>Phone</FormControl.Label>
                <Input value={phone} onChangeText={setPhone} isDisabled={!editing} {...styles.input} />
              </FormControl>
              <FormControl>
                <FormControl.Label>Address</FormControl.Label>
                <Input value={address} onChangeText={setAddress} isDisabled={!editing} {...styles.input} />
              </FormControl>
              <FormControl>
                <FormControl.Label>Edit Mode</FormControl.Label>
                <Switch isChecked={editing} onToggle={() => setEditing(!editing) } colorScheme="primary" />
              </FormControl>
              {editing && (
                <Button onPress={handleUpdate} leftIcon={<MaterialIcons name="save" size={24} color="white" />} {...styles.button}>
                  Save and Continue
                </Button>
              )}
            </VStack>
          </Card>
        </Animated.View>
      ) : (
        <Text fontSize="lg">Loading...</Text>
      )}
    </Box>
  );
}