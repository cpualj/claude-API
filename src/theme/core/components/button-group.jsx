import { varAlpha } from 'minimal-shared/utils';

import { buttonGroupClasses } from '@mui/material/ButtonGroup';

// ----------------------------------------------------------------------

const COLORS = ['primary', 'secondary', 'info', 'success', 'warning', 'error'];

/* **********************************************************************
 * 🗳️ Variants
 * **********************************************************************/
const containedVariants = [
  {
    props: (props) => props.variant === 'contained' && props.color === 'inherit',
    style: ({ theme }) => ({
      borderColor: theme.vars.palette.shared.buttonOutlined,
    }),
  },
  ...COLORS.map((colorKey) => ({
    props: (props) => props.variant === 'contained' && props.color === colorKey,
    style: ({ theme }) => ({
      borderColor: varAlpha(theme.vars.palette[colorKey].darkChannel, 0.48),
    }),
  })),
];

const textVariants = [
  {
    props: (props) => props.variant === 'text' && props.color === 'inherit',
    style: ({ theme }) => ({
      borderColor: theme.vars.palette.shared.buttonOutlined,
    }),
  },
  ...COLORS.map((colorKey) => ({
    props: (props) => props.variant === 'text' && props.color === colorKey,
    style: ({ theme }) => ({
      borderColor: varAlpha(theme.vars.palette[colorKey].mainChannel, 0.48),
    }),
  })),
];

const softVariants = [
  {
    props: (props) => props.variant === 'soft',
    style: { borderStyle: 'solid' },
  },
  {
    props: (props) => props.variant === 'soft' && props.color === 'inherit',
    style: ({ theme }) => ({
      borderColor: theme.vars.palette.shared.buttonOutlined,
    }),
  },
  ...COLORS.map((colorKey) => ({
    props: (props) => props.variant === 'soft' && props.color === colorKey,
    style: ({ theme }) => ({
      borderColor: varAlpha(theme.vars.palette[colorKey].darkChannel, 0.24),
      ...theme.applyStyles('dark', {
        borderColor: varAlpha(theme.vars.palette[colorKey].lightChannel, 0.24),
      }),
    }),
  })),
];

const firstButtonVariants = [
  {
    props: (props) => props.variant === 'soft' && props.orientation === 'horizontal',
    style: { borderRightWidth: 1 },
  },
  {
    props: (props) => props.variant === 'soft' && props.orientation === 'vertical',
    style: { borderBottomWidth: 1 },
  },
];

const disabledVariants = [
  {
    props: (props) => !!props.disabled,
    style: ({ theme }) => ({
      [`&.${buttonGroupClasses.disabled}`]: {
        borderColor: theme.vars.palette.action.disabledBackground,
      },
    }),
  },
];

/* **********************************************************************
 * 🧩 Components
 * **********************************************************************/
const MuiButtonGroup = {
  // ▼▼▼▼▼▼▼▼ ⚙️ PROPS ▼▼▼▼▼▼▼▼
  defaultProps: {
    disableElevation: true,
  },
  // ▼▼▼▼▼▼▼▼ 🎨 STYLE ▼▼▼▼▼▼▼▼
  styleOverrides: {
    grouped: {
      variants: [...containedVariants, ...textVariants, ...softVariants, ...disabledVariants],
    },
    firstButton: {
      variants: [...firstButtonVariants],
    },
    middleButton: {
      variants: [...firstButtonVariants],
    },
  },
};

/* **********************************************************************
 * 🚀 Export
 * **********************************************************************/
export const buttonGroup = {
  MuiButtonGroup,
};
