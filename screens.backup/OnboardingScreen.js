import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useThemeStyles } from '../theme'; // Removed 'theme' import since it's not used directly
export default function OnboardingScreen({ navigation }) {
const styles = useThemeStyles();
const fadeAnim = useState(new Animated.Value(0))[0];
useEffect(() => {
Animated.timing(fadeAnim, {
toValue: 1,
duration: 800,
useNativeDriver: true,
}).start();
}, []);
return (
<view style="{styles.container}">
&#x3C;Animated.View style={{ opacity: fadeAnim, alignItems: 'center' }}>
&#x3C;MaterialIcons name="favorite" size={80} color={styles.primary} style={{ marginBottom: 30 }} /> {/* Replaced theme.spacing.large with 30 for fallback <em>/}
<text style="{styles.title}">Welcome to CareBeacon</text>
&#x3C;Text style={[styles.label, { fontSize: 20, textAlign: 'center', marginBottom: 30 }]}>Guiding Care to Your Door {/</em> Replaced theme.spacing.large with 30 */}
&#x3C;Pressable style={styles.button} onPress={() => navigation.navigate('Login')}>
&#x3C;MaterialIcons name="arrow-forward" size={20} color="#FFFFFF" style={{ marginRight: 10 }} />
<text style="{styles.buttonText}">Get Started</text>

&#x3C;/Animated.View>
</view>
);
}