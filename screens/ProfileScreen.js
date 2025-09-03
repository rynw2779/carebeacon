import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TextInput, Button, Alert, StyleSheet, Modal, Image, TouchableOpacity, Platform, KeyboardAvoidingView, Keyboard, Dimensions, FlatList, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { auth, firestore, storage } from '../firebaseConfig';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { updateEmail, reauthenticateWithCredential } from 'firebase/auth';
import { EmailAuthProvider } from 'firebase/auth';
import * as ImagePicker from 'expo-image-picker';
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useHeaderHeight } from '@react-navigation/elements';

const GOOGLE_API_KEY = 'AIzaSyBwYAXOa4bzHLfLA4GIQxxWq5EOCi-0Q50';

export default function ProfileScreen({ navigation }) {
  const [profile, setProfile] = useState(null);
  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [editing, setEditing] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [passwordForEmail, setPasswordForEmail] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const debounceTimer = React.useRef(null);
  const addressInputRef = useRef(null);
  const phoneInputRef = useRef(null);
  const scrollRef = useRef(null);
  const [suggestionTop, setSuggestionTop] = useState(0);
  const [suggestionLeft, setSuggestionLeft] = useState(0);
  const [suggestionWidth, setSuggestionWidth] = useState(0);
  const renderCount = useRef(0); // Debug: Track renders
  const headerHeight = useHeaderHeight();

  useEffect(() => {
    const fetchProfile = async () => {
      setIsLoading(true);
      const user = auth.currentUser;
      if (user) {
        const userDoc = await getDoc(doc(firestore, 'users', user.uid));
        if (userDoc.exists()) {
          const data = userDoc.data();
          setProfile(data);
          setEmail(data.email || '');
          setFirstName(data.firstName || '');
          setLastName(data.lastName || '');
          setPhone(formatPhoneNumber(data.phone || '')); // Format pre-existing phone
          setAddress(data.address || '');
        } else {
          Alert.alert('Error', 'No profile found');
        }
      } else {
        Alert.alert('Error', 'No user logged in');
      }
      setIsLoading(false);
    };
    fetchProfile();
  }, []);

  useEffect(() => {
    renderCount.current += 1;
    console.log('Render count:', renderCount.current); // Debug log
  });

  useEffect(() => {
    const keyboardDidShowListener = Keyboard.addListener(
      'keyboardDidShow',
      (e) => {
        setKeyboardVisible(true);
        setKeyboardHeight(e.endCoordinates.height);
      }
    );
    const keyboardDidHideListener = Keyboard.addListener(
      'keyboardDidHide',
      () => {
        setKeyboardVisible(false);
        setKeyboardHeight(0);
      }
    );

    return () => {
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, []);

  useEffect(() => {
    if (addressSuggestions.length > 0) {
      positionSuggestions();
    }
  }, [addressSuggestions]);

  const positionSuggestions = () => {
    if (addressInputRef.current) {
      addressInputRef.current.measureInWindow((x, y, width, height) => {
        setSuggestionTop(y + height);
        setSuggestionLeft(x);
        setSuggestionWidth(width);
      });
    }
  };

  const handleAddressFocus = () => {
    setTimeout(() => {
      if (addressInputRef.current && scrollRef.current) {
        scrollRef.current.measureInWindow((sx, sy, sw, sh) => {
          addressInputRef.current.measureInWindow((x, y, width, height) => {
            console.log('ScrollView y:', sy); // Debug log
            console.log('Address absolute y:', y); // Debug log
            const relativeY = y - sy;
            console.log('Relative y:', relativeY); // Debug log
            const offset = -220; // Less negative offset to reduce scrollPosition slightly and avoid cutting off label
            const scrollPosition = relativeY - offset;
            console.log('Scroll position:', scrollPosition); // Debug log
            scrollRef.current.scrollTo({ y: Math.max(scrollPosition, 0), animated: true });
          });
        });
      }
    }, 1000); // Increased delay for keyboard timing
  };

  const handleAddressChange = useCallback((text) => {
    setAddress(text);
    if (debounceTimer.current) {
      clearTimeout(debounceTimer.current);
    }
    if (text.length > 2) {
      debounceTimer.current = setTimeout(async () => {
        try {
          const response = await fetch(
            'https://places.googleapis.com/v1/places:autocomplete',
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': GOOGLE_API_KEY,
              },
              body: JSON.stringify({
                input: text,
                includedRegionCodes: ['US'],
              }),
            }
          );
          const json = await response.json();
          if (json.suggestions) {
            setAddressSuggestions(
              json.suggestions.map((suggestion, index) => ({
                id: index.toString(),
                title: suggestion.placePrediction.text.text,
                placeId: suggestion.placePrediction.placeId,
              }))
            );
          }
        } catch (error) {
          console.error('Error fetching address suggestions:', error);
        }
      }, 300);
    } else {
      setAddressSuggestions([]);
    }
  }, []);

  const handleSelectSuggestion = async (placeId, title) => {
    setAddress(title);
    setAddressSuggestions([]);
    try {
      const response = await fetch(
        `https://places.googleapis.com/v1/places/${placeId}?fields=formattedAddress&key=${GOOGLE_API_KEY}`
      );
      const json = await response.json();
      if (json.formattedAddress) {
        setAddress(json.formattedAddress);
      }
    } catch (error) {
      console.error('Error fetching place details:', error);
    }
  };

  const formatPhoneNumber = (text) => {
    let cleaned = ('' + text).replace(/\D/g, '');
    let match = cleaned.match(/^(\d{3})(\d{3})(\d{4})$/);
    if (match) {
      return `(${match[1]}) ${match[2]}-${match[3]}`;
    }
    return text;
  };

  const handlePhoneChange = (text) => {
    let cleaned = ('' + text).replace(/\D/g, '').slice(0, 10);
    setPhone(formatPhoneNumber(cleaned));
  };

  const pickImage = async () => {
    if (!editing) return;
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
    });
    if (!result.canceled) {
      const uri = result.assets[0].uri;
      try {
        const response = await fetch(uri);
        const blob = await response.blob();
        const storageReference = storageRef(storage, `profile_photos/${auth.currentUser.uid}`);
        await uploadBytes(storageReference, blob);
        const downloadURL = await getDownloadURL(storageReference);
        setProfile((prev) => ({ ...prev, profilePhoto: downloadURL }));
      } catch (error) {
        Alert.alert('Error', 'Failed to upload photo');
      }
    }
  };

  const validateAndSave = () => {
    if (!email || !firstName || !lastName || !phone || !address) {
      Alert.alert('Error', 'All fields are required.');
      return;
    }
    if (email !== profile.email) {
      setShowPasswordModal(true);
    } else {
      saveProfile();
    }
  };

  const handleEmailChangeConfirm = () => {
    const credential = EmailAuthProvider.credential(profile.email, passwordForEmail);
    reauthenticateWithCredential(auth.currentUser, credential)
      .then(() => {
        updateEmail(auth.currentUser, email)
          .then(() => {
            saveProfile();
            setShowPasswordModal(false);
            setPasswordForEmail('');
          })
          .catch((error) => Alert.alert('Error', error.message));
      })
      .catch((error) => Alert.alert('Error', error.message));
  };

  const saveProfile = async () => {
    try {
      const userRef = doc(firestore, 'users', auth.currentUser.uid);
      await updateDoc(userRef, {
        email,
        firstName,
        lastName,
        phone: phone.replace(/\D/g, ''),
        address,
        profilePhoto: profile.profilePhoto || null,
      });
      Alert.alert('Success', 'Profile updated!');
      setEditing(false);
      // Refresh profile data
      const updatedDoc = await getDoc(userRef);
      if (updatedDoc.exists()) {
        setProfile(updatedDoc.data());
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const renderHeader = () => (
    <View style={{ padding: 20 }}>
      <TouchableOpacity onPress={pickImage} disabled={!editing}>
        {profile.profilePhoto ? (
          <Image source={{ uri: profile.profilePhoto }} style={styles.photo} />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Text style={{ textAlign: 'center' }}>Upload Photo</Text>
          </View>
        )}
      </TouchableOpacity>
      <Text style={styles.label}>Email *</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        editable={editing}
        style={styles.input}
        placeholderTextColor="lightgray"
      />
      <Text style={styles.label}>First Name *</Text>
      <TextInput
        value={firstName}
        onChangeText={setFirstName}
        editable={editing}
        style={styles.input}
        placeholderTextColor="lightgray"
      />
      <Text style={styles.label}>Last Name *</Text>
      <TextInput
        value={lastName}
        onChangeText={setLastName}
        editable={editing}
        style={styles.input}
        placeholderTextColor="lightgray"
      />
      <Text style={styles.label}>Phone *</Text>
      <TextInput
        ref={phoneInputRef}
        value={phone}
        onChangeText={handlePhoneChange}
        editable={editing}
        keyboardType="phone-pad"
        style={styles.input}
        placeholderTextColor="lightgray"
      />
      <Text style={styles.label}>Address *</Text>
      <TextInput
        ref={addressInputRef}
        value={address}
        onChangeText={handleAddressChange}
        onFocus={handleAddressFocus}
        onBlur={() => setTimeout(() => setAddressSuggestions([]), 200)}
        style={styles.input}
        editable={editing}
        multiline
        placeholderTextColor="lightgray"
      />
    </View>
  );

  return (
    <LinearGradient colors={['#87CEEB', '#4682B4']} style={{ flex: 1 }}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={headerHeight + 50}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Profile</Text>
          {isLoading ? (
            <Text style={{ textAlign: 'center', marginTop: 20, color: 'white' }}>Loading...</Text>
          ) : (
            <ScrollView 
              ref={scrollRef} 
              style={styles.list}
              contentContainerStyle={{ paddingBottom: keyboardVisible ? keyboardHeight + 300 : 250 }}
            >
              {profile ? renderHeader() : <Text style={{ color: 'white' }}>No profile data available.</Text>}
            </ScrollView>
          )}
          {!isLoading && (
            <View style={styles.footer}>
              {editing ? (
                <Button title="Save" onPress={validateAndSave} color="#A7C7E7" />
              ) : (
                <Button title="Edit" onPress={() => setEditing(true)} color="#B2D8B2" />
              )}
            </View>
          )}
        </View>
        {addressSuggestions.length > 0 && (
          <View
            style={[
              styles.suggestionsContainer,
              { top: suggestionTop, left: suggestionLeft, width: suggestionWidth },
            ]}
          >
            <FlatList
              data={addressSuggestions}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => handleSelectSuggestion(item.placeId, item.title)}
                  style={styles.suggestionItem}
                >
                  <Text>{item.title}</Text>
                </TouchableOpacity>
              )}
              keyboardShouldPersistTaps="always"
            />
          </View>
        )}
        <Modal visible={showPasswordModal} transparent animationType="slide">
          <View style={styles.modalContainer}>
            <View style={styles.modalContent}>
              <Text>Enter your current password to change email:</Text>
              <TextInput
                secureTextEntry
                value={passwordForEmail}
                onChangeText={setPasswordForEmail}
                style={styles.input}
                placeholderTextColor="lightgray"
              />
              <Button title="Confirm" onPress={handleEmailChangeConfirm} color="#4682B4" />
              <Button
                title="Cancel"
                onPress={() => {
                  setShowPasswordModal(false);
                  setPasswordForEmail('');
                }}
                color="#4682B4"
              />
            </View>
          </View>
        </Modal>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  list: { flex: 1 },
  title: { fontSize: 28, fontWeight: 'bold', color: 'white', textAlign: 'center', marginVertical: 15 },
  label: { fontSize: 16, color: 'white', marginTop: 10 },
  input: { borderWidth: 1, borderColor: 'white', padding: 10, marginVertical: 5, borderRadius: 5, color: 'white', backgroundColor: 'transparent' },
  photo: { width: 100, height: 100, borderRadius: 50, alignSelf: 'center', marginBottom: 10 },
  photoPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignSelf: 'center',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#DDD',
    marginBottom: 10,
  },
  suggestionItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  suggestionsContainer: {
    position: 'absolute',
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#EEE',
    maxHeight: 300,
    zIndex: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' },
  modalContent: { backgroundColor: '#FFF', padding: 20, borderRadius: 10, width: '80%' },
  footer: { padding: 10, backgroundColor: 'transparent' },
});