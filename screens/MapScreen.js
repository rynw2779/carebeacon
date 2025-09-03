// Full updated code for screens/MapScreen.js
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Button, Alert, FlatList, Linking, Dimensions, Platform, TouchableOpacity, Image } from 'react-native';
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

let AutocompleteDropdown;
try {
  AutocompleteDropdown = require('react-native-autocomplete-dropdown').AutocompleteDropdown;
} catch (e) {
  console.error('AutocompleteDropdown import failed:', e.message, e.stack);
  AutocompleteDropdown = null; // Fallback to FlatList if import fails
}

const API_KEY = Constants.expoConfig?.android?.config?.googleMaps?.apiKey || 'AIzaSyBwYAXOa4bzHLfLA4GIQxxWq5EOCi-0Q50';
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

// New: Function to geocode address to lat/lng
const geocodeAddress = async (address) => {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${API_KEY}`;
  const response = await fetch(url);
  const data = await response.json();
  if (data.status === 'OK') {
    const location = data.results[0].geometry.location;
    console.log('Geocoding succeeded:', location);
    return { latitude: location.lat, longitude: location.lng };
  } else {
    console.error('Geocoding failed:', data.status);
    return null;
  }
};

// New: Function to snap GPS to road using Google Roads API
const snapToRoad = async (lat, lng) => {
  const url = `https://roads.googleapis.com/v1/snapToRoads?path=${lat},${lng}&key=${API_KEY}`;
  const response = await fetch(url);
  const data = await response.json();
  if (data.snappedPoints && data.snappedPoints.length > 0) {
    const snapped = data.snappedPoints[0].location;
    return { latitude: snapped.latitude, longitude: snapped.longitude };
  }
  return { latitude: lat, longitude: lng }; // Fallback if no snap
};

// New: Function to format distance in feet/miles
function formatDistance(meters) {
  const feet = meters * 3.28084;
  if (feet < 1000) {
    return `${Math.round(feet / 10) * 10} ft`;
  } else {
    const miles = feet / 5280;
    return `${miles.toFixed(1)} mi`;
  }
}

// New: Function to extract the next road name from instruction
function extractNextRoad(instr) {
  const lower = instr.toLowerCase();
  const ontoIndex = lower.indexOf('onto');
  if (ontoIndex !== -1) {
    return instr.substring(ontoIndex + 4).trim();
  }
  const atIndex = lower.indexOf('at ');
  if (atIndex !== -1) {
    return instr.substring(atIndex + 3).trim();
  }
  return '';
}

// Updated: Function to get effective instruction, merging all consecutive straight steps
const getEffectiveInstruction = (index) => {
  if (index >= directionsSteps.length) return { instruction: 'Follow the route', distanceText: '', maneuver: '' };

  let currentIndex = index;
  let totalDistance = 0;
  let instruction = '';
  let distanceText = '';
  let maneuver = '';

  while (currentIndex < directionsSteps.length) {
    const step = directionsSteps[currentIndex];
    const man = (step.maneuver || '').toLowerCase();
    if (!man || man === 'straight' || man.includes('toward')) {
      totalDistance += step.distance.value;
      currentIndex++;
    } else {
      // Found the next turn
      maneuver = man;
      const nextInstr = step.html_instructions.replace(/<[^>]*>/g, '');
      const nextRoad = extractNextRoad(nextInstr);
      instruction = `Continue straight for ${formatDistance(totalDistance)}${nextRoad ? ' until ' + nextRoad : ''}, then ${nextInstr.toLowerCase()}`;
      distanceText = formatDistance(totalDistance);
      break;
    }
  }

  if (currentIndex === directionsSteps.length && totalDistance > 0) {
    instruction = `Continue straight for ${formatDistance(totalDistance)} to your destination`;
    distanceText = formatDistance(totalDistance);
    maneuver = 'destination';
  } else if (totalDistance === 0 && currentIndex < directionsSteps.length) {
    // If no straights, just the current turn
    const step = directionsSteps[index];
    instruction = step.html_instructions.replace(/<[^>]*>/g, '');
    distanceText = step.distance?.text || '';
    maneuver = step.maneuver || '';
  }

  return { instruction, distanceText, maneuver };
};

// New: Function to get next maneuver preview
const getNextInstruction = (index) => {
  if (index + 1 >= directionsSteps.length) return { instruction: '', distanceText: '' };
  const next = directionsSteps[index + 1];
  const nextInstr = next.html_instructions.replace(/<[^>]*>/g, '');
  return { instruction: `Then: ${nextInstr}`, distanceText: next.distance?.text || '' };
};

export default function MapScreen({ navigation }) {
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
  const [currentManeuver, setCurrentManeuver] = useState('');
  const [isAerialView, setIsAerialView] = useState(true);
  const [hasAppliedAerial, setHasAppliedAerial] = useState(false);
  const [locationSent, setLocationSent] = useState(false);
  const [maneuverPoints, setManeuverPoints] = useState([]);
  const [userZoomedOut, setUserZoomedOut] = useState(false);
  const zoomBackTimer = useRef(null);
  const [muteVoice, setMuteVoice] = useState(false);
  const [userOverrodeView, setUserOverrodeView] = useState(false); // New state for user toggle
  const [lastInstruction, setLastInstruction] = useState(''); // New for voice loop prevention
  const [lastDistToEnd, setLastDistToEnd] = useState(Infinity); // New for debounce
  const locationWatchSub = useRef(null); // New for live sharing

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
      } else {
        console.log('No authenticated user found.');
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Permission to access location was denied');
        return;
      }

      let loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setLocation(loc.coords);
      if (mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        });
      }
    })();
  }, []);

  useEffect(() => {
    if (selectedPatient) {
      const address = selectedPatient.address;
      if (address) {
        geocodeAddress(address).then(loc => setPatientLocation(loc));
      } else {
        Alert.alert('Error', 'Patient address not available');
      }
      setCurrentAssignedTo(selectedPatient);
    }
  }, [selectedPatient]);

  const fetchRoute = async () => {
    const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${location.latitude},${location.longitude}&destination=${patientLocation.latitude},${patientLocation.longitude}&key=${API_KEY}&traffic_model=best_guess&departure_time=now`;
    const response = await fetch(url);
    const data = await response.json();
    if (data.routes.length > 0) {
      const route = data.routes[0];
      const polyline = decodePolyline(route.overview_polyline.points);
      setRouteCoordinates(polyline);
      const etaText = route.legs[0].duration_in_traffic?.text || route.legs[0].duration.text;
      setEta(etaText);
      const etaSeconds = route.legs[0].duration_in_traffic?.value || route.legs[0].duration.value;
      const etaMinutes = etaSeconds / 60;
      if (etaMinutes <= 5 && previousEtaMinutes > 5) {
        // Fetch staff name and tokens
        const staffDoc = await getDoc(doc(firestore, 'users', auth.currentUser.uid));
        const staffData = staffDoc.data();
        const staffName = `${staffData.firstName} ${staffData.lastName}`;
        const patientDoc = await getDoc(doc(firestore, 'users', selectedPatient.id));
        const patientToken = patientDoc.data().pushToken;
        const poaId = patientDoc.data().poa;
        let poaToken = null;
        if (poaId) {
          const poaDoc = await getDoc(doc(firestore, 'users', poaId));
          poaToken = poaDoc.data().pushToken;
        }
        const message = `${staffName} is arriving soon!`;
        if (patientToken) {
          console.log('Sending 5-min ETA notification to patient');
          sendPushNotification(patientToken, message, { screen: 'PatientTracking', staffId: auth.currentUser.uid });
        }
        if (poaToken) {
          console.log('Sending 5-min ETA notification to POA');
          sendPushNotification(poaToken, message, { screen: 'PatientTracking', staffId: auth.currentUser.uid });
        }
      }
      setPreviousEtaMinutes(etaMinutes);
      // No fitToCoordinates during navigationMode

      // Update steps if in navigation mode to keep them current with traffic
      if (navigationMode) {
        setDirectionsSteps(route.legs[0].steps);
        // Recalculate current step index based on current location
        let tempIndex = 0;
        for (let i = 0; i < route.legs[0].steps.length; i++) {
          const step = route.legs[0].steps[i];
          const stepStart = step.start_location;
          const stepEnd = step.end_location;
          const distToEnd = calculateDistance(location, { latitude: stepEnd.lat, longitude: stepEnd.lng });
          const distToStart = calculateDistance(location, { latitude: stepStart.lat, longitude: stepStart.lng });
          console.log(`Recalc step ${i}: distToEnd ${distToEnd.toFixed(0)}m, distToStart ${distToStart.toFixed(0)}m`);
          if (distToEnd < 150 && distToEnd < distToStart) { // Lower threshold, closer to end than start
            tempIndex = i + 1;
          } else {
            break;
          }
        }
        setCurrentStepIndex(tempIndex);
        setAnnouncedSteps(new Set()); // Reset
        // New: Speak the effective (possibly merged) instruction after refetch if not announced
        if (tempIndex < route.legs[0].steps.length && !announcedSteps.has(tempIndex)) {
          const { instruction } = getEffectiveInstruction(tempIndex);
          if (!muteVoice) {
            Speech.speak(instruction);
          }
          setAnnouncedSteps(new Set([tempIndex]));
        }
      }
    }
  };

  useEffect(() => {
    if (location && patientLocation) {
      fetchRoute();
    }
  }, [location, patientLocation]);

  useEffect(() => {
    if (routeCoordinates.length > 0 && !navigationMode && mapRef.current) {
      mapRef.current.fitToCoordinates(routeCoordinates, { edgePadding: { top: 50, right: 50, bottom: 50, left: 50 }, animated: true });
    }
  }, [routeCoordinates, navigationMode]);

  const sendLocation = async () => {
    if (location && selectedPatient) {
      // Set initial location
      set(ref(db, `locations/${auth.currentUser.uid}`), location);
      // Start watching and updating live
      locationWatchSub.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 10000, distanceInterval: 10 },
        (loc) => {
          setLocation(loc.coords);
          set(ref(db, `locations/${auth.currentUser.uid}`), loc.coords);
        }
      );
      // Fetch staff name and tokens
      const staffDoc = await getDoc(doc(firestore, 'users', auth.currentUser.uid));
      const staffData = staffDoc.data();
      const staffName = `${staffData.firstName} ${staffData.lastName}`;
      const patientDoc = await getDoc(doc(firestore, 'users', selectedPatient.id));
      const patientToken = patientDoc.data().pushToken;
      const poaId = patientDoc.data().poa;
      let poaToken = null;
      if (poaId) {
        const poaDoc = await getDoc(doc(firestore, 'users', poaId));
        poaToken = poaDoc.data().pushToken;
      }
      const message = `${staffName} is on the way! Press here to track their progress`;
      if (patientToken) {
        console.log('Sending Send Location notification to patient');
        sendPushNotification(patientToken, message, { screen: 'PatientTracking', staffId: auth.currentUser.uid });
      }
      if (poaToken) {
        console.log('Sending Send Location notification to POA');
        sendPushNotification(poaToken, message, { screen: 'PatientTracking', staffId: auth.currentUser.uid });
      }
      setLocationSent(true);
    } else {
      Alert.alert('Error', 'No location or patient selected');
    }
  };

  const stopSharing = () => {
    if (locationWatchSub.current) {
      locationWatchSub.current.remove();
      locationWatchSub.current = null;
    }
    set(ref(db, `locations/${auth.currentUser.uid}`), null);
    setLocationSent(false);
  };

  const startInAppNavigation = async () => {
    setLastInstruction(''); // Clear last instruction on start
    if (location && patientLocation) {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${location.latitude},${location.longitude}&destination=${patientLocation.latitude},${patientLocation.longitude}&mode=driving&key=${API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.routes.length > 0) {
        const route = data.routes[0];
        const polyline = decodePolyline(route.overview_polyline.points);
        setRouteCoordinates(polyline);
        setDirectionsSteps(route.legs[0].steps);
        setNavigationMode(true);
        setCurrentStepIndex(0);
        setAnnouncedSteps(new Set());
        if (!muteVoice) {
          Speech.speak('Navigation started.');
        }
        if (route.legs[0].steps.length > 0) {
          const { instruction } = getEffectiveInstruction(0);
          if (!muteVoice) {
            Speech.speak(instruction);
          }
          setAnnouncedSteps(new Set([0]));
        }
        // Start watching location for navigation
        const watchSub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.High, timeInterval: 1000, distanceInterval: 10 }, (loc) => {
          setLocation(loc.coords);
          console.log(`Current heading: ${loc.coords.heading}`); // Debug log for heading
          setMarkerHeading(loc.coords.heading || 0);
          // Check current step
          let currentIndex = currentStepIndex;
          for (let i = currentStepIndex; i < directionsSteps.length; i++) {
            const step = directionsSteps[i];
            const stepStart = step.start_location;
            const stepEnd = step.end_location;
            const distToEnd = calculateDistance(loc.coords, { latitude: stepEnd.lat, longitude: stepEnd.lng });
            const distToStart = calculateDistance(loc.coords, { latitude: stepStart.lat, longitude: stepStart.lng });
            console.log(`Checking step ${i}: distToEnd ${distToEnd.toFixed(0)}m, distToStart ${distToStart.toFixed(0)}m`);
            if (distToEnd < 150 && distToEnd < distToStart) { // Lower threshold, closer to end than start
              currentIndex = i + 1;
              if (currentIndex < directionsSteps.length && !announcedSteps.has(currentIndex)) {
                const stepAtNew = directionsSteps[currentIndex];
                const man = (stepAtNew.maneuver || '').toLowerCase();
                let instr;
                if (!man || man === 'straight' || man.includes('toward')) {
                  instr = getEffectiveInstruction(currentIndex).instruction;
                } else {
                  instr = stepAtNew.html_instructions.replace(/<[^>]*>/g, '');
                }
                if (!muteVoice && instr !== lastInstruction) {
                  Speech.speak(instr);
                  setLastInstruction(instr);
                }
                setAnnouncedSteps(prev => new Set([...prev, currentIndex]));
                console.log(`Advanced to step ${currentIndex}`); // Debug log for advancement
              }
            } else {
              break;
            }
          }
          setCurrentStepIndex(currentIndex);
          if (currentIndex >= directionsSteps.length && calculateDistance(loc.coords, patientLocation) < 50) {
            Alert.alert('Arrival', 'You have arrived at the destination');
            endNavigation();
          }
          // Skip animation if user overrode view
          if (!userOverrodeView && mapRef.current) {
            // New: Dynamic offset based on heading for consistent position
            const headingRad = (loc.coords.heading || 0) * Math.PI / 180;
            const offsetDist = 0.0008; // Base offset ~89m
            const latOffset = offsetDist * Math.cos(headingRad);
            const lonOffset = offsetDist * Math.sin(headingRad) / Math.cos(loc.coords.latitude * Math.PI / 180); // Adjust for longitude convergence
            mapRef.current.animateCamera({
              center: {
                latitude: loc.coords.latitude + latOffset,
                longitude: loc.coords.longitude + lonOffset,
              },
              heading: loc.coords.heading || 0,
              pitch: isAerialView ? 0 : 45,
              zoom: 18,
              altitude: 100,
            }, { duration: 1000 });
          }
          const { maneuver } = getEffectiveInstruction(currentIndex); // Use effective for arrow
          setCurrentManeuver(maneuver);
          // If user zoomed out, zoom back after 30s on movement
          if (userZoomedOut) {
            if (zoomBackTimer.current) clearTimeout(zoomBackTimer.current);
            zoomBackTimer.current = setTimeout(() => {
              setUserZoomedOut(false);
              mapRef.current.animateCamera({
                center: {
                  latitude: loc.coords.latitude + 0.0008,
                  longitude: loc.coords.longitude,
                },
                heading: loc.coords.heading || 0,
                pitch: isAerialView ? 0 : 45,
                zoom: 18,
                altitude: 100,
              }, { duration: 1000 });
            }, 30000);
          }
        });
        setWatchingLocation(watchSub);
        // Refetch route every 30 seconds for traffic
        refetchInterval.current = setInterval(fetchRoute, 30000);
      }
    }
  };

  useEffect(() => {
    if (navigationMode && mapReady && !hasAppliedAerial) {
      setIsAerialView(false);
      if (mapRef.current) {
        setTimeout(() => {
          mapRef.current.animateCamera({
            center: {
              latitude: location.latitude + 0.0008,
              longitude: location.longitude,
            },
            pitch: 45,
            heading: 0,
            zoom: 18,
            altitude: 100,
          }, { duration: 1000 });
        }, 1000);
        setHasAppliedAerial(true);
      }
    }
  }, [navigationMode, mapReady, location, hasAppliedAerial]);

  const endNavigation = () => {
    setLastInstruction(''); // Clear last instruction on end
    setNavigationMode(false);
    setRouteCoordinates([]);
    setDirectionsSteps([]);
    setCurrentStepIndex(0);
    setAnnouncedSteps(new Set());
    setHasAppliedAerial(false); // Reset for next time
    setLocationSent(false);
    setUserZoomedOut(false);
    setUserOverrodeView(false); // New: Reset override
    if (watchingLocation) {
      watchingLocation.remove();
      setWatchingLocation(null);
    }
    if (refetchInterval.current) {
      clearInterval(refetchInterval.current);
      refetchInterval.current = null;
    }
    if (zoomBackTimer.current) {
      clearTimeout(zoomBackTimer.current);
    }
  };

  useEffect(() => {
    return () => {
      if (locationWatchSub.current) {
        locationWatchSub.current.remove();
      }
    };
  }, []);

  const openExternalNavigation = () => {
    if (patientLocation) {
      const url = `https://www.google.com/maps/dir/?api=1&origin=${location.latitude},${location.longitude}&destination=${patientLocation.latitude},${patientLocation.longitude}`;
      Linking.openURL(url);
    }
  };

  const toggleMapType = () => {
    setMapType(mapType === 'standard' ? 'hybrid' : 'standard');
  };

  const toggleViewMode = () => {
    setIsAerialView(!isAerialView);
    setUserOverrodeView(true); // New: Mark as user override
    if (mapRef.current) {
      mapRef.current.animateCamera({
        center: {
          latitude: location.latitude + 0.0008,
          longitude: location.longitude,
        },
        pitch: !isAerialView ? 0 : 45, // Flip for toggle
        heading: location.heading || 0,
        zoom: 18,
        altitude: 100,
      }, { duration: 1000 });
    }
  };

  const toggleMuteVoice = () => {
    setMuteVoice(!muteVoice);
    if (!muteVoice) Speech.stop(); // New: Clear queue when muting
  };

  const centerOnLocation = () => {
    if (location && mapRef.current) {
      mapRef.current.animateCamera({
        center: {
          latitude: location.latitude + 0.0008,
          longitude: location.longitude,
        },
        heading: location.heading || 0,
        zoom: 18,
        altitude: 100,
      });
    }
  };

  const handleRegionChange = (region) => {
    if (navigationMode && region.latitudeDelta > 0.05) { // Detect manual zoom out
      setUserZoomedOut(true);
    }
  };

  const handleSelectPatient = (item) => {
    setSelectedPatient(item);
    setLocationSent(false);
  };

  const effective = getEffectiveInstruction(currentStepIndex);
  let directionArrow = '↑';
  const maneuver = effective.maneuver.toLowerCase(); // Use effective maneuver for arrow
  if (maneuver.includes('roundabout') || maneuver.includes('circle')) { // Circle for roundabout
    directionArrow = '↺'; // Circle for roundabout
  } else if (maneuver.includes('left') || maneuver.endsWith('-left') || maneuver.includes('ramp-left') || maneuver.includes('roundabout-left')) {
    directionArrow = '↰'; // Curved left
  } else if (maneuver.includes('right') || maneuver.endsWith('-right') || maneuver.includes('ramp-right') || maneuver.includes('roundabout-right')) {
    directionArrow = '↱'; // Curved right
  }

  return (
    <View style={styles.container}>
      {navigationMode && (
        <View style={styles.stepsContainerTop}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ backgroundColor: 'white', borderRadius: 5, padding: 5, marginRight: 10 }}>
              <Text style={{ fontSize: 72, fontWeight: 'bold' }}>{directionArrow}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.stepItem}>{effective?.instruction || 'Follow the route'}</Text>
              {effective?.distanceText && <Text style={styles.stepDistance}>{effective.distanceText}</Text>}
            </View>
          </View>
        </View>
      )}
      {!navigationMode && isStaff ? (
        <View style={styles.dropdownContainer}>
          {AutocompleteDropdown ? (
            <AutocompleteDropdown
              clearOnFocus={false}
              closeOnBlur={true}
              closeOnSubmit={false}
              onSelectItem={handleSelectPatient}
              dataSet={patients}
              textInputProps={{ placeholder: 'Select Patient' }}
            />
          ) : (
            <FlatList
              data={patients}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.patientItem} onPress={() => handleSelectPatient(item)}>
                  <Text>{item.title}</Text>
                </TouchableOpacity>
              )}
            />
          )}
        </View>
      ) : null}
      <View style={[styles.mapSection, { paddingTop: 120 }]}> {/* Updated: Increased for banner space */}
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={{
            latitude: location ? location.latitude : 37.78825,
            longitude: location ? location.longitude : -122.4324,
            latitudeDelta: 0.0922,
            longitudeDelta: 0.0421,
          }}
          provider={mapProvider}
          showsUserLocation={false}
          followsUserLocation={false}
          showsMyLocationButton={false}
          mapType={mapType}
          showsTraffic={navigationMode}
          pitchEnabled={true}
          rotateEnabled={true}
          onMapReady={() => {
            console.log('Map ready');
            setMapReady(true);
          }}
          onRegionChangeComplete={handleRegionChange}
        >
          {isStaff ? (
            <>
              {location && (
                <Marker
                  coordinate={location}
                  title="My Location"
                  anchor={{ x: 0.5, y: 0.5 }}
                  flat={true}
                >
                  <View style={styles.markerContainer}>
                    <MaterialIcons 
                      name="navigation" 
                      size={36} 
                      color="#FF0000" 
                      style={[
                        styles.markerArrow, 
                        { transform: [{ rotate: `${markerHeading + (isAerialView ? 0 : -10)}deg` }] } // Updated: -10 for straighter alignment in 3D
                      ]} 
                    />
                  </View>
                </Marker>
              )}
              {patientLocation && (
                <Marker
                  coordinate={patientLocation}
                  title="Patient Location"
                  pinColor="#FF0000"
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
              strokeWidth={6}
            />
          )}
        </MapView>
        <TouchableOpacity style={styles.mapOverlay} onPress={toggleMapType}>
          {mapType === 'standard' ? <MaterialIcons name="satellite" size={30} color="#000000" /> : <MaterialIcons name="map" size={30} color="#000000" />}
        </TouchableOpacity>
        {navigationMode && (
          <TouchableOpacity style={styles.toggleViewContainer} onPress={toggleViewMode}>
            {isAerialView ? <MaterialIcons name="3d-rotation" size={30} color="#000000" /> : <MaterialIcons name="layers" size={30} color="#000000" />}
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.myLocationContainer} onPress={centerOnLocation}>
          <MaterialIcons name="my-location" size={30} color="#000000" />
        </TouchableOpacity>
        {locationSent && selectedPatient && patientLocation && (
          <TouchableOpacity style={styles.googleMapsIcon} onPress={openExternalNavigation}>
            <Image source={require('../assets/google-maps-icon.png')} style={{ width: 40, height: 40 }} />
          </TouchableOpacity>
        )}
        {navigationMode && (
          <TouchableOpacity style={styles.muteToggleContainer} onPress={toggleMuteVoice}>
            {muteVoice ? <MaterialIcons name="volume-off" size={30} color="#000000" /> : <MaterialIcons name="volume-up" size={30} color="#000000" />}
          </TouchableOpacity>
        )}
      </View>
      {isStaff && (
        <View style={styles.buttonSection}>
          {selectedPatient && !patientLocation && (
            <Text style={styles.errorText}>Patient location not available</Text>
          )}
          <View style={styles.buttonContainer}>
            {!locationSent && (
              <TouchableOpacity style={styles.customButton} onPress={sendLocation}>
                <Text style={styles.buttonText}>Send Location</Text>
              </TouchableOpacity>
            )}
            {locationSent && selectedPatient && patientLocation && !navigationMode && (
              <>
                <TouchableOpacity style={styles.customButtonNavigation} onPress={startInAppNavigation}>
                  <Text style={styles.buttonText}>Start Navigation</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.customButton} onPress={stopSharing}>
                  <Text style={styles.buttonText}>Stop Sharing</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}
      {navigationMode && eta !== 'N/A' && (
        <View style={styles.bottomContainer}>
          <Text style={styles.etaBottom}>{eta}</Text>
          <TouchableOpacity onPress={endNavigation} style={styles.endButton}>
            <Text style={styles.endButtonText}>X</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F0F0', padding: 10 },
  mapSection: { flex: 1, width: '100%', borderRadius: 10, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, position: 'relative' },
  map: { flex: 1 },
  mapOverlay: { position: 'absolute', top: 180, right: 10, zIndex: 10, backgroundColor: 'white', width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#000000', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 3 },
  toggleViewContainer: { position: 'absolute', top: 120, left: 10, zIndex: 10, backgroundColor: 'white', width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#000000', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 3 },
  myLocationContainer: { position: 'absolute', top: 120, right: 10, zIndex: 10, backgroundColor: 'white', width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#000000', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 3 },
  googleMapsIcon: { position: 'absolute', bottom: 10, right: 10, zIndex: 10, backgroundColor: 'white', width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 3 },
  muteToggleContainer: { position: 'absolute', top: 180, left: 10, zIndex: 10, backgroundColor: 'white', width: 50, height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#000000', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.3, shadowRadius: 2, elevation: 3 },
  buttonSection: { marginTop: 10, padding: 10, marginBottom: 20 },
  buttonContainer: { flexDirection: 'row', justifyContent: 'space-around', borderRadius: 8 },
  customButton: { backgroundColor: '#A7C7E7', padding: 10, borderRadius: 20, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 8, flex: 1, marginHorizontal: 5 },
  customButtonNavigation: { backgroundColor: '#B2D8B2', padding: 10, borderRadius: 20, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 8, flex: 1, marginHorizontal: 5 },
  buttonText: { color: '#FFFFFF', fontWeight: 'bold' },
  loadingText: { fontSize: 18, color: '#B2D8B2', textAlign: 'center' },
  patientItem: { padding: 10, borderBottomWidth: 1, borderBottomColor: '#A7C7E7' },
  eta: { fontSize: 18, color: '#000000', textAlign: 'center', marginBottom: 10 },
  errorText: { fontSize: 16, color: '#FF0000', textAlign: 'center', marginBottom: 10 },
  dropdownContainer: { marginBottom: 20 },
  stepsContainerTop: { position: 'absolute', top: 0, left: 0, right: 0, padding: 10, backgroundColor: 'rgba(255,255,255,0.8)', zIndex: 1, borderBottomWidth: 1, borderColor: '#A7C7E7' },
  stepItem: { padding: 5, fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
  stepDistance: { fontSize: 14, color: '#000000', textAlign: 'center' }, // Updated: Black font
  markerContainer: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  markerArrow: { },
  bottomContainer: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', padding: 10, backgroundColor: 'rgba(255,255,255,0.8)', alignItems: 'center' },
  etaBottom: { fontSize: 20, color: '#000000', textAlign: 'center', fontWeight: 'bold', flex: 1 },
  endButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#FF0000', alignItems: 'center', justifyContent: 'center' },
  endButtonText: { color: '#FFFFFF', fontSize: 24, fontWeight: 'bold' },
});