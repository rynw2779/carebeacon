import { useColorScheme, Platform } from 'react-native';
import { extendTheme } from 'native-base';
export const theme = extendTheme({
// Your colors, fonts, components here...
spacing: {
small: 10,
medium: 20,
large: 30,
},
// Rest of your theme code...
});
export const getTheme = (role) => {
// Your getTheme code...
};
export const useThemeStyles = (role) => {
// Your useThemeStyles code...
};