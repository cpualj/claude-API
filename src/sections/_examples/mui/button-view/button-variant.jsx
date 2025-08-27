import { upperFirst } from 'es-toolkit';

import Box from '@mui/material/Box';
import Button from '@mui/material/Button';

import { Iconify } from 'src/components/iconify';

import { ComponentBox } from '../../layout';

// ----------------------------------------------------------------------

const SIZES = ['small', 'medium', 'large'];
const COLORS = ['inherit', 'primary', 'secondary', 'info', 'success', 'warning', 'error'];

const componentBoxStyles = {
  gap: 2,
};

const rowStyles = {
  gap: 2,
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'center',
};

// ----------------------------------------------------------------------

export function ButtonVariant({ variant }) {
  const renderIcon = () => <Iconify icon="solar:letter-outline" />;

  return (
    <>
      <ComponentBox title="Base" sx={componentBoxStyles}>
        <Button variant={variant} color="inherit">
          Inherit
        </Button>
        <Button variant={variant} color="primary">
          Primary
        </Button>
        <Button variant={variant} color="secondary">
          Secondary
        </Button>
        <Button variant={variant} color="primary" disabled>
          Disabled
        </Button>
        <Button variant={variant}>Link</Button>
      </ComponentBox>

      <ComponentBox title="Colors" sx={componentBoxStyles}>
        {COLORS.map((color) => (
          <Button key={color} variant={variant} color={color}>
            {upperFirst(color)}
          </Button>
        ))}
      </ComponentBox>

      <ComponentBox title="With icon & loading" sx={componentBoxStyles}>
        <Box sx={rowStyles}>
          <Button color="error" variant={variant} startIcon={renderIcon()}>
            Icon left
          </Button>

          <Button variant={variant} color="error" endIcon={renderIcon()}>
            Icon right
          </Button>
        </Box>

        <Box sx={rowStyles}>
          <Button loading variant={variant}>
            Submit
          </Button>

          <Button loading loadingIndicator="Loading..." variant={variant}>
            Fetch data
          </Button>
        </Box>

        <Box sx={rowStyles}>
          <Button
            loading
            size="large"
            loadingPosition="start"
            startIcon={renderIcon()}
            variant={variant}
          >
            Start
          </Button>

          <Button
            loading
            size="large"
            loadingPosition="end"
            endIcon={renderIcon()}
            variant={variant}
          >
            End
          </Button>
        </Box>
      </ComponentBox>

      <ComponentBox title="Sizes" sx={componentBoxStyles}>
        <Box sx={rowStyles}>
          {SIZES.map((size) => (
            <Button key={size} variant={variant} color="info" size={size}>
              {upperFirst(size)}
            </Button>
          ))}
        </Box>

        <Box sx={rowStyles}>
          {SIZES.map((size) => (
            <Button
              key={size}
              loading
              size={size}
              loadingPosition="start"
              startIcon={renderIcon()}
              variant={variant}
            >
              {upperFirst(size)}
            </Button>
          ))}
        </Box>

        <Box sx={rowStyles}>
          {SIZES.map((size) => (
            <Button
              key={size}
              loading
              size={size}
              loadingPosition="end"
              endIcon={renderIcon()}
              variant={variant}
            >
              {upperFirst(size)}
            </Button>
          ))}
        </Box>
      </ComponentBox>
    </>
  );
}
