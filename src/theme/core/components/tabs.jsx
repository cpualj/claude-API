import { tabClasses } from '@mui/material/Tab';

// ----------------------------------------------------------------------

const MuiTabs = {
  // ▼▼▼▼▼▼▼▼ ⚙️ PROPS ▼▼▼▼▼▼▼▼
  defaultProps: {
    textColor: 'inherit',
    variant: 'scrollable',
    allowScrollButtonsMobile: true,
  },
  // ▼▼▼▼▼▼▼▼ 🎨 STYLE ▼▼▼▼▼▼▼▼
  styleOverrides: {
    list: {
      variants: [
        {
          props: (props) => props.variant !== 'fullWidth',
          style: ({ theme }) => ({
            gap: theme.spacing(3),
            [theme.breakpoints.up('sm')]: {
              gap: theme.spacing(5),
            },
          }),
        },
      ],
    },
    indicator: { backgroundColor: 'currentColor' },
  },
};

const MuiTab = {
  // ▼▼▼▼▼▼▼▼ ⚙️ PROPS ▼▼▼▼▼▼▼▼
  defaultProps: {
    disableRipple: true,
    iconPosition: 'start',
  },
  // ▼▼▼▼▼▼▼▼ 🎨 STYLE ▼▼▼▼▼▼▼▼
  styleOverrides: {
    root: ({ theme }) => ({
      opacity: 1,
      minWidth: 48,
      minHeight: 48,
      padding: theme.spacing(1, 0),
      color: theme.vars.palette.text.secondary,
      fontWeight: theme.typography.fontWeightMedium,
      lineHeight: theme.typography.body2.lineHeight,
      [`&.${tabClasses.selected}`]: {
        color: theme.vars.palette.text.primary,
        fontWeight: theme.typography.fontWeightSemiBold,
      },
    }),
  },
};

/* **********************************************************************
 * 🚀 Export
 * **********************************************************************/
export const tabs = {
  MuiTab,
  MuiTabs,
};
