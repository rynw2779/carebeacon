"use strict";

import React, { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { withFadeAnimation } from './HOC/withFadeAnimation';
import { jsx as _jsx } from "react/jsx-runtime";
export const NothingFound = /*#__PURE__*/memo(({
  ...props
}) => {
  const EL = withFadeAnimation(() => /*#__PURE__*/_jsx(View, {
    style: {
      ...styles.container
    },
    children: /*#__PURE__*/_jsx(Text, {
      style: styles.text,
      children: props.emptyResultText || 'Nothing found'
    })
  }), {});
  return /*#__PURE__*/_jsx(EL, {});
});
const styles = StyleSheet.create({
  container: {
    padding: 10
  },
  text: {
    textAlign: 'center'
  }
});
//# sourceMappingURL=NothingFound.js.map