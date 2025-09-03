import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Dimensions, Platform } from 'react-native';
import { auth, firestore, db } from '../firebaseConfig';
import { ref, onValue } from 'firebase/database';
import { doc, getDoc } from 'firebase/firestore';
import MapView, { Marker, PROVIDER_GOOGLE, PROVIDER_DEFAULT, Polyline } from 'react-native-maps';
import Constants from 'expo-constants';
import { MaterialIcons } from '@expo/vector-icons';

const API_KEY = Constants.expoConfig?.android?.config?.googleMaps?.apiKey || 'AIzaSyBwYAXOa4bzHLfLA4GIQxxWq5EOCi-0Q50';

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

const geocodeAddress = async (address) => {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${API_KEY}`;
  const response = await fetch(url);
  const data = await response.json();
  if (data.status === 'OK') {
    const location = data.results[0].geometry.location;
    return { latitude: location.lat, longitude: location.lng };
  } else {
    console.error('Geocoding failed:', data.status);
    return null;
  }
};

export default function PatientTrackingScreen({ route }) {
  const { staffId } = route.params;
  const [staffLocation, setStaffLocation] = useState(null);
  const [patientLocation, setPatientLocation] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [eta, setEta] = useState('N/A');
  const [staffName, setStaffName] = useState('Staff');
  const [mapReady, setMapReady] = useState(false);
  const mapRef = useRef(null);
  const [markerHeading, setMarkerHeading] = useState(0);

  useEffect(() => {
    const fetchData = async () => {
      const user = auth.currentUser;
      if (user) {
        // Fetch staff name
        const staffDoc = await getDoc(doc(firestore, 'users', staffId));
        if (staffDoc.exists()) {
          const data = staffDoc.data();
          setStaffName(`${data.firstName} ${data.lastName}`);
        }

        // Fetch home address
        const userDoc = await getDoc(doc(firestore, 'users', user.uid));
        if (userDoc.exists()) {
          const role = userDoc.data().role;
          let address;
          if (role === 'POA') {
            const linkedPatientId = userDoc.data().linkedPatient;
            if (linkedPatientId) {
              const patientDoc = await getDoc(doc(firestore, 'users', linkedPatientId));
              address = patientDoc.data().address;
            }
          } else {
            address = userDoc.data().address;
          }
          if (address) {
            const loc = await geocodeAddress(address);
            setPatientLocation(loc);
          } else {
            console.log('No address found');
          }
        }
      }
    };
    fetchData();

    // Listen to staff location
    const locationRef = ref(db, `locations/${staffId}`);
    const unsubscribe = onValue(locationRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setStaffLocation(data);
        setMarkerHeading(data.heading || 0);
      } else {
        setStaffLocation(null);
      }
    });

    return () => unsubscribe();
  }, [staffId]);

  const fetchRoute = async () => {
    if (staffLocation && patientLocation) {
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${staffLocation.latitude},${staffLocation.longitude}&destination=${patientLocation.latitude},${patientLocation.longitude}&key=${API_KEY}&traffic_model=best_guess&departure_time=now`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.routes.length > 0) {
        const route = data.routes[0];
        const polyline = decodePolyline(route.overview_polyline.points);
        setRouteCoordinates(polyline);
        const etaText = route.legs[0].duration_in_traffic?.text || route.legs[0].duration.text;
        setEta(etaText);
      }
    }
  };

  useEffect(() => {
    fetchRoute();
  }, [staffLocation, patientLocation]);

  useEffect(() => {
    if (routeCoordinates.length > 0 && mapRef.current && mapReady) {
      mapRef.current.fitToCoordinates(routeCoordinates, { edgePadding: { top: 100, right: 50, bottom: 100, left: 50 }, animated: true });
    }
  }, [routeCoordinates, mapReady]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Tracking {staffName}</Text>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={mapProvider}
        initialRegion={{
          latitude: patientLocation ? patientLocation.latitude : 37.78825,
          longitude: patientLocation ? patientLocation.longitude : -122.4324,
          latitudeDelta: 0.0922,
          longitudeDelta: 0.0421,
        }}
        pitchEnabled={false}
        rotateEnabled={false}
        showsUserLocation={false}
        showsTraffic={true}
        onMapReady={() => setMapReady(true)}
      >
        {staffLocation && (
          <Marker
            coordinate={staffLocation}
            title="Staff Location"
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
                  { transform: [{ rotate: `${markerHeading}deg` }] }
                ]} 
              />
            </View>
          </Marker>
        )}
        {patientLocation && (
          <Marker
            coordinate={patientLocation}
            title="Home"
            pinColor="#FF0000"
          />
        )}
        {routeCoordinates.length > 0 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeColor="#0000FF"
            strokeWidth={6}
          />
        )}
      </MapView>
      {eta !== 'N/A' && (
        <View style={styles.bottomContainer}>
          <Text style={styles.etaBottom}>ETA: {eta}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0F0F0', padding: 10 },
  title: { fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginVertical: 10 },
  map: { flex: 1 },
  bottomContainer: { padding: 10, backgroundColor: 'rgba(255,255,255,0.8)', alignItems: 'center' },
  etaBottom: { fontSize: 20, color: '#000000', fontWeight: 'bold' },
  markerContainer: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  markerArrow: { },
});