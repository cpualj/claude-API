import { m } from 'framer-motion';
import { upperFirst } from 'es-toolkit';

import Fab from '@mui/material/Fab';
import Box from '@mui/material/Box';
import Divider from '@mui/material/Divider';

import { Iconify } from 'src/components/iconify';
import { varTap, transitionTap } from 'src/components/animate';

import { ComponentBox } from '../../layout';

// ----------------------------------------------------------------------

const SIZES = ['small', 'medium', 'large'];
const COLORS = [
  'default',
  'inherit',
  'primary',
  'secondary',
  'info',
  'success',
  'warning',
  'error',
];

const rowStyles = {
  gap: 2,
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'center',
};

// ----------------------------------------------------------------------

export function FloatingActionButton() {
  const renderIcon = () => <Iconify icon="solar:letter-outline" width={24} />;

  const renderDivider = () => <Divider sx={{ width: 1, borderStyle: 'dashed' }} />;

  const renderVariant = (title, variant) => {
    const circularVariant = variant[0];
    const extendedVariant = variant[1];

    return (
      <ComponentBox title={title}>
        {COLORS.map((color) => (
          <Fab key={color} color={color} variant={circularVariant}>
            {renderIcon()}
          </Fab>
        ))}

        {renderDivider()}

        {COLORS.map((color) => (
          <Fab key={color} color={color} variant={extendedVariant}>
            {renderIcon()}
            {upperFirst(color)}
          </Fab>
        ))}

        {renderDivider()}

        <Box sx={rowStyles}>
          <Fab color="info" disabled variant={circularVariant}>
            {renderIcon()}
          </Fab>
          <Fab color="info" disabled variant={extendedVariant}>
            {renderIcon()}
            Disabled
          </Fab>
        </Box>

        {renderDivider()}

        <Box sx={rowStyles}>
          {SIZES.map((size) => (
            <Fab key={size} size={size} color="info" variant={circularVariant}>
              {renderIcon()}
            </Fab>
          ))}
        </Box>

        <Box sx={rowStyles}>
          {SIZES.map((size) => (
            <Fab key={size} size={size} color="info" variant={extendedVariant}>
              {renderIcon()}
              {upperFirst(size)}
            </Fab>
          ))}
        </Box>
      </ComponentBox>
    );
  };

  return (
    <>
      {renderVariant('Default', ['circular', 'extended'])}
      {renderVariant('Outlined', ['outlined', 'outlinedExtended'])}
      {renderVariant('Soft', ['soft', 'softExtended'])}

      <ComponentBox title="With Animate">
        {SIZES.map((size) => (
          <Fab
            key={size}
            component={m.button}
            whileTap={varTap()}
            transition={transitionTap()}
            variant="softExtended"
            color="info"
            size={size}
          >
            <Iconify icon="solar:letter-outline" width={24} />
            {upperFirst(size)}
          </Fab>
        ))}
      </ComponentBox>
    </>
  );
}
