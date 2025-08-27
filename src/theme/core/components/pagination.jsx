import { varAlpha } from 'minimal-shared/utils';

import { paginationItemClasses } from '@mui/material/PaginationItem';

// ----------------------------------------------------------------------

const COLORS = ['primary', 'secondary', 'info', 'success', 'warning', 'error'];

/* **********************************************************************
 * 🗳️ Variants
 * **********************************************************************/
const textVariants = [
  {
    props: (props) => props.variant === 'text' && props.color === 'standard',
    style: ({ theme }) => ({
      [`&.${paginationItemClasses.selected}`]: {
        ...theme.mixins.filledStyles(theme, 'inherit', { hover: true }),
      },
    }),
  },
];

const outlinedVariants = [
  {
    props: (props) => props.variant === 'outlined',
    style: ({ theme }) => ({
      borderColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.24),
    }),
  },
  {
    props: (props) => props.variant === 'outlined' && props.color === 'standard',
    style: ({ theme }) => ({
      [`&.${paginationItemClasses.selected}`]: {
        borderColor: 'currentColor',
        backgroundColor: varAlpha(theme.vars.palette.grey['500Channel'], 0.08),
      },
    }),
  },
  ...COLORS.map((colorKey) => ({
    props: (props) => props.variant === 'outlined' && props.color === colorKey,
    style: ({ theme }) => ({
      [`&.${paginationItemClasses.selected}`]: {
        color: theme.vars.palette[colorKey].dark,
        borderColor: theme.vars.palette[colorKey].main,
        backgroundColor: varAlpha(theme.vars.palette[colorKey].mainChannel, 0.08),
        ...theme.applyStyles('dark', {
          color: theme.vars.palette[colorKey].light,
        }),
      },
    }),
  })),
];

const softVariants = [
  {
    props: (props) => props.variant === 'soft' && props.color === 'standard',
    style: ({ theme }) => ({
      [`&.${paginationItemClasses.selected}`]: {
        ...theme.mixins.softStyles(theme, 'inherit', { hover: true }),
      },
    }),
  },
  ...COLORS.map((colorKey) => ({
    props: (props) => props.variant === 'soft' && props.color === colorKey,
    style: ({ theme }) => ({
      [`&.${paginationItemClasses.selected}`]: {
        ...theme.mixins.softStyles(theme, colorKey, { hover: true }),
      },
    }),
  })),
];

const selectedVariants = [
  {
    props: (props) => !!props.selected,
    style: ({ theme }) => ({
      [`&.${paginationItemClasses.selected}`]: {
        fontWeight: theme.typography.fontWeightSemiBold,
        [`&.${paginationItemClasses.disabled}`]: {
          color: theme.vars.palette.action.disabled,
          borderColor: theme.vars.palette.action.disabledBackground,
          backgroundColor: theme.vars.palette.action.disabledBackground,
        },
      },
    }),
  },
];

/* **********************************************************************
 * 🧩 Components
 * **********************************************************************/
const MuiPaginationItem = {
  // ▼▼▼▼▼▼▼▼ 🎨 STYLE ▼▼▼▼▼▼▼▼
  styleOverrides: {
    root: {
      variants: [...textVariants, ...outlinedVariants, ...softVariants, ...selectedVariants],
    },
  },
};

/* **********************************************************************
 * 🚀 Export
 * **********************************************************************/
export const pagination = {
  MuiPaginationItem,
};
