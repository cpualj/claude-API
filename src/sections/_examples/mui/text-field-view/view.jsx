import Box from '@mui/material/Box';

import { ComponentLayout } from '../../layout';
import { TextFieldVariant } from './text-field-variant';

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
    name: 'Outlined',
    component: (
      <Box sx={boxStyles}>
        <TextFieldVariant variant="outlined" />
      </Box>
    ),
  },
  {
    name: 'Filled',
    component: (
      <Box sx={boxStyles}>
        <TextFieldVariant variant="filled" />
      </Box>
    ),
  },
  {
    name: 'Standard',
    component: (
      <Box sx={boxStyles}>
        <TextFieldVariant variant="standard" />
      </Box>
    ),
  },
];

// ----------------------------------------------------------------------

export function TextFieldView() {
  return (
    <ComponentLayout
      sectionData={DEMO_COMPONENTS}
      heroProps={{
        heading: 'Text field',
        moreLinks: ['https://mui.com/material-ui/react-text-field/'],
      }}
    />
  );
}
