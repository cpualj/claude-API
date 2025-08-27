// ----------------------------------------------------------------------

function getSlotStyles(slotStyle, props) {
  if (!slotStyle) {
    return {};
  }

  if (typeof slotStyle === 'function') {
    return props ? slotStyle(props) : slotStyle();
  }

  return slotStyle;
}

// ----------------------------------------------------------------------

export function applySettingsToComponents(components, settingsState) {
  const MuiCssBaseline = {
    styleOverrides: {
      html: {
        fontSize: settingsState?.fontSize,
      },
    },
  };

  const MuiCard = {
    styleOverrides: {
      root: (props) => {
        const { theme } = props;

        const rootStyles = getSlotStyles(components?.MuiCard?.styleOverrides?.root, props);

        const contrastStyles =
          settingsState?.contrast === 'hight'
            ? {
                boxShadow: theme.vars.customShadows.z1,
              }
            : {};

        return {
          ...rootStyles,
          ...contrastStyles,
        };
      },
    },
  };

  return {
    components: {
      MuiCssBaseline,
      MuiCard,
    },
  };
}
