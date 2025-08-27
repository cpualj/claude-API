import SvgIcon from '@mui/material/SvgIcon';
import { chipClasses } from '@mui/material/Chip';

// ----------------------------------------------------------------------

const COLORS = ['primary', 'secondary', 'info', 'success', 'warning', 'error'];

/* **********************************************************************
 * ♉️ Custom icons
 * **********************************************************************/
const DeleteIcon = (props) => (
  // https://icon-sets.iconify.design/solar/close-circle-bold/
  <SvgIcon {...props}>
    <path
      fill="currentColor"
      fillRule="evenodd"
      d="M22 12c0 5.523-4.477 10-10 10S2 17.523 2 12S6.477 2 12 2s10 4.477 10 10M8.97 8.97a.75.75 0 0 1 1.06 0L12 10.94l1.97-1.97a.75.75 0 0 1 1.06 1.06L13.06 12l1.97 1.97a.75.75 0 0 1-1.06 1.06L12 13.06l-1.97 1.97a.75.75 0 0 1-1.06-1.06L10.94 12l-1.97-1.97a.75.75 0 0 1 0-1.06"
      clipRule="evenodd"
    />
  </SvgIcon>
);

/* **********************************************************************
 * 🗳️ Variants
 * **********************************************************************/
const filledVariants = [
  {
    props: (props) => props.variant === 'filled' && props.color === 'default',
    style: ({ theme }) => ({
      ...theme.mixins.filledStyles(theme, 'inherit', { hover: true }),
    }),
  },
];

const outlinedVariants = [
  {
    props: (props) => props.variant === 'outlined' && props.color === 'default',
    style: ({ theme }) => ({
      borderColor: theme.vars.palette.shared.buttonOutlined,
    }),
  },
];

const softVariants = [
  {
    props: (props) => props.variant === 'soft' && props.color === 'default',
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

const avatarVariants = [
  ...COLORS.map((colorKey) => ({
    props: (props) => props.color === colorKey,
    style: ({ theme }) => ({
      color: theme.vars.palette[colorKey].lighter,
      backgroundColor: theme.vars.palette[colorKey].dark,
    }),
  })),
];

const sizeVariants = [
  {
    props: (props) => props.size === 'small',
    style: ({ theme }) => ({
      borderRadius: theme.shape.borderRadius,
    }),
  },
  {
    props: (props) => props.size === 'medium',
    style: ({ theme }) => ({
      borderRadius: theme.shape.borderRadius * 1.25,
    }),
  },
];

const disabledVariants = [
  {
    props: (props) => !!props.disabled,
    style: ({ theme }) => ({
      [`&.${chipClasses.disabled}`]: {
        color: theme.vars.palette.action.disabled,
        opacity: 1,
        [`&:not(.${chipClasses.outlined})`]: {
          backgroundColor: theme.vars.palette.action.disabledBackground,
        },
        [`&.${chipClasses.outlined}`]: {
          borderColor: theme.vars.palette.action.disabledBackground,
        },
        [`& .${chipClasses.avatar}`]: {
          color: theme.vars.palette.action.disabled,
          backgroundColor: theme.vars.palette.action.disabledBackground,
        },
      },
    }),
  },
];

/* **********************************************************************
 * 🧩 Components
 * **********************************************************************/
const MuiChip = {
  // ▼▼▼▼▼▼▼▼ ⚙️ PROPS ▼▼▼▼▼▼▼▼
  defaultProps: {
    deleteIcon: <DeleteIcon />,
  },
  // ▼▼▼▼▼▼▼▼ 🎨 STYLE ▼▼▼▼▼▼▼▼
  styleOverrides: {
    root: {
      variants: [
        ...filledVariants,
        ...outlinedVariants,
        ...softVariants,
        ...sizeVariants,
        ...disabledVariants,
      ],
    },
    label: ({ theme }) => ({
      fontWeight: theme.typography.fontWeightMedium,
    }),
    avatar: {
      variants: [...avatarVariants],
    },
    icon: {
      color: 'currentColor',
    },
    deleteIcon: {
      opacity: 0.48,
      color: 'currentColor',
      '&:hover': { opacity: 1, color: 'currentColor' },
    },
  },
};

/* **********************************************************************
 * 🚀 Export
 * **********************************************************************/
export const chip = {
  MuiChip,
};
