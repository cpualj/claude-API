import { m } from 'framer-motion';

import Tooltip from '@mui/material/Tooltip';
import IconButton from '@mui/material/IconButton';

import { Iconify } from 'src/components/iconify';
import { varTap, varHover, transitionTap } from 'src/components/animate';

import { ComponentBox } from '../../layout';

// ----------------------------------------------------------------------

const SIZES = ['small', 'medium', 'large'];
const COLORS = [
  'inherit',
  'default',
  'primary',
  'secondary',
  'info',
  'success',
  'warning',
  'error',
];

// ----------------------------------------------------------------------

export function IconButtons() {
  const renderIcon = () => <Iconify icon="solar:letter-outline" />;

  return (
    <>
      <ComponentBox title="Base">
        <IconButton color="inherit">{renderIcon()}</IconButton>
        <IconButton>{renderIcon()}</IconButton>
        <IconButton color="primary">{renderIcon()}</IconButton>
        <IconButton color="secondary">{renderIcon()}</IconButton>
        <IconButton disabled>{renderIcon()}</IconButton>
      </ComponentBox>

      <ComponentBox title="Colors">
        {COLORS.map((color) => (
          <Tooltip key={color} title={color}>
            <IconButton color={color}>{renderIcon()}</IconButton>
          </Tooltip>
        ))}
      </ComponentBox>

      <ComponentBox title="Sizes">
        {SIZES.map((size) => (
          <Tooltip key={size} title={size}>
            <IconButton size={size} color="info">
              {renderIcon()}
            </IconButton>
          </Tooltip>
        ))}
      </ComponentBox>

      <ComponentBox title="With Animate">
        {SIZES.map((size) => (
          <IconButton
            key={size}
            component={m.button}
            whileTap={varTap()}
            whileHover={varHover(1.05)}
            transition={transitionTap()}
            size={size}
            color="error"
          >
            {renderIcon()}
          </IconButton>
        ))}
      </ComponentBox>
    </>
  );
}
