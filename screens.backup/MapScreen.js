import React, { useState, useEffect, useRef } from 'react';
import { Box, Button, Text, Card, FlatList, VStack, Heading } from 'native-base';
import { Alert, Linking, Dimensions, Platform, Animated } from 'react-native';
import * as Location from 'expo-location';
import { db, auth, firestore } from '../firebaseConfig';
import { ref, onValue, set } from 'firebase/database';
import { collection, getDocs, doc, getDoc } from 'firebase/firestore';
import MapView, { Marker, PROVIDER_GOOGLE, PROVIDER_DEFAULT, Polyline } from 'react-native-maps';
import * as Notifications from 'expo-notifications';
import { sendPushNotification } from '../utils/pushNotifications';
import Constants from 'expo-constants';
import * as Speech from 'expo-speech';
import { MaterialIcons } from '@expo/vector-icons';
import { getTheme, useThemeStyles } from '../theme';
let AutocompleteDropdown;
try {
  AutocompleteDropdown = require('react-native-autocomplete-dropdown').AutocompleteDropdown;
} catch (e) {
  console.error('AutocompleteDropdown import failed:', e.message, e.stack);
  AutocompleteDropdown = null;
}

const API_KEY = Constants.expoConfig?.android?.config?.googleMaps?.apiKey || 'YOUR_NEW_API_KEY_HERE';
const { height } = Dimensions.get('window');

const mapProvider = Platform.OS === 'android' ? PROVIDER_GOOGLE : PROVIDER_DEFAULT;

function decodePolyline(encoded) {
  let index = 0, lat = 0, lng = 0;
  const poly = [];
  while (index < encoded.length) {
    let shift = 0, result = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlat = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
    lat += dlat;
    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlng = ((result & 1) !== 0 ? ~(result >> 1) : (result >> 1));
    lng += dlng;
    poly.push({ latitude: lat * 1e-5, longitude: lng * 1e-5 });
  }
  return poly;
}

function calculateDistance(point1, point2) {
  const R = 6371000;
  const dLat = (point2.latitude - point1.latitude) * Math.PI / 180;
  const dLon = (point2.longitude - point1.longitude) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(point1.latitude * Math.PI / 180) * Math.cos(point2.latitude * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const formatUserDisplay = (user) => {
  const lastName = user.lastName || '';
  const firstName = user.firstName || '';
  const role = user.role || 'unassigned';
  return `${lastName}, ${firstName}; ${role}`;
};

export default function MapScreen({ navigation }) {
  const theme = getTheme();
  const styles = useThemeStyles('staff'); // Adjust based on user role if needed
  const [location, setLocation] = useState(null);
  const [staffLocation, setStaffLocation] = useState(null);
  const [patients, setPatients] = useState([]);
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [patientLocation, setPatientLocation] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [currentAssignedTo, setCurrentAssignedTo] = useState(null);
  const mapRef = useRef(null);
  const [isStaff, setIsStaff] = useState(false);
  const [eta, setEta] = useState('N/A');
  const [previousEtaMinutes, setPreviousEtaMinutes] = useState(0);
  const [navigationMode, setNavigationMode] = useState(false);
  const [directionsSteps, setDirectionsSteps] = useState([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [watchingLocation, setWatchingLocation] = useState(null);
  const [announcedSteps, setAnnouncedSteps] = useState(new Set());
  const refetchInterval = useRef(null);
  const [mapType, setMapType] = useState('standard');
  const [mapReady, setMapReady] = useState(false);
  const [markerHeading, setMarkerHeading] = useState(0);
  const fadeAnim = useState(new Animated.Value(0))[0];
  const etaAnim = useState(new Animated.Value(0))[0];

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(etaAnim, {
        toValue: 1,
        duration: 800,
        delay: 200,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  useEffect(() => {
    (async () => {
      const user = auth.currentUser;
      if (user) {
        console.log('Fetching user data for UID:', user.uid);
        const userDoc = await getDoc(doc(firestore, 'users', user.uid));
        if (userDoc.exists()) {
          const role = userDoc.data().role;
          console.log('User role:', role);
          setIsStaff(role !== 'patient' && role !== 'POA');
          if (role !== 'patient' && role !== 'POA') {
            console.log('Fetching patients for staff');
            const querySnapshot = await getDocs(collection(firestore, 'users'));
            let patientList = querySnapshot.docs
              .map(doc => ({
                id: doc.id,
                title: formatUserDisplay(doc.data()),
                ...doc.data(),
              }))
              .filter(user => user.role === 'patient' && user.assignedStaff?.includes(auth.currentUser.uid));
            patientList.sort((a, b) => 
              (a.lastName || '').toLowerCase().localeCompare((b.lastName || '').toLowerCase())
            );
            console.log('Filtered patients:', patientList);
            setPatients(patientList);
          }
        }
      }

      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Error', 'Permission to access location was denied');
        return;
      }

      let loc = await Location.getCurrentPositionAsync({});
      setLocation(loc.coords);
      setMarkerHeading(loc.coords.heading || 0);

      const interval = setInterval(async () => {
        let newLoc = await Location.getCurrentPositionAsync({});
        set(ref(db, 'staffLocations/' + auth.currentUser.uid), {
          latitude: newLoc.coords.latitude,
          longitude: newLoc.coords.longitude,
          timestamp: new Date().toISOString(),
          assignedTo: currentAssignedTo || null,
        });
        setMarkerHeading(newLoc.coords.heading || 0);
      }, 5000);

      return () => clearInterval(interval);
    })();
  }, [currentAssignedTo]);

  useEffect(() => {
    if (!isStaff) {
      const allStaffRef = ref(db, 'staffLocations');
      onValue(allStaffRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          const filtered = Object.values(data).filter(loc => loc.assignedTo === auth.currentUser.uid);
          if (filtered.length > 0) {
            setStaffLocation(filtered[0]);
          }
        }
      });
    } else {
      const staffRef = ref(db, 'staffLocations/' + auth.currentUser?.uid);
      onValue(staffRef, (snapshot) => {
        const data = snapshot.val();
        if (data) setStaffLocation(data);
      });
    }
  }, [isStaff]);

  useEffect(() => {
    if (isStaff && selectedPatient) {
      setCurrentAssignedTo(selectedPatient.id);
      geocodeAddress(selectedPatient.address).then(patLoc => {
        if (patLoc) setPatientLocation(patLoc);
      });
    }
  }, [selectedPatient, isStaff]);

  useEffect(() => {
    let origin, destination;
    if (isStaff) {
      origin = location;
      destination = patientLocation;
    } else {
      origin = staffLocation;
      destination = location;
    }
    if (origin && destination) {
      fetchDirections(origin, destination);
    }
    if (location && mapRef.current && mapReady) {
      console.log('Animating camera on initial load:', {
        center: { latitude: location.latitude, longitude: location.longitude },
        zoom: 18,
        pitch: 45,
        heading: location.heading || 0,
      });
      mapRef.current.animateCamera({
        center: { latitude: location.latitude, longitude: location.longitude },
        zoom: 18,
        pitch: 45,
        heading: location.heading || 0,
      }, { duration: 1000 });
    }
  }, [location, patientLocation, staffLocation, isStaff, mapReady]);

  const geocodeAddress = async (address) => {
    try {
      const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${API_KEY}`);
      const data = await response.json();
      if (data.status === 'OK') {
        const { lat, lng } = data.results[0].geometry.location;
        return { latitude: lat, longitude: lng };
      } else {
        Alert.alert('Geocode Error', data.status);
        return null;
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to geocode address: ' + error.message);
      return null;
    }
  };

  const fetchDirections = async (origin, destination) => {
    try {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${origin.latitude},${origin.longitude}&destination=${destination.latitude},${destination.longitude}&departure_time=now&traffic_model=best_guess&key=${API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.status === 'OK') {
        const route = data.routes[0];
        const leg = route.legs[0];
        const newEtaText = leg.duration_in_traffic ? leg.duration_in_traffic.text : leg.duration.text;
        const newEtaMinutes = leg.duration_in_traffic ? leg.duration_in_traffic.value / 60 : leg.duration.value / 60;
        setEta(newEtaText);

        if (Math.abs(newEtaMinutes - previousEtaMinutes) > 2 && navigationMode) {
          Speech.speak(`ETA updated to ${newEtaText} due to traffic changes.`, { language: 'en' });
        }
        setPreviousEtaMinutes(newEtaMinutes);

        const points = route.overview_polyline.points;
        const coords = decodePolyline(points);
        setRouteCoordinates(coords);

        const steps = leg.steps.map(step => ({
          instruction: step.html_instructions.replace(/<[^>]*>/g, ''),
          distance: step.distance.text,
          endLocation: step.end_location,
        }));
        setDirectionsSteps(steps);
      } else {
        Alert.alert('Directions Error', data.status);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to fetch directions: ' + error.message);
    }
  };

  const sendLocation = async () => {
    if (!selectedPatient) {
      Alert.alert('Error', 'Please select a patient');
      return;
    }
    try {
      let loc = await Location.getCurrentPositionAsync({});
      await set(ref(db, 'staffLocations/' + auth.currentUser.uid), {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        timestamp: new Date().toISOString(),
        assignedTo: selectedPatient.id,
      });
      const patientDoc = await getDoc(doc(firestore, 'users', selectedPatient.id));
      const poaId = patientDoc.data().poa;
      const notificationContent = {
        title: 'Staff On The Way',
        body: `${auth.currentUser.email} is on their way!`,
        data: { screen: 'Map', staffId: auth.currentUser.uid },
      };
      await sendPushNotification(selectedPatient.pushToken, notificationContent);
      if (poaId) {
        const poaDoc = await getDoc(doc(firestore, 'users', poaId));
        await sendPushNotification(poaDoc.data().pushToken, notificationContent);
      }
      Alert.alert('Success', 'Location sent!');
    } catch (error) {
      Alert.alert('Error', 'Failed to send location: ' + error.message);
    }
  };

  const handleNotificationInteraction = async (notification) => {
    const { screen, staffId } = notification.data;
    if (screen === 'Map') {
      navigation.navigate('Map');
      const staffRef = ref(db, 'staffLocations/' + staffId);
      onValue(staffRef, (snapshot) => {
        const data = snapshot.val();
        if (data) {
          setStaffLocation(data);
          if (mapRef.current && mapReady) {
            mapRef.current.animateCamera({
              center: { latitude: data.latitude, longitude: data.longitude },
              zoom: 18,
              pitch: 45,
              heading: data.heading || 0,
            }, { duration: 1000 });
          }
        }
      });
    }
  };

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(response => {
      handleNotificationInteraction(response.notification.request.content);
    });
    return () => subscription.remove();
  }, []);

  const startInAppNavigation = async () => {
    if (location && patientLocation && directionsSteps.length > 0) {
      setNavigationMode(true);
      setCurrentStepIndex(0);
      setAnnouncedSteps(new Set());
      setMapType('hybrid');

      Speech.speak('Navigation started.', { language: 'en' });

      if (mapRef.current && mapReady) {
        setTimeout(() => {
          console.log('Animating camera on navigation start:', {
            center: { latitude: location.latitude, longitude: location.longitude },
            zoom: 18,
            pitch: 45,
            heading: location.heading || 0,
          });
          mapRef.current.animateCamera({
            center: { latitude: location.latitude, longitude: location.longitude },
            zoom: 18,
            pitch: 45,
            heading: location.heading || 0,
          }, { duration: 1000 });
        }, 1000);
      } else {
        console.log('mapRef.current is null or map not ready');
      }

      const watchSubscription = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 5000, distanceInterval: 10 },
        (newLoc) => {
          setLocation(newLoc.coords);
          setMarkerHeading(newLoc.coords.heading || 0);
          handleLocationUpdate(newLoc.coords);
        }
      );
      setWatchingLocation(watchSubscription);

      refetchInterval.current = setInterval(() => {
        fetchDirections(location, patientLocation);
      }, 60000);
    } else {
      Alert.alert('Error', 'Directions not ready. Try again.');
    }
  };

  const handleLocationUpdate = (currentLoc) => {
    if (navigationMode && directionsSteps.length > 0) {
      console.log('Current heading:', currentLoc.heading || 0);
      const currentStep = directionsSteps[currentStepIndex];
      const distanceToNext = calculateDistance(currentLoc, {
        latitude: currentStep.endLocation.lat,
        longitude: currentStep.endLocation.lng,
      });

      if (distanceToNext < 200 && !announcedSteps.has(currentStepIndex)) {
        Speech.speak(`In ${currentStep.distance}, ${currentStep.instruction}`, { language: 'en' });
        setAnnouncedSteps(prev => new Set([...prev, currentStepIndex]));

        if (mapRef.current && mapReady) {
          console.log('Animating camera to next turn:', {
            center: { latitude: currentStep.endLocation.lat, longitude: currentStep.endLocation.lng },
            zoom: 18,
            pitch: 45,
            heading: currentLoc.heading || 0,
          });
          mapRef.current.animateCamera({
            center: { latitude: currentStep.endLocation.lat, longitude: currentStep.endLocation.lng },
            zoom: 18,
            pitch: 45,
            heading: currentLoc.heading || 0,
          }, { duration: 1000 });
        } else {
          console.log('mapRef.current is null during turn zoom or map not ready');
        }
      }

      if (distanceToNext < 50) {
        if (currentStepIndex < directionsSteps.length - 1) {
          setCurrentStepIndex(currentStepIndex + 1);
          Speech.speak(directionsSteps[currentStepIndex + 1].instruction, { language: 'en' });
        } else {
          Speech.speak('You have arrived at your destination.', { language: 'en' });
          stopNavigation();
        }
      }

      const distanceToEnd = calculateDistance(currentLoc, patientLocation);
      if (distanceToEnd > 500 && currentStepIndex > 0) {
        fetchDirections(currentLoc, patientLocation);
        setCurrentStepIndex(0);
      }
    }
  };

  const stopNavigation = () => {
    setNavigationMode(false);
    setMapType('standard');
    if (watchingLocation && watchingLocation.remove) {
      watchingLocation.remove();
    }
    setWatchingLocation(null);
    if (refetchInterval.current) {
      clearInterval(refetchInterval.current);
      refetchInterval.current = null;
    }
    Speech.stop();
  };

  const openExternalNavigation = () => {
    if (location && patientLocation) {
      Linking.openURL(`https://www.google.com/maps/dir/?api=1&origin=${location.latitude},${location.longitude}&destination=${patientLocation.latitude},${patientLocation.longitude}&travelmode=driving`);
    }
  };

  const toggleMapType = () => {
    setMapType(mapType === 'standard' ? 'hybrid' : 'standard');
  };

  const simulateMovement = () => {
    const fakeLoc = {
      coords: {
        latitude: location.latitude + 0.0001,
        longitude: location.longitude + 0.0001,
        heading: (location.heading || 0) + 90,
      }
    };
    setLocation(fakeLoc.coords);
    setMarkerHeading(fakeLoc.coords.heading || 0);
    handleLocationUpdate(fakeLoc.coords);
  };

  const renderPatientItem = ({ item }) => (
    <Card {...styles.card}>
      <Text {...styles.label}>{formatUserDisplay(item)}</Text>
      <Button
        onPress={() => setSelectedPatient(item)}
        colorScheme={selectedPatient?.id === item.id ? 'accent' : 'primary'}
        leftIcon={<MaterialIcons name="person-pin" size={20} color="white" />}
        {...styles.button}
      >
        Select
      </Button>
    </Card>
  );

  return (
    <Box flex={1} safeArea theme={theme} {...styles.container}>
      <Animated.View style={{ opacity: fadeAnim }}>
        <VStack space={4}>
          <Heading {...styles.title}>Map</Heading>
          <Animated.Text style={{ opacity: etaAnim, fontSize: 18, textAlign: 'center' }}>
            ETA: {eta}
          </Animated.Text>
          {navigationMode && (
            <Card h={height * 0.3} {...styles.card}>
              {directionsSteps[currentStepIndex]?.distance && directionsSteps[currentStepIndex]?.instruction && (
                <Text fontSize="lg" textAlign="center">
                  {`${directionsSteps[currentStepIndex].distance}: ${directionsSteps[currentStepIndex].instruction}`}
                </Text>
              )}
              <Button
                onPress={stopNavigation}
                colorScheme="danger"
                leftIcon={<MaterialIcons name="stop" size={20} color="white" />}
                {...styles.button}
              >
                Stop Navigation
              </Button>
              <Button
                onPress={simulateMovement}
                leftIcon={<MaterialIcons name="play-arrow" size={20} color="white" />}
                {...styles.button}
              >
                Simulate Movement
              </Button>
            </Card>
          )}
          {!navigationMode && isStaff && (
            <Card {...styles.card}>
              {AutocompleteDropdown ? (
                <AutocompleteDropdown
                  clearOnFocus={false}
                  closeOnBlur={true}
                  closeOnSubmit={false}
                  direction="down"
                  dataSet={patients}
                  onSelectItem={setSelectedPatient}
                  useFilter={true}
                  textInputProps={{ placeholder: 'Select a patient...', style: styles.input }}
                  suggestionsListContainerStyle={{ maxHeight: 200, backgroundColor: theme.colors.card, borderRadius: theme.components.Card.baseStyle.rounded }}
                />
              ) : (
                <FlatList
                  data={patients}
                  keyExtractor={(item) => item.id}
                  renderItem={renderPatientItem}
                />
              )}
            </Card>
          )}
          <Box flex={navigationMode ? height * 0.7 : 1} rounded="xl" overflow="hidden" shadow={6}>
            <MapView
              ref={mapRef}
              provider={mapProvider}
              style={{ flex: 1 }}
              initialRegion={{
                latitude: 39.9961369,
                longitude: -86.1583486,
                latitudeDelta: 0.05,
                longitudeDelta: 0.05,
              }}
              showsUserLocation={true}
              showsMyLocationButton={true}
              mapType={mapType}
              showsTraffic={navigationMode}
              pitchEnabled={true}
              onMapReady={() => {
                console.log('Map ready');
                setMapReady(true);
              }}
            >
              {isStaff ? (
                <>
                  {location && (
                    <Marker
                      coordinate={location}
                      title="My Location"
                    >
                      <View style={{ width: 30, height: 30, alignItems: 'center', justifyContent: 'center' }}>
                        <Text style={{ fontSize: 24, color: '#FF0000', transform: [{ rotate: `${markerHeading}deg` }] }}>➤</Text>
                      </View>
                    </Marker>
                  )}
                  {patientLocation && (
                    <Marker
                      coordinate={patientLocation}
                      title="Patient Location"
                      pinColor="#0000FF"
                    />
                  )}
                </>
              ) : (
                <>
                  {location && (
                    <Marker
                      coordinate={location}
                      title="My Location"
                      pinColor="#0000FF"
                    />
                  )}
                  {staffLocation && (
                    <Marker
                      coordinate={staffLocation}
                      title="Staff Location"
                      pinColor="#FF0000"
                    />
                  )}
                </>
              )}
              {routeCoordinates.length > 0 && (
                <Polyline
                  coordinates={routeCoordinates}
                  strokeColor="#0000FF"
                  strokeWidth={3}
                />
              )}
            </MapView>
            <Box position="absolute" top={50} right={10}>
              <Button
                onPress={toggleMapType}
                icon={<MaterialIcons name={mapType === 'standard' ? 'satellite' : 'map'} size={24} color="white" />}
                size="sm"
                rounded="full"
                shadow={2}
              />
            </Box>
          </Box>
          {isStaff && (
            <HStack space={4} justifyContent="space-around" mt={4}>
              <Button
                onPress={sendLocation}
                leftIcon={<MaterialIcons name="location-on" size={20} color="white" />}
                {...styles.button}
              >
                Send Location
              </Button>
              {selectedPatient && patientLocation && (
                <>
                  <Button
                    onPress={startInAppNavigation}
                    leftIcon={<MaterialIcons name="navigation" size={20} color="white" />}
                    {...styles.button}
                  >
                    Start Navigation
                  </Button>
                  <Button
                    onPress={openExternalNavigation}
                    leftIcon={<MaterialIcons name="directions" size={20} color="white" />}
                    {...styles.button}
                  >
                    Open in Google Maps
                  </Button>
                </>
              )}
            </HStack>
          )}
        </VStack>
      </Animated.View>
    </Box>
  );
}