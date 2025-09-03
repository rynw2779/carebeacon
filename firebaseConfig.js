import { initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, getReactNativePersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';
import AsyncStorage from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: "AIzaSyAaqtJYLrbYVl5xLQeW7Yt9MIRkORMkbk8", // e.g., "AIzaSyYourAPIKeyHere1234567890"
  authDomain: "carebeaconbackend.firebaseapp.com", // Update with your project ID
  projectId: "carebeaconbackend", // Update with your project ID
  storageBucket: "gs://carebeaconbackend.firebasestorage.app", // Update with your project ID
  messagingSenderId: "921358097301", // e.g., "123456789012"
  appId: "1:921358097301:web:5bd3c0e9ffa41e986cb49c", // e.g., "1:123456789012:android:abcdef1234567890"
  databaseURL: "https://carebeaconbackend-default-rtdb.firebaseio.com" // Fixed to your actual project ID
};

const app = initializeApp(firebaseConfig);
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});
export const firestore = getFirestore(app);
export const db = getDatabase(app);
export const storage = getStorage(app);