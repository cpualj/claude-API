import Box from '@mui/material/Box';

import { IconButtons } from './icon-buttons';
import { ButtonGroups } from './button-groups';
import { ComponentLayout } from '../../layout';
import { ToggleButtons } from './toggle-buttons';
import { ButtonVariant } from './button-variant';
import { FloatingActionButton } from './floating-action-button';

// ----------------------------------------------------------------------

const boxStyles = {
  rowGap: 5,
  columnGap: 3,
  display: 'grid',
  gridTemplateColumns: { xs: 'repeat(1, 1fr)', md: 'repeat(2, 1fr)' },
};

// ----------------------------------------------------------------------

const DEMO_COMPONENTS = [
  {
    name: 'Contained',
    component: (
      <Box sx={boxStyles}>
        <ButtonVariant variant="contained" />
      </Box>
    ),
  },
  {
    name: 'Outlined',
    component: (
      <Box sx={boxStyles}>
        <ButtonVariant variant="outlined" />
      </Box>
    ),
  },
  {
    name: 'Text',
    component: (
      <Box sx={boxStyles}>
        <ButtonVariant variant="text" />
      </Box>
    ),
  },
  {
    name: 'Soft',
    component: (
      <Box sx={boxStyles}>
        <ButtonVariant variant="soft" />
      </Box>
    ),
  },
  {
    name: 'Icon button',
    component: (
      <Box sx={boxStyles}>
        <IconButtons />
      </Box>
    ),
  },
  {
    name: 'Fab',
    component: (
      <Box sx={boxStyles}>
        <FloatingActionButton />
      </Box>
    ),
  },
  {
    name: 'Groups',
    component: (
      <Box sx={boxStyles}>
        <ButtonGroups />
      </Box>
    ),
  },
  {
    name: 'Toggle',
    component: (
      <Box sx={boxStyles}>
        <ToggleButtons />
      </Box>
    ),
  },
];

// ----------------------------------------------------------------------

export function ButtonsView() {
  return (
    <ComponentLayout
      sectionData={DEMO_COMPONENTS}
      heroProps={{
        heading: 'Buttons',
        moreLinks: [
          'https://mui.com/material-ui/react-button/',
          'https://mui.com/material-ui/react-button-group/',
          'https://mui.com/material-ui/react-floating-action-button/',
          'https://mui.com/material-ui/react-toggle-button/',
        ],
      }}
    />
  );
}
