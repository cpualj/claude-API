import { varAlpha } from 'minimal-shared/utils';

// ----------------------------------------------------------------------

const COLORS = ['primary', 'secondary', 'info', 'success', 'warning', 'error'];

const DIMENSIONS = {
  small: { height: 30, paddingLeft: 8, paddingRight: 8 },
  medium: { paddingLeft: 12, paddingRight: 12 },
  large: { height: 48, paddingLeft: 16, paddingRight: 16 },
  smallText: { paddingLeft: 4, paddingRight: 4 },
  mediumText: { paddingLeft: 8, paddingRight: 8 },
  largeText: { paddingLeft: 10, paddingRight: 10 },
};

/* **********************************************************************
 * 🗳️ Variants
 * **********************************************************************/
const containedVariants = [
  {
    props: (props) => props.variant === 'contained' && props.color === 'inherit',
    style: ({ theme }) => ({
      ...theme.mixins.filledStyles(theme, 'inherit', {
        hover: {
          boxShadow: theme.vars.customShadows.z8,
        },
      }),
    }),
  },
  ...COLORS.map((colorKey) => ({
    props: (props) => props.variant === 'contained' && props.color === colorKey,
    style: ({ theme }) => ({
      '&:hover': {
        boxShadow: theme.vars.customShadows[colorKey],
      },
    }),
  })),
];

const outlinedVariants = [
  {
    props: (props) => props.variant === 'outlined',
    style: {
      '&:hover': {
        borderColor: 'currentColor',
        boxShadow: '0 0 0 0.75px currentColor',
      },
    },
  },
  {
    props: (props) => props.variant === 'outlined' && props.color === 'inherit',
    style: ({ theme }) => ({
      borderColor: theme.vars.palette.shared.buttonOutlined,
      '&:hover': {
        backgroundColor: theme.vars.palette.action.hover,
      },
    }),
  },
  ...COLORS.map((colorKey) => ({
    props: (props) => props.variant === 'outlined' && props.color === colorKey,
    style: ({ theme }) => ({
      borderColor: varAlpha(theme.vars.palette[colorKey].mainChannel, 0.48),
    }),
  })),
];

const textVariants = [
  {
    props: (props) => props.variant === 'text' && props.color === 'inherit',
    style: ({ theme }) => ({
      '&:hover': {
        backgroundColor: theme.vars.palette.action.hover,
      },
    }),
  },
];

const softVariants = [
  {
    props: (props) => props.variant === 'soft' && props.color === 'inherit',
    style: ({ theme }) => ({
      ...theme.mixins.softStyles(theme, 'inherit', { hover: true }),
    }),
  },
  ...COLORS.map((colorKey) => ({
    props: (props) => props.variant === 'soft' && props.color === colorKey,
    style: ({ theme }) => ({
      ...theme.mixins.softStyles(theme, colorKey, { hover: true }),
    }),
  })),
];

const sizeVariants = [
  {
    props: (props) => props.size === 'small',
    style: { ...DIMENSIONS.small },
  },
  {
    props: (props) => props.size === 'medium',
    style: { ...DIMENSIONS.medium },
  },
  {
    props: (props) => props.size === 'large',
    style: { ...DIMENSIONS.large },
  },
  {
    props: (props) => props.size === 'small' && props.variant === 'text',
    style: { ...DIMENSIONS.smallText },
  },
  {
    props: (props) => props.size === 'medium' && props.variant === 'text',
    style: { ...DIMENSIONS.mediumText },
  },
  {
    props: (props) => props.size === 'large' && props.variant === 'text',
    style: { ...DIMENSIONS.largeText },
  },
];

const disabledVariants = [
  {
    props: (props) => (!!props.loading || !!props.disabled) && props.variant === 'soft',
    style: ({ theme }) => ({
      backgroundColor: theme.vars.palette.action.disabledBackground,
    }),
  },
];

/* **********************************************************************
 * 🧩 Components
 * **********************************************************************/
const MuiButtonBase = {
  // ▼▼▼▼▼▼▼▼ 🎨 STYLE ▼▼▼▼▼▼▼▼
  styleOverrides: {
    root: ({ theme }) => ({
      fontFamily: theme.typography.fontFamily,
    }),
  },
};

const MuiButton = {
  // ▼▼▼▼▼▼▼▼ ⚙️ PROPS ▼▼▼▼▼▼▼▼
  defaultProps: {
    color: 'inherit',
    disableElevation: true,
  },
  // ▼▼▼▼▼▼▼▼ 🎨 STYLE ▼▼▼▼▼▼▼▼
  styleOverrides: {
    root: {
      variants: [
        ...containedVariants,
        ...outlinedVariants,
        ...textVariants,
        ...softVariants,
        ...sizeVariants,
        ...disabledVariants,
      ],
    },
  },
};

/* **********************************************************************
 * 🚀 Export
 * **********************************************************************/
export const button = {
  MuiButton,
  MuiButtonBase,
};
