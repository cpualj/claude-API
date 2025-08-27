import { varAlpha } from 'minimal-shared/utils';

import { switchClasses } from '@mui/material/Switch';

// ----------------------------------------------------------------------

const DIMENSIONS = {
  small: { thumb: 10, track: 16, trackRadius: 8 },
  medium: { thumb: 14, track: 20, trackRadius: 10 },
};

/* **********************************************************************
 * 🗳️ Variants
 * **********************************************************************/
const colorVariants = [
  {
    props: (props) => props.color === 'default',
    style: ({ theme }) => ({
      [`&.${switchClasses.checked}`]: {
        [`&+.${switchClasses.track}`]: {
          backgroundColor: theme.vars.palette.text.primary,
        },
        [`& .${switchClasses.thumb}`]: {
          ...theme.applyStyles('dark', {
            color: theme.vars.palette.grey[800],
          }),
        },
      },
    }),
  },
];

const disabledVariants = [
  {
    props: (props) => !!props.disabled,
    style: ({ theme }) => ({
      [`&.${switchClasses.disabled}`]: {
        [`&+.${switchClasses.track}`]: {
          opacity: 'var(--disabled-opacity)',
        },
        [`& .${switchClasses.thumb}`]: {
          ...theme.applyStyles('dark', {
            opacity: 'var(--disabled-opacity)',
          }),
        },
      },
    }),
  },
];

/* **********************************************************************
 * 🧩 Components
 * **********************************************************************/
const MuiSwitch = {
  // ▼▼▼▼▼▼▼▼ 🎨 STYLE ▼▼▼▼▼▼▼▼
  styleOverrides: {
    root: ({ theme }) => ({
      '--track-opacity': 1,
      '--disabled-opacity': theme.vars.palette.action.disabledOpacity,
      alignItems: 'center',
    }),
    switchBase: {
      top: 'unset',
      [`&:not(.${switchClasses.checked})`]: { transform: 'translateX(6px)' },
      [`&.${switchClasses.checked}+.${switchClasses.track}`]: { opacity: 'var(--track-opacity)' },
      variants: [...colorVariants, ...disabledVariants],
    },
    thumb: ({ theme }) => ({
      width: DIMENSIONS.medium.thumb,
      height: DIMENSIONS.medium.thumb,
      color: theme.vars.palette.common.white,
    }),
    track: ({ theme }) => ({
      opacity: 'var(--track-opacity)',
      height: DIMENSIONS.medium.track,
      borderRadius: DIMENSIONS.medium.trackRadius,
      backgroundColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.48),
    }),
    sizeSmall: {
      [`& .${switchClasses.thumb}`]: {
        width: DIMENSIONS.small.thumb,
        height: DIMENSIONS.small.thumb,
      },
      [`& .${switchClasses.track}`]: {
        height: DIMENSIONS.small.track,
        borderRadius: DIMENSIONS.small.trackRadius,
      },
    },
  },
};

/* **********************************************************************
 * 🚀 Export
 * **********************************************************************/
export const switches = {
  MuiSwitch,
};
