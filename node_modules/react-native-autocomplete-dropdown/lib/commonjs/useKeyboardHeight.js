"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.useKeyboardHeight = useKeyboardHeight;
var _react = require("react");
var _reactNative = require("react-native");
function useKeyboardHeight() {
  const [keyboardHeight, setKeyboardHeight] = (0, _react.useState)(0);
  (0, _react.useEffect)(() => {
    const showSubscription = _reactNative.Keyboard.addListener('keyboardDidShow', e => setKeyboardHeight(e.endCoordinates.height));
    const hideSubscription = _reactNative.Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);
  return keyboardHeight;
}
//# sourceMappingURL=useKeyboardHeight.js.map